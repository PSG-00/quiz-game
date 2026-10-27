const http=require('http');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const express=require('express');
const {WebSocketServer}=require('ws');
const {RoomManager}=require('./RoomManager');
const {RoomStore}=require('./RoomStore');
const {QuizLibrary,userHash}=require('./QuizLibrary');
const {cacheControl,versionedHtml}=require('./staticCache');
const {RequestLimits}=require('./RequestLimits');
const {QuizLoadGuard}=require('./QuizLoadGuard');
const {LiveRoomStore}=require('./LiveRoomStore');
const {ResultLog}=require('./ResultLog');
const ClientDiag=require('./ClientDiag');
const {parseDirectUrl,injectDirectMeta,socketPath}=require('./DirectSocket');
// Every log line starts with its own KST time, so drops that happen in the same
// second line up when the PM2 log files are searched later.
const logTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
for(const level of ['log','info','warn','error']){
 const write=console[level].bind(console);
 console[level]=(...args)=>{const now=new Date();write(`${logTime.format(now)}.${String(now.getMilliseconds()).padStart(3,'0')} KST`,...args);};
}
const passwordFile=path.join(__dirname,'quizLoadPassword.json');
const quizLoadGuard=new QuizLoadGuard({enabled:process.env.OX_QUIZ_LOAD_LOCK==='1'||process.env.NODE_ENV==='production'&&process.env.OX_QUIZ_LOAD_LOCK!=='0',record:fs.existsSync(passwordFile)?JSON.parse(fs.readFileSync(passwordFile,'utf8')):null});
const MAX_CONNECTIONS=Math.max(50,Number.parseInt(process.env.OX_MAX_CONNECTIONS,10)||500);
const PORT=process.env.PORT||3000;
const clientDir=path.join(__dirname,'../client');
const app=express();
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const directSocket=parseDirectUrl(process.env.OX_DIRECT_WS_URL);
if(process.env.OX_DIRECT_WS_URL&&!directSocket)console.warn('OX_DIRECT_WS_URL 무시: wss:// 주소가 아닙니다.');
let indexHtml=null;
app.get(['/','/index.html'],(req,res)=>{
 // Files only change by deploy (a restart) in production; development re-hashes per load.
 if(!indexHtml||process.env.NODE_ENV!=='production')indexHtml=injectDirectMeta(versionedHtml(fs.readFileSync(path.join(clientDir,'index.html'),'utf8'),clientDir),directSocket);
 res.setHeader('Cache-Control','no-store');res.type('html').send(indexHtml);
});
app.use(express.static(clientDir,{etag:true,lastModified:true,setHeaders:(res,file)=>res.setHeader('Cache-Control',cacheControl(file))}));
const disabled=process.env.OX_DISABLE_PERSISTENCE==='1';
// Production keeps data outside the deploy checkout so a clean checkout never touches it.
const dataDir=process.env.OX_DATA_DIR||path.join(__dirname,'../data');
const oldFile=disabled?null:(process.env.OX_DATA_FILE||path.join(dataDir,'rooms.json'));
const quizFile=disabled?null:(process.env.OX_QUIZ_FILE||(process.env.OX_DATA_FILE?process.env.OX_DATA_FILE+'.quizzes.json':path.join(dataDir,'quizzes.json')));
const liveRooms=new LiveRoomStore(disabled?null:process.env.OX_LIVE_ROOMS_FILE||path.join(path.dirname(quizFile),'live-rooms.json'));
const results=new ResultLog(disabled?null:process.env.OX_RESULTS_FILE||path.join(path.dirname(quizFile),'results.jsonl'));

const seedFile=path.join(__dirname,'../seeds/quizzes.json');
if(quizFile&&fs.existsSync(seedFile)){
 try{
  fs.mkdirSync(path.dirname(quizFile),{recursive:true});
  if(!fs.existsSync(quizFile)){
   fs.copyFileSync(seedFile,quizFile);
  }else{
   const cur=JSON.parse(fs.readFileSync(quizFile,'utf8')||'{"quizzes":[]}');
   const seed=JSON.parse(fs.readFileSync(seedFile,'utf8')||'{"quizzes":[]}');
   const quizzes=Array.isArray(cur.quizzes)?cur.quizzes:[];
   const ids=new Set(quizzes.map(q=>q.id));
   const codes=new Set((cur.usedCodes||[]).concat(quizzes.map(q=>q.code)));
   let added=false;
   for(const sq of (seed.quizzes||[])){
    const idx=quizzes.findIndex(q=>q.id===sq.id);
    if(idx===-1){quizzes.push(sq);ids.add(sq.id);if(sq.code)codes.add(sq.code);added=true;}
    else if((sq.updatedAt||'')>(quizzes[idx].updatedAt||'')){quizzes[idx]=sq;if(sq.code)codes.add(sq.code);added=true;}
   }
   if(added){
    cur.version=cur.version||1;cur.quizzes=quizzes;cur.usedCodes=Array.from(codes);
    fs.writeFileSync(quizFile,JSON.stringify(cur,null,2),'utf8');
   }
  }
 }catch(err){console.error('시드 동기화 실패:',err.message);}
}

const library=new QuizLibrary({file:quizFile,legacyRooms:new RoomStore(oldFile).load()});
const roomManager=new RoomManager();
// The PM2 log line is a second copy of every result in case the file is lost.
roomManager.onGameEnded=record=>{
 console.info('GAME_RESULT',JSON.stringify(record));
 try{results.append(record);}catch(error){console.error('GAME_RESULT_SAVE_FAILED',error.message);}
};
function expiredSeat(room){roomManager.cleanupEmptyRooms();if(roomManager.getRoom(room.id))room.broadcastRoomEvent();publishRooms();}
{
 const restored=roomManager.restore(liveRooms.load(),{onExpire:expiredSeat});
 if(restored)console.info('LIVE_ROOMS_RESTORED',JSON.stringify({rooms:restored}));
}
let shuttingDown=false;
function saveLiveRooms(){
 if(shuttingDown)return;
 try{liveRooms.save(roomManager.snapshot());}catch(error){console.error('LIVE_ROOMS_SAVE_FAILED',error.message);}
}
const liveRoomsInterval=setInterval(saveLiveRooms,2000);liveRoomsInterval.unref?.();
// Behind cloudflared every socket comes from loopback; only then trust Cloudflare's client IP.
function clientAddress(req){
 const remote=req.socket.remoteAddress||'';
 const trusted=process.env.OX_TRUST_CF_HEADER==='1'||['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote);
 const forwarded=trusted&&typeof req.headers['cf-connecting-ip']==='string'?req.headers['cf-connecting-ip'].trim():'';
 return forwarded||remote;
}
const codeAttempts=new Map();
function checkCodeLimit(address){
 const now=Date.now();
 for(const [key,value] of codeAttempts)if(value.until<=now)codeAttempts.delete(key);
 const entry=codeAttempts.get(address)||{count:0,until:now+60000};
 if(entry.count>=30)throw new Error('코드 조회가 너무 잦아요. 잠시 후 다시 시도해 주세요.');
 entry.count++;codeAttempts.set(address,entry);
}
app.get('/api/rooms',(req,res)=>res.json({rooms:roomManager.getRoomListSummary()}));
app.get('/api/recovered-draft',(req,res)=>{
 const file=path.join(dataDir,'recovered-browser-draft.json');
 if(quizLoadGuard.enabled||disabled||process.env.OX_DATA_FILE||!fs.existsSync(file))return res.json(null);
 res.json(JSON.parse(fs.readFileSync(file,'utf8')));
});
const server=http.createServer(app),wss=new WebSocketServer({server,maxPayload:5*1024*1024});
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg));}
// Only lobby screens show the list (a client asks again when it returns to the lobby), and a
// burst of joins or resumes becomes one list instead of one per change for every socket.
let publishTimer=null;
function publishRooms(){
 if(publishTimer)return;
 publishTimer=setTimeout(()=>{publishTimer=null;const msg={type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()};for(const peer of wss.clients)if(!peer.inRoom?.())send(peer,msg);},250);publishTimer.unref?.();
}
function validatePlayable(questions){
 if(!Array.isArray(questions)||!questions.length)throw new Error('문제를 한 개 이상 작성해 주세요.');
 for(let i=0;i<questions.length;i++){
  const q=questions[i];
  if(!q.question.trim()||(!['MINORITY','RACE'].includes(q.type)&&!q.answer.trim())||(q.type==='RACE'&&q.raceQuestions.some(item=>!item.question.trim()))||(q.type==='SHORT'&&!q.answer.split(',').some(a=>a.trim()))||(q.type==='MULTIPLE'&&q.choices.some(c=>!c.trim())))throw new Error(`문제 ${i+1}의 내용·정답·보기를 완성해 주세요. 임시 저장은 미완성 상태에서도 가능해요.`);
 }
}
function resumeHash(token){return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?crypto.createHash('sha256').update(token).digest('hex'):null;}
function evictDuplicateOwner(targetOwnerHash,exceptClientId=null,targetRoom=null){
 if(!targetOwnerHash)return false;
 let wasHostInTarget=false,changed=false;
 for(const r of roomManager.rooms.values()){
  for(const [pid,p] of [...r.players.entries()]){
   if(pid!==exceptClientId&&p.ownerHash===targetOwnerHash){
    if(r===targetRoom&&r.hostId===pid)wasHostInTarget=true;
    p.ws?.detachRoom?.();
    r.removePlayer(pid);
    try{p.ws?.close?.(4001,'다른 탭에서 접속했습니다.');}catch{}
    if(r!==targetRoom&&r.players.size)r.broadcastRoomEvent();
    changed=true;
   }
  }
 }
 if(changed)for(const room of roomManager.rooms.values())if(room!==targetRoom&&!room.players.size)roomManager.closeRoom(room);
 return wasHostInTarget;
}
function probeStaleOwnerSessions(targetOwnerHash,activeWs){
 if(!targetOwnerHash)return;
 for(const r of roomManager.rooms.values()){
  for(const [,p] of r.players.entries()){
   if(p.ownerHash===targetOwnerHash&&p.ws&&p.ws!==activeWs){
    const oldWs=p.ws;
    if(oldWs.readyState!==1){oldWs.leaveRoom?.();continue;}
    oldWs.probeSentAt=Date.now();
    try{oldWs.ping();}catch{oldWs.leaveRoom?.();continue;}
    const timer=setTimeout(()=>{if((oldWs.lastPongAt||0)<oldWs.probeSentAt){oldWs.leaveRoom?.();try{oldWs.terminate();}catch{}}},1500);
    timer.unref?.();
   }
  }
 }
}
const heartbeatInterval=setInterval(()=>{
 for(const peer of wss.clients){
  if(peer.isAlive===false){peer.leaveRoom?.();try{peer.terminate();}catch{}continue;}
  peer.isAlive=false;try{peer.ping();}catch{}
 }
},15000);
heartbeatInterval.unref?.();
// Once the direct host is on, shows how many players actually reach the VM without the detour.
let lastPathSummary='';
const pathSummaryInterval=setInterval(()=>{
 if(!directSocket||!wss.clients.size)return;
 const counts={direct:0,cf:0};for(const peer of wss.clients)if(peer.path)counts[peer.path]++;
 const summary=JSON.stringify(counts);if(summary!==lastPathSummary){lastPathSummary=summary;console.info('CONNECTION_PATHS',summary);}
},60000);
pathSummaryInterval.unref?.();
wss.on('connection',(ws,req)=>{
 if(shuttingDown||wss.clients.size>MAX_CONNECTIONS){ws.on('error',()=>{});ws.close(shuttingDown?1012:1013,shuttingDown?'서버를 다시 시작하고 있어요.':'서버 접속 인원이 많아요. 잠시 후 다시 시도해 주세요.');return;}
 let clientId='user_'+crypto.randomBytes(6).toString('hex'),currentRoom=null,ownerHash=null,quizLoadUntil=0;
 const limits=new RequestLimits(),connectedAt=Date.now();
 ws.clientAddress=clientAddress(req);ws.path=socketPath(req,directSocket);
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;ws.lastPongAt=Date.now();});
 ws.connectedAt=connectedAt;ws.inRoom=()=>Boolean(currentRoom);
 ws.detachRoom=()=>{currentRoom=null;};
 // Compact deltas and acknowledged flow control are opt-in, so cached old clients keep working.
 function configureWorld(msg){ws.worldDeltaEnabled=msg.worldDelta===true;ws.worldCompact=msg.worldCompact===true;ws.worldFlow=msg.worldFlow===true;ws.worldSnapshotRoom=null;ws.worldPaused=false;}
 function listQuizzes(){send(ws,{type:'QUIZ_LIST',quizzes:library.list(ownerHash)});}
 function leave(preserve=false){
  if(!currentRoom)return;
  const room=currentRoom;currentRoom=null;
  // A delayed close/error from an old socket cannot detach its replacement.
  if(room.players.get(clientId)?.ws!==ws)return;
  if(preserve)room.disconnectPlayer(clientId,()=>{roomManager.cleanupEmptyRooms();if(roomManager.getRoom(room.id))room.broadcastRoomEvent();publishRooms();});
  else room.removePlayer(clientId);
  if(room.players.size)room.broadcastRoomEventSoon();
  roomManager.cleanupEmptyRooms();publishRooms();
 }
 ws.leaveRoom=()=>leave(true);
 function joined(player,token,resumed=false){
  send(ws,{type:'JOINED_ROOM',roomId:currentRoom.id,clientId:player.id,resumeToken:token,resumed,ownAnswer:player.submittedText,hasSubmitted:player.hasSubmitted,gameId:currentRoom.gameId,roundId:currentRoom.roundId});
 }
 function issueSession(player,resumed=false){const token=crypto.randomBytes(32).toString('hex');player.resumeTokenHash=resumeHash(token);joined(player,token,resumed);}
 // A resume or rejoin that sat in a stalled connection (TCP retransmitting) arrives after the
 // phone already took its seat back on a newer one. It must not evict that newer socket.
 function newerSocketHolds(player){const held=player.ws;return Boolean(held&&held!==ws&&held.readyState===1&&(held.connectedAt||0)>connectedAt);}
 function restorePlayer(room,player,{resumeToken=null,msg={}}={}){
  if(player.connected===false&&Date.now()>=player.disconnectedUntil){room.expirePlayer(player.id);return false;}
  if(newerSocketHolds(player))return false;
  if(currentRoom&&currentRoom!==room)leave();
  const oldWs=player.ws;
  if(oldWs&&oldWs!==ws){oldWs.detachRoom?.();oldWs.close(4001,'다른 탭에서 복귀했습니다.');}
  if(!room.resumePlayer(player,ws))return false;
  currentRoom=room;clientId=player.id;configureWorld(msg);
  if(resumeToken)joined(player,resumeToken,true);else issueSession(player,true);
  console.info('SESSION_RESTORED',JSON.stringify({roomId:room.id,clientId:player.id,path:ws.path}));
  room.sendCurrentState(ws);room.broadcastRoomEventSoon();room.broadcastWorldTick();publishRooms();return true;
 }
 const matchesRound=msg=>currentRoom&&msg.gameId===currentRoom.gameId&&msg.roundId===currentRoom.roundId&&typeof msg.roundId==='string';
 send(ws,{type:'WELCOME',clientId,features:{liveSync:true,quizLoadPassword:quizLoadGuard.enabled,race:true,minority:true,breakTime:true,worldDelta:true,resume:true,roundBinding:true,stateSync:true,worldCompact:true,worldFlow:true,timeSync:true,restartResume:!disabled,results:true,diag:true},rooms:roomManager.getRoomListSummary()});
 function move(msg){
  if(!currentRoom||typeof msg.x!=='number'||typeof msg.z!=='number')return;
  if(currentRoom.getCurrentQuestion()?.type==='RACE'&&currentRoom.state==='QUESTION'&&!matchesRound(msg))return;
  const moved=currentRoom.movePlayer(clientId,Number(msg.x),Number(msg.z),{enforceSpeed:true});
  if(moved===false){const p=currentRoom.players.get(clientId);send(ws,{type:'MOVE_CORRECTION',roomId:currentRoom.id,gameId:currentRoom.gameId,roundId:currentRoom.roundId,x:p.x,z:p.z});}
 }
 // A MOVE is an absolute spot, so after a stall only the newest matters. The limiter keeps
 // that one for a moment instead of dropping it and leaving the server on an older spot.
 let deferredMove=null,deferredTimer=null;
 function deferMove(msg){
  deferredMove=msg;if(deferredTimer)return;
  deferredTimer=setTimeout(()=>{
   deferredTimer=null;const next=deferredMove;deferredMove=null;
   if(!next||ws.readyState!==1||shuttingDown)return;
   if(limits.allow('move',30,20))move(next);else deferMove(next);
  },120);deferredTimer.unref?.();
 }
 ws.on('message',async raw=>{
  if(shuttingDown)return;
  if(!limits.allow('all',60,240))return;
  let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string'){
   send(ws,{type:'ERROR',message:'올바른 요청 형식이 아닙니다.'});return;
  }
  try{
   if(currentRoom&&roomManager.getRoom(currentRoom.id)!==currentRoom)currentRoom=null;
   if(['JOIN_ROOM','RESUME_ROOM','GET_ROOMS'].includes(msg.type))roomManager.sweepExpired();
   if(msg.type==='MOVE'&&!limits.allow('move',30,20)){deferMove(msg);return;}
   if(msg.type==='WORLD_ACK'){
    if(Number.isInteger(msg.seq))ws.worldAckSeq=Math.max(ws.worldAckSeq||0,Math.min(msg.seq,ws.worldSentSeq||0));
    return;
   }
   // At most one batch every 5 s per connection keeps a misbehaving client from flooding the log.
   if(msg.type==='CLIENT_DIAG'){
    if(limits.allow('diag',.2,3))for(const event of ClientDiag.sanitize(msg.events,msg.device))console.info('CLIENT_DIAG',JSON.stringify({clientId,roomId:currentRoom?.id||null,...event}));
    return;
   }
   if(msg.type==='ANSWER_EDITING'&&!limits.allow('editing',5,10))return;
   if(['SUBMIT_SHORT','SUBMIT_MULTIPLE'].includes(msg.type)&&!limits.allow('answer',5,10))return;
   if(msg.type==='CHAT'&&!limits.allow('chat',1,3)){send(ws,{type:'NOTICE',message:'채팅을 너무 빠르게 보내고 있어요.'});return;}
   switch(msg.type){
    case 'AUTH_LIBRARY':
     ownerHash=userHash(msg.token);ws.libraryOwnerHash=ownerHash;
     if(currentRoom){const me=currentRoom.players.get(clientId);if(me)me.ownerHash=ownerHash;}
     probeStaleOwnerSessions(ownerHash,ws);
     quizLoadUntil=0;
     library.claimLegacy(ownerHash,msg.legacyRoomTokens);listQuizzes();break;
    case 'UNLOCK_QUIZ_LIBRARY':
     if(!ownerHash)throw new Error('퀴즈 보관함 연결을 기다려 주세요.');
     quizLoadUntil=await quizLoadGuard.unlock(ws.clientAddress,msg.password);
     send(ws,{type:'QUIZ_LIBRARY_UNLOCKED',expiresAt:quizLoadUntil,requestId:msg.requestId});break;
     case 'LIST_PUBLIC_QUIZZES':
      quizLoadGuard.require(quizLoadUntil);
      send(ws,{type:'PUBLIC_QUIZ_LIST',quizzes:library.listPublic()});break;
    // Winner records are behind the same admin password as quiz loading.
    case 'LIST_RESULTS':
     if(!ownerHash)throw new Error('퀴즈 보관함 연결을 기다려 주세요.');
     quizLoadGuard.require(quizLoadUntil);
     send(ws,{type:'RESULT_LIST',results:results.recent(50),requestId:msg.requestId});break;
    case 'LIST_QUIZZES':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결 중입니다. 잠시 후 다시 눌러 주세요.');
     listQuizzes();break;
    case 'SAVE_QUIZ': {
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결 중입니다. 잠시 후 다시 눌러 주세요.');
     const result=library.saveByTitle(ownerHash,msg);
     if(result.confirmation){send(ws,{type:'QUIZ_SAVE_CONFIRM',title:result.title,version:result.version,requestId:msg.requestId});break;}
     send(ws,{type:'QUIZ_SAVED',...result,requestId:msg.requestId});listQuizzes();break;
    }
    case 'LOAD_QUIZ':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결되지 않았어요.');
     quizLoadGuard.require(quizLoadUntil);
     send(ws,{type:'QUIZ_LOADED',quiz:library.get(ownerHash,msg.quizId)});break;
    case 'DELETE_QUIZ':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결되지 않았어요.');
     library.delete(ownerHash,msg.quizId);
     for(const peer of wss.clients)if(peer.libraryOwnerHash===ownerHash){send(peer,{type:'QUIZ_DELETED',quizId:msg.quizId});send(peer,{type:'QUIZ_LIST',quizzes:library.list(ownerHash)});}break;
    case 'LOAD_QUIZ_BY_CODE':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결되지 않았어요.');
     quizLoadGuard.require(quizLoadUntil);
     checkCodeLimit(ws.clientAddress);
     send(ws,{type:'QUIZ_LOADED',quiz:library.getByCode(msg.code,ownerHash),byCode:true,requestId:msg.requestId});break;
    case 'GET_ROOMS':send(ws,{type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()});break;
    case 'APP_PING':
     if(limits.allow('ping',1,3))send(ws,{type:'APP_PONG',serverNow:Date.now(),t:Number.isFinite(msg.t)?msg.t:undefined,roomId:currentRoom?.id||null,stateVersion:currentRoom?.getStateVersion()});break;
    case 'GET_ROOM_STATE':
     if(!limits.allow('stateSync',1,2))break;
     if(currentRoom&&msg.roomId===currentRoom.id)currentRoom.sendCurrentState(ws,{recoveryRequestId:msg.requestId});
     else send(ws,{type:'ROOM_SESSION_MISSING',roomId:msg.roomId});
     break;
    case 'RESUME_ROOM':{
     if(currentRoom)break;
     const room=roomManager.getRoom(msg.roomId),hash=resumeHash(msg.resumeToken);
     const player=hash&&room&&[...room.players.values()].find(p=>p.resumeTokenHash===hash&&p.ownerHash===ownerHash);
     if(!ownerHash||!player||player.connected===false&&Date.now()>=player.disconnectedUntil){
      send(ws,{type:'RESUME_REJECTED',roomId:msg.roomId,roomExists:!!room});break;
     }
     if(!restorePlayer(room,player,{resumeToken:msg.resumeToken,msg}))send(ws,{type:'RESUME_REJECTED',roomId:msg.roomId,roomExists:!!roomManager.getRoom(msg.roomId)});break;
    }
    case 'CREATE_ROOM': {
     if(!ownerHash)throw new Error('퀴즈 보관함 연결을 기다려 주세요.');
     // Validate before saving or leaving the current room.
     const {parse}=require('../client/quizFiles');
     const draft=parse(JSON.stringify({version:1,title:msg.title,targetWinners:msg.targetWinners,restSeconds:msg.restSeconds,questions:msg.questions}));validatePlayable(draft.questions);
     leave();
     evictDuplicateOwner(ownerHash,clientId);
     const room=roomManager.createRoom(draft,clientId);currentRoom=room;room.creatorHash=ownerHash;
     configureWorld(msg);
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     issueSession(player);room.broadcastRoomEvent();publishRooms();break;
    }
    case 'JOIN_ROOM': {
     const room=roomManager.getRoom(msg.roomId);if(!room)throw new Error('이미 종료된 방입니다.');
     const ownPlayer=ownerHash&&[...room.players.values()].find(p=>p.ownerHash===ownerHash);
     if(ownPlayer&&newerSocketHolds(ownPlayer))throw new Error('다른 연결에서 이미 이 방에 들어와 있어요.');
     // Explicit re-entry by the same browser restores its existing seat/role,
     // including when sessionStorage was lost. Never create a second reservation.
     if(ownPlayer&&restorePlayer(room,ownPlayer,{msg}))break;
     const capacity=room.maxPlayers;
     const replacing=ownerHash?[...room.players.values()].filter(p=>p.id!==clientId&&p.ownerHash===ownerHash).length:0;
     // Reject before touching another tab, its room or host. A same-room
     // replacement reuses its own seat and keeps that room registered.
     if(!room.players.has(clientId)&&room.players.size-replacing>=capacity)throw new Error(`이 방은 최대 ${capacity}명까지 입장할 수 있어요.`);
     const inheritedHost=evictDuplicateOwner(ownerHash,clientId,room);
     if(currentRoom===room){configureWorld(msg);issueSession(room.players.get(clientId));room.broadcastRoomEvent();break;}
     leave();currentRoom=room;
     configureWorld(msg);
     if(inheritedHost||!room.hostId||!room.players.has(room.hostId))room.hostId=clientId;
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     if(inheritedHost||room.isCreator(player))room.hostId=clientId;
     issueSession(player);room.broadcastRoomEvent();publishRooms();break;
    }
    case 'LEAVE_ROOM':leave();send(ws,{type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()});break;
    case 'MOVE':deferredMove=null;move(msg);break;
    case 'CHAT': {
     currentRoom?.chat(clientId,msg.text);break;
    }
    case 'SUBMIT_SHORT':case 'SUBMIT_MULTIPLE':if(matchesRound(msg))currentRoom.submitAnswer(clientId,msg.answer);break;
    case 'ANSWER_EDITING':if(matchesRound(msg))currentRoom.submitAnswer(clientId,'',true);break;
    case 'START_GAME':if(currentRoom?.hostId===clientId&&['WAITING','ENDED'].includes(currentRoom.state)){currentRoom.startGame();publishRooms();}break;
    case 'RESET_GAME':if(currentRoom?.hostId===clientId){currentRoom.resetToWaiting();publishRooms();}break;
   }
  }catch(error){console.error('퀴즈/방 처리 실패:',error.message);send(ws,{type:'ERROR',code:error.code,message:error.message||'처리하지 못했어요. 다시 시도해 주세요.',requestId:msg.requestId});}
 });
 ws.on('close',code=>{
  // During shutdown the saved snapshot, not these closes, is what the next process restores.
  if(shuttingDown)return;
  const roomId=currentRoom?.id;leave(true);
  if(roomId)console.info('CONNECTION_CLOSED',JSON.stringify({roomId,clientId,code,seconds:Math.round((Date.now()-connectedAt)/1000),worldSkipped:ws.worldSkipped||0,path:ws.path}));
 });
 ws.on('error',()=>{if(!shuttingDown)leave(true);});
});
function shutdown(reason){
 if(shuttingDown)return;
 saveLiveRooms();shuttingDown=true;clearInterval(liveRoomsInterval);
 // Nothing may change after the saved snapshot: no messages (above) and no phase timers.
 // Otherwise an answer acknowledged in these last 400 ms, or a finish, is lost or doubled.
 roomManager.close();
 console.info('SERVER_SHUTDOWN',JSON.stringify({reason,rooms:roomManager.rooms.size,clients:wss.clients.size}));
 // 1012 tells clients this is a restart: keep the game screen and resume the seat.
 for(const peer of wss.clients){try{peer.close(1012,'서버를 다시 시작하고 있어요.');}catch{}}
 server.close();
 setTimeout(()=>process.exit(0),400).unref?.();
}
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
const recentFailures=[];
function unexpectedFailure(kind,error){
 console.error(kind,error?.stack||error);
 const now=Date.now();recentFailures.push(now);while(recentFailures[0]<now-60000)recentFailures.shift();
 // One bad message must not end every game; a burst hands the rooms to a fresh process.
 if(recentFailures.length>=20)shutdown(kind);
}
process.on('uncaughtException',error=>unexpectedFailure('UNCAUGHT_EXCEPTION',error));
process.on('unhandledRejection',error=>unexpectedFailure('UNHANDLED_REJECTION',error));
if(process.env.OX_PUBLIC_TEST_BOTS==='48'){
 const {enablePublicTestRoom}=require('./PublicTestRoom');
 const test=enablePublicTestRoom(roomManager);console.log(`PUBLIC_TEST_ROOM_READY ${test.room.id} · 봇 48명 / 사람 2명`);
}
if(process.env.OX_PLANA_TEST==='1'){
 const {enablePublicTestRoom}=require('./PublicTestRoom');
 const test=enablePublicTestRoom(roomManager,{botCount:49,avatars:['plana-original'],title:'[PLANA 원본] 봇 49명 · 사람 1명',key:'publicPlanaTestRoom'});console.log(`PLANA_TEST_ROOM_READY ${test.room.id} · 봇 49명 / 사람 1명`);
}
server.listen(PORT,()=>console.log(`모두의 퀴즈: http://localhost:${PORT}`));
