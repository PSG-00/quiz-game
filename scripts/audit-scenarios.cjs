// Production-like scenarios on an isolated server with real timers and real WebSockets: whole
// games of every question type, end and prize rules, answer edge cases, drops and resumes,
// silent phones, hosts, tabs, capacity, floods, injected phase failures, a lost timer and a
// crash followed by a restore. Each scenario has its own room; all run at once.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{fork}=require('node:child_process'),WebSocket=require('ws');
const PORT=Number(process.env.SCENARIO_PORT||3190),RESTORE_PORT=PORT+1;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hex=()=>crypto.randomBytes(32).toString('hex');
let child,serial=0;const pending=new Map(),serverLines=[],children=[];
function control(command,data={}){return new Promise((resolve,reject)=>{
 const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('server did not answer '+command));},5000);
 pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});child.send({id,command,...data});
});}
async function until(fn,timeout=15000,label='조건'){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(25);}throw Error('시간 초과: '+label);}
function check(ok,message){if(!ok)throw Error(message);}
const sameSet=(a,b)=>a.length===b.length&&[...a].sort().join()===[...b].sort().join();

// A protocol client: library auth on every connection, resume tokens, the latest room state.
class P{
 constructor(name,{token=hex(),autoPong=true,port=PORT}={}){Object.assign(this,{name,token,autoPong,port,log:[],state:null,id:null,session:null,closes:[],joins:0});}
 open(){return new Promise((resolve,reject)=>{
  const ws=this.ws=new WebSocket(`ws://127.0.0.1:${this.port}`,{autoPong:this.autoPong});let ready=false;
  const timer=setTimeout(()=>reject(Error(this.name+' 접속 시간 초과')),10000);
  ws.on('message',raw=>{
   if(this.ws!==ws||raw.subarray(0,24).toString().includes('WORLD_'))return;
   let m;try{m=JSON.parse(raw);}catch{return;}m.at=Date.now();this.log.push(m);if(this.log.length>4000)this.log.shift();
   if(m.type==='WELCOME')this.send({type:'AUTH_LIBRARY',token:this.token});
   else if(m.type==='QUIZ_LIST'&&!ready){ready=true;clearTimeout(timer);resolve(this);}
   else if(m.type==='JOINED_ROOM'){this.id=m.clientId;this.session={roomId:m.roomId,resumeToken:m.resumeToken};}
   else if(m.type==='ROOM_STATE')this.state=m;
  });
  ws.on('close',code=>{if(this.ws===ws)this.closes.push(code);});ws.on('error',()=>{});
 });}
 send(m){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(m));}
 find(pred,since=0){return this.log.find(m=>m.at>=since&&pred(m));}
 wait(pred,timeout=10000,label,since=0){return until(()=>this.find(pred,since),timeout,label||this.name);}
 async create(quiz){const t=Date.now();this.send({type:'CREATE_ROOM',nickname:this.name,...quiz});const m=await this.wait(m=>['JOINED_ROOM','ERROR'].includes(m.type),10000,'방 생성',t);if(m.type==='ERROR')throw Error(m.message);return m.roomId;}
 async join(roomId){const requestId='j'+(++this.joins),t=Date.now();this.send({type:'JOIN_ROOM',roomId,nickname:this.name,requestId});return this.wait(m=>m.type==='JOINED_ROOM'||m.type==='ERROR'&&m.requestId===requestId,10000,this.name+' 입장',t);}
 async resume(){const t=Date.now();await this.open();this.send({type:'RESUME_ROOM',...this.session});return this.wait(m=>['JOINED_ROOM','RESUME_REJECTED'].includes(m.type),10000,this.name+' 복귀',t);}
 drop(){try{this.ws.terminate();}catch{}}
 short(text,s=this.state){this.send({type:'SUBMIT_SHORT',answer:text,gameId:s.gameId,roundId:s.roundId});}
 pick(n,s=this.state){this.send({type:'SUBMIT_MULTIPLE',answer:String(n),gameId:s.gameId,roundId:s.roundId});}
 waitState(pred,timeout=25000,label){return until(()=>this.state&&pred(this.state)&&this.state,timeout,label||this.name+' 상태');}
 question(index,timeout=30000){return this.waitState(s=>s.state==='QUESTION'&&s.currentQuestion?.index===index,timeout,`${this.name} 문제 ${index+1}`);}
 states(){return this.log.filter(m=>m.type==='ROOM_STATE').map(m=>({state:m.state,index:m.currentQuestion?.index,roundId:m.roundId,at:m.at}));}
}
const OX=answer=>({type:'OX',question:'OX',answer,timeLimit:5}),SHORT=(answer,extra={})=>({type:'SHORT',question:'주관식',answer,timeLimit:5,...extra});
const BUTTON=answer=>({type:'MULTIPLE',inputMode:'BUTTON',question:'버튼',choices:['일','이','삼','사'],answer,timeLimit:5});
const ZONE=answer=>({...BUTTON(answer),inputMode:'MOVE',question:'구역'}),MINORITY=()=>({type:'MINORITY',question:'소수결',timeLimit:5});
const quiz=(targetWinners,restSeconds,questions)=>({title:'시나리오',targetWinners,restSeconds,questions});
const O={x:-4,z:0},X={x:4,z:0},ZONES={1:{x:-4,z:-2.5},2:{x:4,z:-2.5},3:{x:-4,z:2.5},4:{x:4,z:2.5}};
async function room(name,q,count,{port=PORT}={}){
 const host=await new P(name+'방장',{port}).open(),roomId=await host.create(q),players=[host];
 const guests=await Promise.all(Array.from({length:count-1},(_,i)=>new P(name+(i+1),{port}).open()));
 for(const g of guests){const r=await g.join(roomId);check(r.type==='JOINED_ROOM','입장 실패: '+r.message);players.push(g);}
 return {roomId,host,players};
}
const place=(roomId,map)=>control('patch',{roomId,players:Object.fromEntries(Object.entries(map).map(([id,pos])=>[id,{...pos}]))});
const snap=roomId=>control('snapshot',{roomId});
const aliveIds=s=>s.players.filter(p=>p.alive&&p.eligible!==false).map(p=>p.id);
async function results(p){const requestId='r'+Date.now(),t=Date.now();p.send({type:'LIST_RESULTS',requestId});return (await p.wait(m=>m.type==='RESULT_LIST',8000,'결과 목록',t)).results||[];}
// Time from the first state of one phase to the first state of the next, from one client's view.
function phaseGaps(p){const out=[];let prev=null;for(const s of p.states()){const key=s.state+':'+s.index;if(prev&&prev.key!==key)out.push({from:prev.key,to:key,ms:s.at-prev.at});if(!prev||prev.key!==key)prev={key,at:s.at};}return out;}

const scenarios=[];const scenario=(id,title,fn)=>scenarios.push({id,title,fn});

// ==================== 게임 진행·종료 규칙 ====================
scenario('G01','OX 두 문제: 틀린 사람 탈락 → 쉬는 시간 → 단독 생존자 우승, 단계 시간 정확',async()=>{
 const {roomId,players:[h,a,b,c,d,e]}=await room('G01',quiz(1,1,[OX('O'),OX('X')]),6);
 h.send({type:'START_GAME'});await h.question(0);
 await place(roomId,{[a.id]:O,[b.id]:O,[c.id]:O,[d.id]:X,[e.id]:X,[h.id]:X});
 await h.waitState(s=>s.state==='JUDGE');check(sameSet(aliveIds(await snap(roomId)),[a.id,b.id,c.id]),'1번 판정 생존자 불일치');
 await h.question(1);await place(roomId,{[a.id]:X,[b.id]:O,[c.id]:O});
 const end=await h.waitState(s=>s.state==='ENDED');check(end.winners.length===1&&end.winners[0].id===a.id,'우승자 불일치');
 const gaps=phaseGaps(h),expect={'COUNTDOWN:undefined>QUESTION:0':3500,'QUESTION:0>JUDGE:0':5000,'JUDGE:0>BREAK:0':3000,'BREAK:0>QUESTION:1':1000,'QUESTION:1>JUDGE:1':5000};
 for(const g of gaps){const want=expect[g.from+'>'+g.to];if(want!==undefined)check(Math.abs(g.ms-want)<600,`단계 시간 ${g.from}→${g.to} ${g.ms}ms (기대 ${want})`);}
 return 'gaps '+gaps.map(g=>`${g.from}→${g.to}:${g.ms}`).join(', ');
});
scenario('G02','생존자가 당첨 목표 이하가 되면 남은 문제 없이 즉시 종료, 결과 기록 1건',async()=>{
 const {players:[h,a,b,c]}=await room('G02',quiz(2,1,[SHORT('서울'),SHORT('부산'),SHORT('대구')]),4);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);b.short('서울',q);c.short('부산',q);
 const end=await h.waitState(s=>s.state==='ENDED');check(sameSet(end.winners.map(w=>w.id),[a.id,b.id]),'우승자 불일치');
 check(!h.states().some(s=>s.state==='QUESTION'&&s.index===1),'다음 문제가 열림');
 const records=(await results(h)).filter(r=>r.gameId===end.gameId);check(records.length===1&&records[0].winners.length===2,'결과 기록 '+records.length+'건');
});
scenario('G03','전원 오답: 아무도 탈락하지 않고 즉시 종료, 직전 생존자 중 목표 인원 추첨',async()=>{
 const {roomId,players}=await room('G03',quiz(2,1,[SHORT('서울'),SHORT('부산')]),5);const [h]=players;
 h.send({type:'START_GAME'});const q=await h.question(0);for(const p of players.slice(1))p.short('틀림',q);
 const judge=await h.waitState(s=>s.state==='JUDGE');check(judge.zeroWipeoutSaved===true,'전원 오답 표시 없음');
 check(aliveIds(await snap(roomId)).length===5,'전원 오답인데 탈락자 발생');
 const end=await h.waitState(s=>s.state==='ENDED');check(end.winners.length===2&&end.winners.every(w=>players.some(p=>p.id===w.id)),'추첨 당첨자 수 불일치');
 check(h.states().some(s=>s.state==='LOTTERY'),'추첨 단계 없음');check(!h.states().some(s=>s.state==='QUESTION'&&s.index===1),'다음 문제가 열림');
});
scenario('G04','마지막 문제 후 생존자가 목표보다 많으면 생존자 중 목표 인원만 추첨',async()=>{
 const {roomId,players:[h,a,b,c,d,e]}=await room('G04',quiz(2,1,[OX('O')]),6);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[a.id]:O,[b.id]:O,[c.id]:O,[d.id]:O,[e.id]:X,[h.id]:X});
 const end=await h.waitState(s=>s.state==='ENDED');check(end.winners.length===2&&end.winners.every(w=>[a.id,b.id,c.id,d.id].includes(w.id)),'추첨 결과가 생존자 밖');
});
scenario('G05','생존자가 목표보다 적으면 생존자 우승 + 마지막 문제 탈락자 중 준우승 추첨',async()=>{
 const {roomId,players:[h,a,b,c,d]}=await room('G05',quiz(3,1,[OX('O'),OX('X')]),5);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O,[c.id]:O,[d.id]:X});
 await h.question(1);await place(roomId,{[h.id]:X,[a.id]:O,[b.id]:O,[c.id]:O});
 const end=await h.waitState(s=>s.state==='ENDED');const win=end.winners.filter(w=>w.placement==='WINNER'),runner=end.winners.filter(w=>w.placement==='RUNNER_UP');
 check(win.length===1&&win[0].id===h.id,'우승 불일치');check(runner.length===2&&runner.every(w=>[a.id,b.id,c.id].includes(w.id)),'준우승 후보 밖 당첨');
});
scenario('G06','패자부활전: 유령만 참가, 맞힌 유령 부활 후 다음 문제 참가',async()=>{
 const {roomId,players:[h,a,b,c]}=await room('G06',quiz(1,1,[OX('O'),SHORT('서울',{isRevival:true}),OX('X')]),4);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:X,[c.id]:X});
 const q1=await h.question(1);const s1=await snap(roomId);check(sameSet(s1.participants,[b.id,c.id]),'부활전 참가자가 유령이 아님');
 b.short('서울',q1);c.short('부산',q1);h.short('서울',q1);
 await h.question(2);const s2=await snap(roomId);check(sameSet(aliveIds(s2),[h.id,a.id,b.id]),'부활 결과 불일치');check(sameSet(s2.participants,[h.id,a.id,b.id]),'부활자가 다음 문제에 없음');
 await place(roomId,{[b.id]:X,[h.id]:O,[a.id]:O});const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===b.id,'부활자 우승 실패');
});
scenario('G07','유령이 없으면 패자부활전을 건너뜀',async()=>{
 const {roomId,players:[h,a,b]}=await room('G07',quiz(1,1,[OX('O'),SHORT('서울',{isRevival:true}),OX('O')]),3);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O});
 await h.question(2);check(!h.states().some(s=>s.state==='QUESTION'&&s.index===1),'유령 없는 부활전이 열림');
});
scenario('G08','소수결: 적은 쪽 생존 / 동수면 한쪽만 생존',async()=>{
 const one=await room('G08a',quiz(1,1,[MINORITY(),OX('O')]),5),[h,a,b,c,d]=one.players;
 const two=await room('G08b',quiz(1,1,[MINORITY(),OX('O')]),4),[i,j,k,l]=two.players;
 h.send({type:'START_GAME'});i.send({type:'START_GAME'});await Promise.all([h.question(0),i.question(0)]);
 await place(one.roomId,{[h.id]:O,[a.id]:O,[b.id]:X,[c.id]:X,[d.id]:X});await place(two.roomId,{[i.id]:O,[j.id]:O,[k.id]:X,[l.id]:X});
 await Promise.all([h.waitState(s=>s.state==='JUDGE'),i.waitState(s=>s.state==='JUDGE')]);
 check(sameSet(aliveIds(await snap(one.roomId)),[h.id,a.id]),'적은 쪽(왼쪽 2명)만 생존해야 함');
 const tie=aliveIds(await snap(two.roomId));check(sameSet(tie,[i.id,j.id])||sameSet(tie,[k.id,l.id]),'동수에서 한쪽만 생존해야 함: '+tie.length);
});
scenario('G09','버튼형·이동형 객관식 판정',async()=>{
 const {roomId,players:[h,a,b,c]}=await room('G09',quiz(1,1,[BUTTON('2'),ZONE('3')]),4);
 h.send({type:'START_GAME'});const q=await h.question(0);h.pick(2,q);a.pick(2,q);b.pick(3,q);
 await h.question(1);check(sameSet(aliveIds(await snap(roomId)),[h.id,a.id]),'버튼형 판정 불일치');
 await place(roomId,{[a.id]:ZONES[3],[h.id]:ZONES[4]});const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===a.id,'이동형 판정 불일치');
});
scenario('G10','주관식: 띄어쓰기·대소문자 무시, 여러 정답, 30자 초과 거절',async()=>{
 const {roomId,players:[h,a,b,c]}=await room('G10',quiz(1,1,[SHORT('서울,서울특별시,Seoul'),OX('O')]),4);
 h.send({type:'START_GAME'});const q=await h.question(0);const t=Date.now();
 h.short(' 서 울 ',q);a.short('서울특별시',q);b.short('seoul',q);c.short('가'.repeat(31),q);
 await c.wait(m=>m.type==='ERROR'&&/30자/.test(m.message),5000,'30자 초과 오류',t);
 await h.question(1);check(sameSet(aliveIds(await snap(roomId)),[h.id,a.id,b.id]),'정규화 판정 불일치');
});
scenario('G11','쉬는 시간 0초: 판정 뒤 바로 다음 문제',async()=>{
 const {roomId,players:[h,a,b]}=await room('G11',quiz(1,0,[OX('O'),OX('X')]),3);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O});
 await h.question(1);check(!h.states().some(s=>s.state==='BREAK'),'쉬는 시간 단계가 나타남');
 const gap=phaseGaps(h).find(g=>g.from==='JUDGE:0'&&g.to==='QUESTION:1');check(gap&&Math.abs(gap.ms-3000)<600,'판정→다음 문제 간격 '+gap?.ms);
});
scenario('G12','OX 레이스: 아무도 못 움직이면 진행도 순위로 정확히 절반 통과',async()=>{
 const race={type:'RACE',question:'레이스',raceQuestions:[{question:'1',answer:'O'},{question:'2',answer:'X'}],timeLimit:5};
 const {roomId,players:[h]}=await room('G12',quiz(1,1,[race,OX('O')]),4);
 h.send({type:'START_GAME'});await h.question(0);await h.question(1);check(aliveIds(await snap(roomId)).length===2,'레이스 통과 인원이 절반이 아님');
});
scenario('G13','초기화는 게임이 끝난 뒤에만: 게임 중 거절, 종료 후 두 번째 게임 전원 참가·기록 2건',async()=>{
 const {roomId,players:[h,a,b]}=await room('G13',quiz(1,1,[SHORT('서울')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);h.send({type:'RESET_GAME'});await sleep(400);
 check((await snap(roomId)).state==='QUESTION','게임 중 초기화가 받아들여짐');
 h.short('서울',q);const first=await h.waitState(s=>s.state==='ENDED');
 h.send({type:'RESET_GAME'});await h.waitState(s=>s.state==='WAITING');h.send({type:'START_GAME'});await h.waitState(s=>s.state==='COUNTDOWN');
 const s=await snap(roomId);check(s.players.every(p=>p.eligible&&p.alive),'두 번째 게임에서 전원이 참가자가 아님');
 const q2=await h.question(0);a.short('서울',q2);const second=await h.waitState(s=>s.state==='ENDED'&&s.gameId!==first.gameId);check(second.winners[0]?.id===a.id,'두 번째 게임 우승자 불일치');
 const records=(await results(h)).filter(r=>r.roomId===roomId);check(records.length===2&&new Set(records.map(r=>r.gameId)).size===2,'결과 기록 '+records.length+'건');
});

// ==================== 답안 ====================
scenario('A01','답을 여러 번 바꾸면 마지막 답으로 판정',async()=>{
 const {roomId,players:[h,a,b]}=await room('A01',quiz(1,1,[SHORT('서울'),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);
 for(const t of ['부산','서울','대구','서울']){a.short(t,q);await sleep(120);}for(const t of ['서울','부산']){b.short(t,q);await sleep(120);}
 const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===a.id,'마지막 답 기준 판정 실패');
 check((await snap(roomId)).players.find(p=>p.id===b.id).answer==='부산','b의 마지막 답이 남지 않음');
});
scenario('A02','같은 답을 연달아 다시 보내도(재전송) 한 번 낸 것과 같음',async()=>{
 const {roomId,players:[h,a,b]}=await room('A02',quiz(1,1,[SHORT('서울'),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);const t=Date.now();for(let i=0;i<5;i++)a.short('서울',q);b.short('서울',q);
 await a.wait(m=>m.type==='ANSWER_ACK',3000,'확인',t);check(!a.find(m=>m.type==='ERROR',t),'재전송에 오류');
 await h.question(1);check(sameSet(aliveIds(await snap(roomId)),[a.id,b.id]),'재전송 판정 불일치');
});
scenario('A03','마감 직후 도착한 답은 거절',async()=>{
 const {roomId,players:[h,a,b]}=await room('A03',quiz(1,1,[SHORT('서울'),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);
 await until(()=>Date.now()>q.stateEndTime+150,8000,'마감');const t=Date.now();b.short('서울',q);await sleep(500);
 check(!b.find(m=>m.type==='ANSWER_ACK',t),'마감 뒤 답이 접수됨');
 const s=await snap(roomId);check(!s.players.find(p=>p.id===b.id).alive,'늦게 낸 사람이 생존');
});
scenario('A04','이전 문제 표시가 붙은 늦은 답은 다음 문제에 접수되지 않음',async()=>{
 const {roomId,players:[h,a,b]}=await room('A04',quiz(1,1,[SHORT('서울'),SHORT('부산'),OX('O')]),3);
 h.send({type:'START_GAME'});const q0=await h.question(0);a.short('서울',q0);b.short('서울',q0);
 const q1=await h.question(1);a.short('부산',q0);b.short('부산',q1);await sleep(400);
 const s=await snap(roomId);check(!s.players.find(p=>p.id===a.id).submitted,'이전 문제 답이 접수됨');
 await h.waitState(s=>s.state==='ENDED');check(sameSet(aliveIds(await snap(roomId)),[b.id]),'판정 불일치');
});
scenario('A05','시작 뒤 들어온 관전자: 답·이동·채팅 모두 무시',async()=>{
 const {roomId,players:[h,a]}=await room('A05',quiz(1,1,[SHORT('서울',{timeLimit:10}),OX('O')]),2);
 h.send({type:'START_GAME'});const q=await h.question(0);const late=await new P('A05관전').open();check((await late.join(roomId)).type==='JOINED_ROOM','관전 입장 실패');
 const before=(await snap(roomId)).players.find(p=>p.id===late.id);check(before.eligible===false,'늦은 입장자가 참가자');
 const t=Date.now();late.short('서울',q);late.send({type:'MOVE',x:before.x+1,z:before.z});late.send({type:'CHAT',text:'정답은 서울'});await sleep(500);
 const after=(await snap(roomId)).players.find(p=>p.id===late.id);
 check(!after.submitted,'관전자 답 접수');check(after.x===before.x,'관전자 이동 반영');check(!a.find(m=>m.type==='CHAT_MSG'&&m.senderId===late.id,t),'관전자 채팅 전달');
});
scenario('A06','제출 뒤 수정 중 표시가 와도 제출한 답으로 판정',async()=>{
 const {roomId,players:[h,a,b]}=await room('A06',quiz(1,1,[SHORT('서울'),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);await sleep(150);a.send({type:'ANSWER_EDITING',gameId:q.gameId,roundId:q.roundId});b.short('서울',q);await sleep(200);
 const s=(await snap(roomId)).players.find(p=>p.id===a.id);check(s.submitted&&s.answer==='서울'&&s.editing,'수정 중 상태 불일치');
 await h.question(1);check(sameSet(aliveIds(await snap(roomId)),[a.id,b.id]),'수정 중인 정답자가 탈락');
});

// ==================== 연결 ====================
scenario('C01','문제 중 끊김 → 같은 자리 복귀, 낸 답 유지, 생존',async()=>{
 const {roomId,players:[h,a,b]}=await room('C01',quiz(1,1,[SHORT('서울',{timeLimit:8}),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);b.short('서울',q);await a.wait(m=>m.type==='ANSWER_ACK');
 const id=a.id;a.drop();await until(async()=>(await snap(roomId)).players.find(p=>p.id===id)?.connected===false,3000,'끊김 반영');
 await sleep(800);const r=await a.resume();check(r.type==='JOINED_ROOM'&&r.resumed&&r.clientId===id,'같은 자리 복귀 실패');
 const own=await a.wait(m=>m.type==='ROOM_STATE'&&m.ownSubmission,3000,'내 답 상태',r.at);check(own.ownSubmission.answer==='서울','복귀 후 답이 사라짐');
 await h.question(1);check(sameSet(aliveIds(await snap(roomId)),[a.id,b.id]),'복귀자 탈락');
});
scenario('C02','쉬는 시간에 끊겼다 다음 문제 중 복귀해도 그 문제 참가자',async()=>{
 const {roomId,players:[h,a,b]}=await room('C02',quiz(1,3,[OX('O'),OX('X')]),3);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O});
 await h.waitState(s=>s.state==='BREAK');a.drop();await h.question(1);await sleep(700);
 const r=await a.resume();check(r.type==='JOINED_ROOM'&&r.resumed,'복귀 실패');check((await snap(roomId)).participants.includes(a.id),'복귀자가 문제 참가자가 아님');
 await place(roomId,{[a.id]:X,[h.id]:O,[b.id]:O});const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===a.id,'복귀자 판정 불일치');
});
scenario('C03','대기실에서 끊긴 사이 시작해도 복귀하면 참가자',async()=>{
 const {roomId,players:[h,a,b]}=await room('C03',quiz(1,1,[SHORT('서울')]),3);
 a.drop();await until(async()=>(await snap(roomId)).players.find(p=>p.id===a.id)?.connected===false,3000,'끊김 반영');
 check((await snap(roomId)).players.length===3,'대기실에서 끊긴 자리가 사라짐');
 h.send({type:'START_GAME'});await h.waitState(s=>s.state==='COUNTDOWN');const r=await a.resume();check(r.type==='JOINED_ROOM'&&r.resumed,'복귀 실패');
 const me=(await snap(roomId)).players.find(p=>p.id===a.id);check(me.eligible&&me.alive,'복귀자가 관전자가 됨');
 const q=await a.question(0);a.short('서울',q);const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===a.id,'복귀자 우승 실패');
});
scenario('C04','조용히 끊긴 폰: 약 10초 만에 감지, 마지막 신호부터 30초 자리 유지, 15초 뒤 복귀 성공',async()=>{
 const {roomId,players:[h]}=await room('C04',quiz(1,1,[SHORT('서울',{timeLimit:40}),OX('O')]),2);
 const s=new P('C04무응답',{autoPong:false});await s.open();check((await s.join(roomId)).type==='JOINED_ROOM','입장 실패');
 let pinger=setInterval(()=>s.send({type:'APP_PING',t:Date.now()}),1000);
 h.send({type:'START_GAME'});const q=await s.question(0);s.short('서울',q);await s.wait(m=>m.type==='ANSWER_ACK');
 clearInterval(pinger);const last=Date.now();
 const held=await until(async()=>{const p=(await snap(roomId)).players.find(p=>p.id===s.id);return p?.connected===false&&p;},16000,'무응답 감지');
 const noticed=Date.now()-last;check(noticed>=9000&&noticed<=12500,'감지 시간 '+noticed);check(Math.abs(held.until-last-30000)<1500,'자리 기한 '+(held.until-last));
 s.autoPong=true;await until(()=>Date.now()-last>15000,10000,'15초 대기');const r=await s.resume();check(r.type==='JOINED_ROOM'&&r.resumed,'15초 뒤 복귀 실패');
 const own=await s.wait(m=>m.type==='ROOM_STATE'&&m.ownSubmission,3000,'내 답',r.at);check(own.ownSubmission.answer==='서울','답이 사라짐');
 return `감지 ${noticed}ms, 기한 ${held.until-last}ms`;
});
scenario('C05','마지막 신호 30초가 지나면 자리 만료 → 다시 들어오면 관전자',async()=>{
 const {roomId,players:[h]}=await room('C05',quiz(1,1,[SHORT('서울',{timeLimit:60}),OX('O')]),2);
 const s=new P('C05만료',{autoPong:false});await s.open();check((await s.join(roomId)).type==='JOINED_ROOM','입장 실패');
 const pinger=setInterval(()=>s.send({type:'APP_PING',t:Date.now()}),1000);h.send({type:'START_GAME'});await s.question(0);
 clearInterval(pinger);const last=Date.now(),id=s.id;
 await until(async()=>!(await snap(roomId)).players.some(p=>p.id===id),40000,'자리 만료');const expired=Date.now()-last;
 check(expired>=29000&&expired<=32500,'만료 시점 '+expired);
 s.autoPong=true;await s.open();const r=await s.join(roomId);check(r.type==='JOINED_ROOM','재입장 실패');
 check((await snap(roomId)).players.find(p=>p.id===r.clientId).eligible===false,'만료 뒤 재입장자가 참가자');
 return `만료 ${expired}ms`;
});
scenario('C06','대기실에서 방장이 끊겨도 방장 유지: 다른 사람 시작 거절, 방장 복귀 후 시작',async()=>{
 const {roomId,players:[h,a]}=await room('C06',quiz(1,1,[SHORT('서울')]),2);
 h.drop();await until(async()=>(await snap(roomId)).players.find(p=>p.id===h.id)?.connected===false,3000,'끊김');
 a.send({type:'START_GAME'});await sleep(600);const s=await snap(roomId);check(s.state==='WAITING'&&s.hostId===h.id,'방장 아닌 사람이 시작했거나 방장이 바뀜');
 const r=await h.resume();check(r.type==='JOINED_ROOM','방장 복귀 실패');h.send({type:'START_GAME'});await h.waitState(s=>s.state==='COUNTDOWN');
});
scenario('C07','방장 자리가 만료되면 다음 사람이 방장, 방을 만든 브라우저가 돌아오면 방장 복귀',async()=>{
 const {roomId,players:[h,a,b]}=await room('C07',quiz(1,1,[SHORT('서울',{timeLimit:20})]),3);
 h.send({type:'START_GAME'});await h.question(0);h.drop();await until(async()=>(await snap(roomId)).players.find(p=>p.id===h.id)?.connected===false,3000,'끊김');
 check((await snap(roomId)).hostId===h.id,'끊긴 동안 방장이 바뀜');
 const expired=await control('expire',{roomId,playerId:h.id});check([a.id,b.id].includes(expired.hostId),'만료 뒤 방장 승계 실패');
 const back=await new P('C07재입장',{token:h.token}).open();const r=await back.join(roomId);check(r.type==='JOINED_ROOM','재입장 실패');
 const s=await snap(roomId);check(s.hostId===r.clientId,'만든 브라우저에게 방장이 돌아오지 않음');check(s.players.find(p=>p.id===r.clientId).eligible===false,'만료 뒤 재입장자가 참가자');
});
scenario('C08','같은 브라우저 두 탭: 나중 탭이 자리를 가져가고 먼저 탭은 4001로 종료',async()=>{
 const {roomId,players:[h,a]}=await room('C08',quiz(1,1,[SHORT('서울')]),2);
 const tab=await new P('C08새탭',{token:a.token}).open();const r=await tab.join(roomId);check(r.type==='JOINED_ROOM'&&r.clientId===a.id,'새 탭이 같은 자리를 받지 못함');
 await until(()=>a.closes.includes(4001),3000,'옛 탭 4001');check((await snap(roomId)).players.length===2,'자리가 중복됨');
});
scenario('C09','같은 브라우저로 다른 방에 들어가면 원래 방 자리는 사라짐',async()=>{
 const one=await room('C09a',quiz(1,1,[SHORT('서울')]),2),two=await room('C09b',quiz(1,1,[SHORT('서울')]),1);
 const a=one.players[1];const tab=await new P('C09다른방',{token:a.token}).open();check((await tab.join(two.roomId)).type==='JOINED_ROOM','다른 방 입장 실패');
 await sleep(300);check(!(await snap(one.roomId)).players.some(p=>p.id===a.id),'원래 방 자리가 남음');
});
scenario('C10','늦게 도착한 옛 연결의 복귀 요청은 새 연결의 자리를 빼앗지 못함',async()=>{
 const {roomId,players:[h,a]}=await room('C10',quiz(1,1,[SHORT('서울',{timeLimit:20})]),2);
 h.send({type:'START_GAME'});await a.question(0);const session={...a.session};
 const older=await new P('C10옛',{token:a.token}).open(),newer=await new P('C10새',{token:a.token}).open();
 newer.send({type:'RESUME_ROOM',...session});await newer.wait(m=>m.type==='JOINED_ROOM');
 const t=Date.now();older.send({type:'RESUME_ROOM',...session});await older.wait(m=>m.type==='RESUME_REJECTED',5000,'옛 연결 거절',t);
 await sleep(300);check(newer.ws.readyState===1&&!newer.closes.length,'새 연결이 끊김');check((await snap(roomId)).players.find(p=>p.id===a.id).connected,'자리 연결 상태 불일치');
});
scenario('C11','정원 50명: 끊긴 사람 자리도 정원에 포함, 새 사람 거절, 끊긴 사람은 복귀',async()=>{
 const {roomId,players}=await room('C11',quiz(1,1,[SHORT('서울')]),50);const z=players[49];
 z.drop();await until(async()=>(await snap(roomId)).players.find(p=>p.id===z.id)?.connected===false,3000,'끊김');
 const extra=await new P('C11초과').open();const r=await extra.join(roomId);check(r.type==='ERROR'&&/50/.test(r.message),'51번째가 들어감');
 const back=await z.resume();check(back.type==='JOINED_ROOM'&&back.resumed,'예약 자리 복귀 실패');check((await snap(roomId)).players.length===50,'인원 불일치');
});
scenario('C12','문제 중 40명이 한꺼번에 끊겼다 동시에 복귀: 전원 같은 자리, 답 유지, 판정 정확',async()=>{
 const {roomId,players}=await room('C12',quiz(1,1,[SHORT('서울',{timeLimit:15}),OX('O')]),41);const [h,...guests]=players;
 h.send({type:'START_GAME'});const q=await h.question(0);for(const g of guests)g.short('서울',q);
 await until(async()=>(await snap(roomId)).players.filter(p=>p.submitted).length===40,5000,'40명 제출');
 const ids=guests.map(g=>g.id);for(const g of guests)g.drop();
 await until(async()=>(await snap(roomId)).players.filter(p=>!p.connected).length===40,5000,'40명 끊김');
 const back=await Promise.all(guests.map(g=>g.resume()));check(back.every((r,i)=>r.type==='JOINED_ROOM'&&r.resumed&&r.clientId===ids[i]),'일부가 같은 자리로 복귀하지 못함');
 const s=await snap(roomId);check(s.players.filter(p=>p.connected).length===41&&s.players.filter(p=>p.submitted&&p.answer==='서울').length===40,'복귀 후 연결·답 불일치');
 await h.question(1);check(aliveIds(await snap(roomId)).length===40,'판정 생존자 수 불일치');
});

// ==================== 폭주·비정상 입력 ====================
scenario('L01','깨진 메시지·잘못된 형식·5MB 초과 메시지: 그 연결만 끊기고 다른 방 게임은 정시 진행',async()=>{
 const {players:[h,a]}=await room('L01',quiz(1,1,[SHORT('서울',{timeLimit:8}),OX('O')]),2);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);
 const bad=await new P('L01공격').open();bad.ws.send('{broken');for(const m of [null,[],42,'x',{},{type:null},{type:[]},{type:'MOVE',x:'a',z:Infinity}])bad.ws.send(JSON.stringify(m));
 bad.ws.send('x'.repeat(6*1024*1024));await until(()=>bad.closes.length,5000,'초과 메시지 연결 종료');
 await h.waitState(s=>s.state==='JUDGE');const gap=phaseGaps(h).find(g=>g.from==='QUESTION:0'&&g.to==='JUDGE:0');check(gap&&Math.abs(gap.ms-8000)<600,'판정 시각 어긋남 '+gap?.ms);
 return '종료 코드 '+bad.closes[0];
});
scenario('L02','한 사람이 메시지 3000개를 쏟아내도 서버와 게임 시간 정상, 다른 사람 답 즉시 확인',async()=>{
 const {players:[h,a,f]}=await room('L02',quiz(1,1,[SHORT('서울',{timeLimit:8}),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);
 for(let i=0;i<3000;i++)f.send(i%4===0?{type:'APP_PING',t:Date.now()}:i%4===1?{type:'CHAT',text:'도배'+i}:i%4===2?{type:'MOVE',x:Math.random()*4,z:0}:{type:'GET_ROOM_STATE',roomId:q.roomId});
 const t=Date.now();a.short('서울',q);const ack=await a.wait(m=>m.type==='ANSWER_ACK',3000,'답 확인',t);check(ack.at-t<1000,'답 확인 지연 '+(ack.at-t));
 await h.waitState(s=>s.state==='JUDGE');const gap=phaseGaps(h).find(g=>g.from==='QUESTION:0'&&g.to==='JUDGE:0');check(gap&&Math.abs(gap.ms-8000)<600,'판정 시각 어긋남 '+gap?.ms);
 return `답 확인 ${ack.at-t}ms`;
});
scenario('L03','이동 메시지 60개를 한꺼번에: 제한에 걸려도 마지막 위치로 반영',async()=>{
 const {roomId,players:[h,a]}=await room('L03',quiz(1,1,[OX('O',{}),OX('O')]),2);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[a.id]:{x:0,z:0}});await sleep(200);
 for(let i=1;i<=60;i++)a.send({type:'MOVE',x:-i*.03,z:0});
 await until(async()=>Math.abs((await snap(roomId)).players.find(p=>p.id===a.id).x+1.8)<.02,3000,'마지막 위치 반영');
});

// ==================== 장애 주입 ====================
scenario('F01','판정이 끝난 뒤 오류: 되돌려 다시 판정, 그사이 늦은 답 거절, 문제 건너뜀 없음',async()=>{
 const {roomId,players:[h,a,b]}=await room('F01',quiz(1,1,[SHORT('서울'),OX('X')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);h.short('서울',q);a.short('서울',q);await control('fail-after',{roomId,action:'judge'});
 await until(()=>Date.now()>q.stateEndTime+600,8000,'마감');const t=Date.now();b.short('서울',q);await sleep(300);check(!b.find(m=>m.type==='ANSWER_ACK',t),'판정 재시도 중 늦은 답 접수');
 await h.question(1);const s=await snap(roomId);check(sameSet(aliveIds(s),[h.id,a.id]),'재판정 결과 불일치');
 check(!h.states().some(x=>x.state==='QUESTION'&&x.index===2),'문제 건너뜀');
 await place(roomId,{[a.id]:X,[h.id]:O});const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===a.id,'최종 우승 불일치');
});
scenario('F02','다음 문제 전환 뒤 오류: 되돌려 같은 문제를 다시 열고 건너뛰지 않음',async()=>{
 const {roomId,players:[h,a,b]}=await room('F02',quiz(1,1,[OX('O'),OX('O'),OX('X')]),3);
 h.send({type:'START_GAME'});await h.question(0);await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O});
 await h.waitState(s=>s.state==='BREAK');await control('fail-after',{roomId,action:'next'});
 await until(async()=>{const s=await snap(roomId);return s.state==='QUESTION'&&s.index===1&&s.pending==='judge'&&!h.states().some(x=>x.state==='QUESTION'&&x.index===2)&&s;},15000,'2번 문제 다시 열림');
 const judgedIndexes=()=>[...new Set(h.states().filter(x=>x.state==='JUDGE').map(x=>x.index))];
 await place(roomId,{[h.id]:O,[a.id]:O,[b.id]:O});await h.question(2);check(judgedIndexes().join()==='0,1','2번 문제를 판정하지 않고 넘어감: '+judgedIndexes());
 await place(roomId,{[b.id]:X});const end=await h.waitState(s=>s.state==='ENDED');check(end.winners[0]?.id===b.id,'최종 우승 불일치');
});
scenario('F03','단계 타이머 유실: 마감 2초 뒤 감시가 판정을 대신 실행',async()=>{
 const {roomId,players:[h,a,b]}=await room('F03',quiz(1,1,[SHORT('서울'),OX('O')]),3);
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);b.short('서울',q);await control('lose-phase-timer',{roomId});
 const j=await h.waitState(s=>s.state==='JUDGE',15000);const late=j.serverNow-q.stateEndTime;check(late>=1900&&late<=3600,'감시 실행 시점 '+late);
 check(sameSet(aliveIds(await snap(roomId)),[a.id,b.id]),'감시 판정 결과 불일치');return `마감 뒤 ${late}ms`;
});
scenario('F04','서버 강제 종료(충돌) 후 재시작: 방·자리·답 복원, 남은 시간 +5초, 끊긴 사람 복귀 후 판정',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-restore-'));
 const start=()=>{const c=fork(path.join(__dirname,'../server/index.js'),[],{env:{...process.env,PORT:String(RESTORE_PORT),NODE_ENV:'development',OX_DATA_DIR:dir,OX_PUBLIC_TEST_BOTS:'',OX_DISABLE_PERSISTENCE:''},silent:true});children.push(c);c.stdout.resume();c.stderr.resume();return c;};
 const ready=()=>until(async()=>{try{return (await fetch(`http://127.0.0.1:${RESTORE_PORT}/api/rooms`)).ok;}catch{return false;}},15000,'복원 서버 준비');
 let server=start();await ready();
 const {roomId,players:[h,a,b]}=await room('F04',quiz(1,1,[SHORT('서울',{timeLimit:20}),OX('O')]),3,{port:RESTORE_PORT});
 h.send({type:'START_GAME'});const q=await h.question(0);a.short('서울',q);await a.wait(m=>m.type==='ANSWER_ACK');await sleep(2600);
 const remainingBefore=q.stateEndTime-Date.now();server.kill();for(const p of [h,a,b])p.drop();await sleep(500);
 server=start();await ready();const rooms=(await (await fetch(`http://127.0.0.1:${RESTORE_PORT}/api/rooms`)).json()).rooms;
 const restored=rooms.find(r=>r.id===roomId);check(restored&&restored.reservedCount===3&&restored.state==='QUESTION','방이 복원되지 않음');
 const back=await Promise.all([h,a,b].map(p=>p.resume()));check(back.every(r=>r.type==='JOINED_ROOM'&&r.resumed),'복원 뒤 같은 자리 복귀 실패');
 const state=await b.waitState(s=>s.state==='QUESTION'&&s.roundId===q.roundId,5000);check(state.stateEndTime-Date.now()>remainingBefore,'남은 시간이 늘지 않음');
 check(a.find(m=>m.type==='ROOM_STATE'&&m.ownSubmission?.answer==='서울',back[1].at),'복원 뒤 답이 사라짐');
 b.short('서울',state);await b.wait(m=>m.type==='ANSWER_ACK',3000,'복원 뒤 답 접수');
 const judge=await h.waitState(s=>s.state==='JUDGE'||s.state==='BREAK'||s.state==='QUESTION'&&s.currentQuestion.index===1,40000);
 server.kill();for(const p of [h,a,b])p.drop();
 return `복원 뒤 판정 단계 ${judge.state}, 남은 시간 ${Math.round(remainingBefore)}ms → ${Math.round(state.stateEndTime-state.serverNow)}ms`;
});

(async()=>{
 const report={startedAt:new Date().toISOString(),results:[]};let failed=0;
 try{
  child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(PORT),NODE_ENV:'development',OX_PUBLIC_TEST_BOTS:'0'},silent:true});
  for(const s of [child.stdout,child.stderr])s.on('data',d=>serverLines.push(...d.toString().split('\n').filter(Boolean)));
  child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);});
  await until(async()=>{try{return (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).ok;}catch{return false;}},15000,'서버 준비');
  const only=process.env.SCENARIOS?.split(',');
  const list=scenarios.filter(s=>!only||only.includes(s.id));
  await Promise.all(list.map(async(s,i)=>{
   await sleep(i*150);const t=Date.now();
   try{const detail=await Promise.race([s.fn(),sleep(150000).then(()=>{throw Error('시나리오 전체 시간 초과');})]);report.results.push({id:s.id,title:s.title,ok:true,ms:Date.now()-t,detail:detail||''});}
   catch(e){failed++;report.results.push({id:s.id,title:s.title,ok:false,ms:Date.now()-t,detail:e.message});}
  }));
 }catch(e){failed++;report.results.push({id:'SETUP',title:'준비',ok:false,detail:e.message});}
 finally{
  report.results.sort((a,b)=>a.id.localeCompare(b.id));
  report.server={phaseFailed:serverLines.filter(l=>l.includes('ROOM_PHASE_FAILED')).length,uncaught:serverLines.filter(l=>/UNCAUGHT|UNHANDLED/.test(l)).length,overdue:serverLines.filter(l=>l.includes('ROOM_PHASE_OVERDUE')).length};
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/scenarios.json',JSON.stringify(report,null,2));
  for(const r of report.results)console.log(`${r.ok?'PASS':'FAIL'} ${r.id} ${r.title} (${(r.ms/1000).toFixed(1)}s)${r.detail?' — '+r.detail:''}`);
  console.log(`\n${report.results.length-failed}/${report.results.length} 통과 · 서버 단계 실패 로그 ${report.server.phaseFailed}건(주입 2건 예상) · 처리 안 된 오류 ${report.server.uncaught}건 · 단계 지연 감시 ${report.server.overdue}건`);
  child?.kill();for(const c of children)try{c.kill();}catch{}
  process.exitCode=failed?1:0;setTimeout(()=>process.exit(process.exitCode),500);
 }
})();
