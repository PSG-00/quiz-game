/* Read-only-to-production audit. Every room and connection uses an isolated server. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),WebSocket=require('ws');
const port=Number(process.env.AUDIT_PORT||3132),base='http://127.0.0.1:'+port,clients=[],observations=[];
const label=process.env.AUDIT_LABEL||'latest';let serverLog='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let child,requestId=0;const requests=new Map();
async function until(fn,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await sleep(15);}throw Error('Audit timeout');}
function control(command,data={}){return new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{requests.delete(id);reject(Error('IPC timeout'));},10000);requests.set(id,{resolve,reject,timer});child.send({id,command,...data});});}
async function connect(token){const b={socket:new WebSocket('ws://127.0.0.1:'+port),messages:[],id:null};clients.push(b);b.socket.on('message',raw=>{const m=JSON.parse(raw);b.messages.push(m);if(m.type==='WELCOME'||m.type==='JOINED_ROOM')b.id=m.clientId;});b.socket.on('error',()=>{});await until(()=>b.id);if(token){b.socket.send(JSON.stringify({type:'AUTH_LIBRARY',token}));await until(()=>b.messages.some(m=>m.type==='QUIZ_LIST'));}return b;}
function send(b,message){b.socket.send(JSON.stringify(message));}
async function create(b,title='격리 점검'){send(b,{type:'CREATE_ROOM',title,nickname:'점검자',worldDelta:true,targetWinners:1,questions:[{type:'OX',question:'점검',answer:'O',timeLimit:15}]});return (await until(()=>b.messages.find(m=>m.type==='JOINED_ROOM'))).roomId;}
async function join(b,roomId){const start=b.messages.length;send(b,{type:'JOIN_ROOM',roomId,nickname:'참가자',worldDelta:true});return until(()=>b.messages.slice(start).find(m=>m.type==='JOINED_ROOM'||m.type==='ERROR'));}
async function close(b,preserve=false){if(b.socket.readyState===3)return;const closed=new Promise(r=>b.socket.once('close',r));if(!preserve&&b.socket.readyState===1)send(b,{type:'LEAVE_ROOM'});b.socket.close();await closed;}
const context=r=>({gameId:r.gameId,roundId:r.roundId});
const token=()=>crypto.randomBytes(32).toString('hex');
function note(id,status,summary,evidence){observations.push({id,status,summary,evidence});console.log(id,status,summary);}
async function main(){
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port),OX_DISABLE_PERSISTENCE:'1',OX_MAX_CONNECTIONS:'60'},silent:true});child.stdout.on('data',b=>serverLog+=b);child.stderr.on('data',b=>serverLog+=b);
 child.on('message',m=>{const q=requests.get(m.id);if(!q)return;requests.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error(m.error)):q.resolve(m.result);});
 try{
  await until(async()=>{try{return (await fetch(base+'/api/rooms')).ok;}catch{return false;}});
  const waitingToken=token(),waitingHost=await connect(waitingToken),waitingRoom=await create(waitingHost,'시작 전 자리 유지'),waitingGuest=await connect();await join(waitingGuest,waitingRoom);
  const waitingProof=waitingHost.messages.find(m=>m.type==='JOINED_ROOM').resumeToken;
  await close(waitingHost,true);const held=await until(async()=>{const r=await control('snapshot',{roomId:waitingRoom});return r?.players.find(p=>p.id===waitingHost.id)?.connected===false?r:null;});
  assert.equal(held.players.length,2);assert.equal(held.hostId,waitingHost.id);
  const waitingBack=await connect(waitingToken);send(waitingBack,{type:'RESUME_ROOM',roomId:waitingRoom,resumeToken:waitingProof,worldDelta:true});await until(()=>waitingBack.messages.some(m=>m.type==='JOINED_ROOM'));
  const waiting=await control('snapshot',{roomId:waitingRoom});assert.equal(waitingBack.id,waitingHost.id);assert.equal(waiting.hostId,waitingHost.id);assert.equal(waiting.players.length,2);
  await close(waitingBack);await close(waitingGuest);await until(async()=>!(await control('rooms')).some(r=>r.id===waitingRoom));
  note('WAITING-01','PASS','게임 시작 전 연결 종료도 자리·방장을 유지하고 같은 자리로 복귀, 모두 나가면 방 삭제',{});
  // Same identity reconnects: record current behavior, not a claim of correctness.
  const identity=token(),a=await connect(identity),roomId=await create(a),other=await connect();await join(other,roomId);
  const initial=await control('question',{roomId,question:{type:'SHORT',answer:'서울'}});send(a,{type:'SUBMIT_SHORT',answer:'서울',...context(initial)});
  await until(async()=>((await control('snapshot',{roomId})).players.find(p=>p.id===a.id)).submitted);
  const before=await control('snapshot',{roomId}),resumeToken=a.messages.find(m=>m.type==='JOINED_ROOM').resumeToken;await close(a,true);await until(async()=>(await control('snapshot',{roomId})).players.find(p=>p.id===a.id)?.connected===false);
  const resumed=await connect(identity);send(resumed,{type:'RESUME_ROOM',roomId,resumeToken,worldDelta:true});await until(()=>resumed.messages.some(m=>m.type==='JOINED_ROOM'));const after=await control('snapshot',{roomId}),p=after.players.find(p=>p.id===resumed.id);
  note('SESSION-01',p.alive&&p.submitted?'PASS':'FAIL','동일 소유 키로 재접속 시 생존·제출 상태 복구',{oldId:a.id,newId:resumed.id,before:before.players.find(p=>p.id===a.id),after:p});
  assert.equal(resumed.id,a.id);assert.equal(p.alive,true);assert.equal(p.answer,'서울');
  await close(other);await close(resumed);
  // Two valid users competing for the final seat through actual WebSockets.
  const race=[];
  for(let attempt=0;attempt<5;attempt++){
   const hostToken=token(),host=await connect(hostToken),rid=await create(host,'정원 경합 '+attempt),fill=await Promise.all(Array.from({length:48},()=>connect()));await Promise.all(fill.map(b=>join(b,rid)));
   const contenders=await Promise.all([connect(),connect()]);const results=await Promise.all(contenders.map(b=>join(b,rid)));const snap=await control('snapshot',{roomId:rid});
   assert.equal(results.filter(m=>m.type==='JOINED_ROOM').length,1);assert.equal(results.filter(m=>m.type==='ERROR').length,1);assert.equal(snap.players.length,50);race.push({accepted:1,rejected:1,total:50});
   if(attempt===0){
    await control('start',{roomId:rid});
    const proof=host.messages.find(m=>m.type==='JOINED_ROOM').resumeToken;
    await close(host,true);await until(async()=>(await control('snapshot',{roomId:rid})).players.find(p=>p.id===host.id)?.connected===false);
    const extra=await connect();assert.equal((await join(extra,rid)).type,'ERROR');await close(extra);
    const stolen=await connect(token());send(stolen,{type:'RESUME_ROOM',roomId:rid,resumeToken:proof});await until(()=>stolen.messages.some(m=>m.type==='RESUME_REJECTED'));await close(stolen);
    const back=await connect(hostToken);send(back,{type:'RESUME_ROOM',roomId:rid,resumeToken:proof});await until(()=>back.messages.some(m=>m.type==='JOINED_ROOM'));assert.equal(back.id,host.id);
    let snapshot=await control('snapshot',{roomId:rid});assert.equal(snapshot.players.length,50);assert.equal(snapshot.hostId,host.id);
    note('RESERVE-01','PASS','만원 방에서 예약 자리를 지키고 본인만 복귀, 끊긴 동안에도 방장 유지',{total:snapshot.players.length});
    await close(back,true);await until(async()=>(await control('snapshot',{roomId:rid})).players.find(p=>p.id===back.id)?.connected===false);await control('expire',{roomId:rid,playerId:back.id});
    const lateBack=await connect(hostToken);send(lateBack,{type:'RESUME_ROOM',roomId:rid,resumeToken:proof});await until(()=>lateBack.messages.some(m=>m.type==='RESUME_REJECTED'));assert.equal((await join(lateBack,rid)).type,'JOINED_ROOM');
    snapshot=await control('snapshot',{roomId:rid});assert.equal(snapshot.players.find(p=>p.id===lateBack.id).eligible,false);assert.equal(snapshot.players.find(p=>p.id===lateBack.id).alive,false);
    note('EXPIRE-01','PASS','유예 만료 후 자리는 해제되고 재입장은 관전 전용',{eligible:false,total:snapshot.players.length});await close(lateBack);
   }
   await Promise.all([host,...fill,...contenders].map(b=>close(b)));await until(async()=>!(await control('rooms')).some(r=>r.id===rid));
  }
  note('CAPACITY-01','PASS','49명에서 두 명 동시 입장: 5회 모두 한 명만 입장',race);
  // Existing account in another tab must not be destroyed by a rejected join.
  const oldToken=token(),old=await connect(oldToken),oldRoom=await create(old,'기존 방');
  const fullHost=await connect(token()),fullRoom=await create(fullHost,'가득 찬 방'),fill=await Promise.all(Array.from({length:49},()=>connect()));await Promise.all(fill.map(b=>join(b,fullRoom)));
  const newTab=await connect(oldToken),rejected=await join(newTab,fullRoom);assert.equal(rejected.type,'ERROR');await sleep(100);
  const oldGone=!(await control('rooms')).some(r=>r.id===oldRoom),closed=old.socket.readyState===3;note('JOIN-01',oldGone||closed?'FAIL':'PASS','새 탭에서 만원 방 입장 실패 시 기존 연결·방 보존',{error:rejected.message,oldConnectionClosed:closed,oldRoomDeleted:oldGone});
  assert.equal(oldGone,false);assert.equal(closed,false);
  await Promise.all([old,fullHost,...fill,newTab].map(b=>close(b)));
  // Same-account replacement of the only participant removes the target room.
  const soloToken=token(),solo=await connect(soloToken),soloRoom=await create(solo,'단독 방'),replacement=await connect(soloToken),joined=await join(replacement,soloRoom);
  const tracked=(await control('rooms')).some(r=>r.id===soloRoom);assert.equal(joined.type,'JOINED_ROOM');note('SESSION-02',tracked?'PASS':'FAIL','단독 방을 같은 계정 새 탭으로 교체한 뒤에도 방 유지',{joined:joined.roomId,tracked});await close(replacement);
  assert.equal(tracked,true);
  // No question identity check: delayed previous-round answer is accepted now.
  const host=await connect(token()),rid=await create(host,'마감 점검'),guest=await connect();await join(guest,rid);
  const firstRound=await control('question',{roomId:rid,index:0,question:{type:'SHORT',answer:'서울'}});
  const delayed={type:'SUBMIT_SHORT',answer:'서울',...context(firstRound),questionIndex:0};
  await control('question',{roomId:rid,index:1,question:{type:'SHORT',answer:'부산'}});send(host,delayed);
  await sleep(100);
  const late=(await control('snapshot',{roomId:rid})).players.find(p=>p.id===host.id);note('ANSWER-01',late.submitted?'FAIL':'PASS','이전 문제의 지연 답안이 다음 문제에 접수되지 않음',{currentIndex:1,sentQuestionIndex:0,accepted:late.answer});
  assert.equal(late.submitted,false);
  send(host,{type:'ANSWER_EDITING',...context(firstRound)});await sleep(40);assert.equal((await control('snapshot',{roomId:rid})).players.find(p=>p.id===host.id).editing,false);
  const retry=await control('question',{roomId:rid,index:1,question:{type:'SHORT',answer:'부산'}});
  const retryAgain=await control('question',{roomId:rid,index:1,question:{type:'SHORT',answer:'부산'}});assert.notEqual(retry.roundId,retryAgain.roundId);
  send(host,{type:'SUBMIT_SHORT',answer:'부산',...context(retry)});send(host,{type:'SUBMIT_SHORT',answer:'부산',...context(retryAgain),gameId:'old-game'});await sleep(40);
  assert.equal((await control('snapshot',{roomId:rid})).players.find(p=>p.id===host.id).submitted,false);
  note('ANSWER-02','PASS','지연 수정 상태·같은 번호 재도전의 옛 답안·다른 게임 답안을 거절',{});
  const expiredRound=await control('question',{roomId:rid,question:{type:'SHORT',answer:'서울'},duration:30});await sleep(70);send(host,{type:'SUBMIT_SHORT',answer:'서울',...context(expiredRound)});await sleep(50);
  const expired=(await control('snapshot',{roomId:rid})).players.find(p=>p.id===host.id);assert.equal(expired.submitted,false);note('DEADLINE-01','PASS','서버 마감 이후 도착한 답안은 거절됨',{submitted:expired.submitted});
  const prior=await control('snapshot',{roomId:rid});send(guest,{type:'START_GAME'});send(guest,{type:'RESET_GAME'});await sleep(40);const unauthorized=await control('snapshot',{roomId:rid});assert.equal(unauthorized.gameId,prior.gameId);assert.equal(unauthorized.state,prior.state);note('HOST-01','PASS','비방장의 시작·초기화 명령은 거절됨',{});
  const invalidMessages=[null,[],42,'request',{}, {type:null}, {type:[]}];
  for(const message of invalidMessages)send(host,message);
  host.socket.send('{broken-json');send(host,{type:'MOVE',x:'not-a-number',z:'Infinity'});
  await sleep(100);let alive=false;try{alive=(await fetch(base+'/api/rooms')).status===200;}catch{}
  note('INPUT-01',alive?'PASS':'FAIL','비정상 메시지에도 서버가 종료되지 않음',{serverAlive:alive,exitCode:child.exitCode,invalidShapes:invalidMessages.length,brokenJson:true});assert.equal(alive,true);
  const chatBefore=guest.messages.filter(m=>m.type==='CHAT_MSG').length;for(let i=0;i<10;i++)send(host,{type:'CHAT',text:'빈도 점검 '+i});await sleep(100);
  const chats=guest.messages.filter(m=>m.type==='CHAT_MSG').length-chatBefore;assert.equal(chats,3);note('CHAT-01','PASS','채팅 10회 연속 발신 시 초기 허용량 3회만 방송',{sent:10,broadcast:chats});
  const viewer=await connect(),viewerJoin=await join(viewer,rid);assert.equal(viewerJoin.type,'JOINED_ROOM');
  const viewerBefore=(await control('snapshot',{roomId:rid})).players.find(p=>p.id===viewer.id),countBefore=guest.messages.filter(m=>m.type==='CHAT_MSG').length;
  send(viewer,{type:'MOVE',x:3,z:9});send(viewer,{type:'CHAT',text:'관전자 정답 유출 시도'});await sleep(80);
  const viewerAfter=(await control('snapshot',{roomId:rid})).players.find(p=>p.id===viewer.id);
  assert.equal(viewerAfter.eligible,false);assert.equal(viewerAfter.x,viewerBefore.x);assert.equal(viewerAfter.z,viewerBefore.z);assert.equal(guest.messages.filter(m=>m.type==='CHAT_MSG').length,countBefore);
  note('SPECTATOR-01','PASS','관전자의 직접 이동·채팅 패킷도 서버에서 차단',{});await close(viewer);
  // Host close and result judgement must not reset the ongoing question.
  const hostRound=await control('question',{roomId:rid,question:{type:'SHORT',answer:'서울'}});send(guest,{type:'SUBMIT_SHORT',answer:'서울',...context(hostRound)});
  await until(async()=>(await control('snapshot',{roomId:rid})).players.find(p=>p.id===guest.id).submitted);
  const ongoing=await control('snapshot',{roomId:rid});await close(host,true);
  const inherited=await until(async()=>{const r=await control('snapshot',{roomId:rid});return r.players.find(p=>p.id===host.id)?.connected===false?r:null;});
  assert.equal(inherited.hostId,host.id);
  assert.equal(inherited.gameId,ongoing.gameId);assert.equal(inherited.end,ongoing.end);assert.equal(inherited.state,'QUESTION');assert.equal(inherited.players.find(p=>p.id===guest.id).answer,'서울');
  note('HOST-02','PASS','진행 중 방장 연결 종료 후에도 방장 자리 유지(만료 시 승계), 문제·마감·답안 유지',{hostId:inherited.hostId,state:inherited.state,answer:inherited.players.find(p=>p.id===guest.id).answer});
  const firstJudge=await control('judge',{roomId:rid}),secondJudge=await control('judge',{roomId:rid});
  assert.deepEqual(secondJudge.players,firstJudge.players);assert.equal(secondJudge.state,firstJudge.state);
  note('JUDGE-01','PASS','같은 문제 판정을 두 번 호출해도 결과·생존 상태 유지',{state:firstJudge.state,result:firstJudge.players[0].result});
  assert.equal((await control('expire',{roomId:rid,playerId:host.id})).hostId,guest.id);await close(guest);
  // A RESUME that sat in a stalled connection must not evict the newer one holding the seat.
  const staleToken=token(),staleHost=await connect(staleToken),staleRoom=await create(staleHost,'지연 복귀 점검'),staleGuest=await connect();await join(staleGuest,staleRoom);
  const staleProof=staleHost.messages.find(m=>m.type==='JOINED_ROOM').resumeToken,older=await connect(staleToken),newer=await connect(staleToken);
  send(newer,{type:'RESUME_ROOM',roomId:staleRoom,resumeToken:staleProof,worldDelta:true});await until(()=>newer.messages.some(m=>m.type==='JOINED_ROOM'));
  send(older,{type:'RESUME_ROOM',roomId:staleRoom,resumeToken:staleProof,worldDelta:true});await until(()=>older.messages.some(m=>m.type==='RESUME_REJECTED'));
  await sleep(100);assert.equal(newer.socket.readyState,1);assert.equal((await control('snapshot',{roomId:staleRoom})).players.find(p=>p.id===staleHost.id).connected,true);
  note('STALE-01','PASS','늦게 도착한 옛 연결의 복귀 요청이 새 연결의 자리를 빼앗지 않음',{});
  // A host reset during a game is refused: it would wipe the prize game in progress.
  const resetRound=await control('question',{roomId:staleRoom,question:{type:'SHORT',answer:'서울'},duration:20000});
  send(newer,{type:'RESET_GAME'});await sleep(80);
  const afterReset=await control('snapshot',{roomId:staleRoom});assert.equal(afterReset.state,'QUESTION');assert.equal(afterReset.roundId,resetRound.roundId);
  note('RESET-01','PASS','게임 중 방장의 초기화 요청은 서버가 거절',{state:afterReset.state});
  // After a stall only the newest MOVE matters: a burst over the limiter still ends at its last spot.
  await control('question',{roomId:staleRoom,question:{type:'OX',answer:'O'},duration:20000,positions:{[staleGuest.id]:{x:0,z:0}}});
  for(let i=1;i<=40;i++)send(staleGuest,{type:'MOVE',x:-i*.03,z:0});
  const settled=await until(async()=>{const p=(await control('snapshot',{roomId:staleRoom})).players.find(p=>p.id===staleGuest.id);return Math.abs(p.x+1.2)<.01?p:null;},3000);
  note('MOVE-01','PASS','제한을 넘는 이동 묶음도 마지막 위치로 반영',{x:settled.x});
  // A phone that goes silent (no messages, no pongs) is dropped within about 10 s, and its seat
  // runs 30 s from the last thing the server heard from it, not from when the server noticed.
  const silent={socket:new WebSocket('ws://127.0.0.1:'+port,{autoPong:false}),messages:[],id:null};clients.push(silent);
  silent.socket.on('error',()=>{});silent.socket.on('message',raw=>{const m=JSON.parse(raw);silent.messages.push(m);if(m.type==='WELCOME'||m.type==='JOINED_ROOM')silent.id=m.clientId;});
  await until(()=>silent.id);await join(silent,staleRoom);const lastHeard=Date.now();
  const dropped=await until(async()=>{const p=(await control('snapshot',{roomId:staleRoom})).players.find(p=>p.id===silent.id);return p?.connected===false?p:null;},16000);
  const noticedAfter=Date.now()-lastHeard,heldMs=dropped.until-lastHeard;
  assert.ok(noticedAfter>=9000&&noticedAfter<=13000,'감지 '+noticedAfter);assert.ok(Math.abs(heldMs-30000)<1500,'기한 '+heldMs);
  note('SILENT-01','PASS','응답 없는 연결은 약 10초 만에 끊김 처리, 자리 기한은 마지막 신호부터 30초',{noticedAfterMs:noticedAfter,heldMs});
  await control('expire',{roomId:staleRoom,playerId:silent.id});
  await Promise.all([older,newer,staleGuest].map(b=>close(b)));
  const sockets=await Promise.all(Array.from({length:60},()=>connect()));
  const over=new WebSocket('ws://127.0.0.1:'+port),closeCode=await new Promise((resolve,reject)=>{over.on('close',resolve);over.on('error',reject);});
  assert.equal(closeCode,1013);await Promise.all(sockets.map(b=>close(b)));note('SERVER-CAP-01','PASS','서버 전체 연결 상한 초과 시 새 연결 거절',{configuredLimit:60,closeCode});
  if(process.env.AUDIT_REAL_GRACE==='1'){
   const single=await connect(token()),singleRoom=await create(single,'실제 30초 만료');await control('start',{roomId:singleRoom});const started=Date.now();await close(single,true);
   await until(async()=>(await control('snapshot',{roomId:singleRoom}))?.players[0].connected===false);
   assert.ok((await control('rooms')).some(r=>r.id===singleRoom));
   await sleep(29900);await until(async()=>!(await control('rooms')).some(r=>r.id===singleRoom),5000);
   const elapsed=Date.now()-started;assert.ok(elapsed>=30000&&elapsed<35000);note('REAL-GRACE-01','PASS','실제 30초 타이머 후 마지막 예약 사용자와 방 자동 정리',{elapsedMs:elapsed});
  }
  if(alive){const remaining=await control('rooms');assert.equal(remaining.length,0);note('CLEANUP-01','PASS','격리 점검의 모든 참가자·방 정리',{remainingRooms:0});}
 }finally{for(const b of clients)b.socket.terminate();child.kill();fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/game-concurrency-audit-'+label+'.json',JSON.stringify({observations},null,2));fs.writeFileSync('artifacts/game-concurrency-server-'+label+'.log',serverLog);}
}
main().catch(e=>{console.error(e);for(const b of clients)b.socket.terminate();child?.kill();process.exitCode=1;});
