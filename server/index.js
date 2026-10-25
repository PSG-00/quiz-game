const http=require('http');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const express=require('express');
const {WebSocketServer}=require('ws');
const {RoomManager}=require('./RoomManager');
const {RoomStore}=require('./RoomStore');
const {QuizLibrary,userHash}=require('./QuizLibrary');
const {cacheControl}=require('./staticCache');
const {RequestLimits}=require('./RequestLimits');
const MAX_CONNECTIONS=Math.max(50,Number.parseInt(process.env.OX_MAX_CONNECTIONS,10)||500);
const PORT=process.env.PORT||3000;
const app=express();
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use(express.static(path.join(__dirname,'../client'),{etag:true,lastModified:true,setHeaders:(res,file)=>res.setHeader('Cache-Control',cacheControl(file))}));
const disabled=process.env.OX_DISABLE_PERSISTENCE==='1';
const oldFile=disabled?null:(process.env.OX_DATA_FILE||path.join(__dirname,'../data/rooms.json'));
const quizFile=disabled?null:(process.env.OX_QUIZ_FILE||(process.env.OX_DATA_FILE?process.env.OX_DATA_FILE+'.quizzes.json':path.join(__dirname,'../data/quizzes.json')));

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
 const file=path.join(__dirname,'../data/recovered-browser-draft.json');
 if(disabled||process.env.OX_DATA_FILE||!fs.existsSync(file))return res.json(null);
 res.json(JSON.parse(fs.readFileSync(file,'utf8')));
});
const server=http.createServer(app),wss=new WebSocketServer({server,maxPayload:5*1024*1024});
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg));}
function publishRooms(){const msg={type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()};for(const peer of wss.clients)send(peer,msg);}
function validatePlayable(questions){
 if(!Array.isArray(questions)||!questions.length)throw new Error('문제를 한 개 이상 작성해 주세요.');
 for(let i=0;i<questions.length;i++){
  const q=questions[i];
  if(!q.question.trim()||(q.type!=='MINORITY'&&!q.answer.trim())||(q.type==='SHORT'&&!q.answer.split(',').some(a=>a.trim()))||(q.type==='MULTIPLE'&&q.choices.some(c=>!c.trim())))throw new Error(`문제 ${i+1}의 내용·정답·보기를 완성해 주세요. 임시 저장은 미완성 상태에서도 가능해요.`);
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
    oldWs.isAlive=false;
    try{oldWs.ping();}catch{oldWs.leaveRoom?.();continue;}
    const timer=setTimeout(()=>{if(oldWs.isAlive===false){oldWs.leaveRoom?.();try{oldWs.terminate();}catch{}}},1500);
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
wss.on('connection',ws=>{
 if(wss.clients.size>MAX_CONNECTIONS){ws.on('error',()=>{});ws.close(1013,'서버 접속 인원이 많아요. 잠시 후 다시 시도해 주세요.');return;}
 let clientId='user_'+crypto.randomBytes(6).toString('hex'),currentRoom=null,ownerHash=null;
 const limits=new RequestLimits();
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
 ws.detachRoom=()=>{currentRoom=null;};
 function listQuizzes(){send(ws,{type:'QUIZ_LIST',quizzes:library.list(ownerHash)});}
 function leave(preserve=false){
  if(!currentRoom)return;
  const room=currentRoom;currentRoom=null;
  if(preserve)room.disconnectPlayer(clientId,()=>{roomManager.cleanupEmptyRooms();if(roomManager.getRoom(room.id))room.broadcastRoomEvent();publishRooms();});
  else room.removePlayer(clientId);
  if(room.players.size)room.broadcastRoomEvent();
  roomManager.cleanupEmptyRooms();publishRooms();
 }
 ws.leaveRoom=()=>leave(true);
 function joined(player,token,resumed=false){
  send(ws,{type:'JOINED_ROOM',roomId:currentRoom.id,clientId:player.id,resumeToken:token,resumed,ownAnswer:player.submittedText,hasSubmitted:player.hasSubmitted,gameId:currentRoom.gameId,roundId:currentRoom.roundId});
 }
 function issueSession(player){const token=crypto.randomBytes(32).toString('hex');player.resumeTokenHash=resumeHash(token);joined(player,token);}
 const matchesRound=msg=>currentRoom&&msg.gameId===currentRoom.gameId&&msg.roundId===currentRoom.roundId&&typeof msg.roundId==='string';
 send(ws,{type:'WELCOME',clientId,features:{minority:true,breakTime:true,worldDelta:true,resume:true,roundBinding:true},rooms:roomManager.getRoomListSummary()});
 ws.on('message',raw=>{
  if(!limits.allow('all',60,120))return;
  let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string'){
   send(ws,{type:'ERROR',message:'올바른 요청 형식이 아닙니다.'});return;
  }
  try{
   if(currentRoom&&roomManager.getRoom(currentRoom.id)!==currentRoom)currentRoom=null;
   if(msg.type==='MOVE'&&!limits.allow('move',30,10))return;
   if(msg.type==='ANSWER_EDITING'&&!limits.allow('editing',5,10))return;
   if(['SUBMIT_SHORT','SUBMIT_MULTIPLE'].includes(msg.type)&&!limits.allow('answer',5,10))return;
   if(msg.type==='CHAT'&&!limits.allow('chat',1,3)){send(ws,{type:'NOTICE',message:'채팅을 너무 빠르게 보내고 있어요.'});return;}
   switch(msg.type){
    case 'AUTH_LIBRARY':
     ownerHash=userHash(msg.token);ws.libraryOwnerHash=ownerHash;
     if(currentRoom){const me=currentRoom.players.get(clientId);if(me)me.ownerHash=ownerHash;}
     probeStaleOwnerSessions(ownerHash,ws);
     library.claimLegacy(ownerHash,msg.legacyRoomTokens);listQuizzes();break;
     case 'LIST_PUBLIC_QUIZZES':
      send(ws,{type:'PUBLIC_QUIZ_LIST',quizzes:library.listPublic()});break;
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
     send(ws,{type:'QUIZ_LOADED',quiz:library.get(ownerHash,msg.quizId)});break;
    case 'DELETE_QUIZ':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결되지 않았어요.');
     library.delete(ownerHash,msg.quizId);
     for(const peer of wss.clients)if(peer.libraryOwnerHash===ownerHash){send(peer,{type:'QUIZ_DELETED',quizId:msg.quizId});send(peer,{type:'QUIZ_LIST',quizzes:library.list(ownerHash)});}break;
    case 'LOAD_QUIZ_BY_CODE':
     if(!ownerHash)throw new Error('퀴즈 보관함에 연결되지 않았어요.');
     checkCodeLimit(ws._socket.remoteAddress);
     send(ws,{type:'QUIZ_LOADED',quiz:library.getByCode(msg.code,ownerHash),byCode:true,requestId:msg.requestId});break;
    case 'GET_ROOMS':send(ws,{type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()});break;
    case 'RESUME_ROOM':{
     if(currentRoom)break;
     const room=roomManager.getRoom(msg.roomId),hash=resumeHash(msg.resumeToken);
     const player=hash&&room&&[...room.players.values()].find(p=>p.resumeTokenHash===hash&&p.ownerHash===ownerHash);
     if(!ownerHash||!player||player.connected===false&&Date.now()>=player.disconnectedUntil){
      send(ws,{type:'RESUME_REJECTED',roomId:msg.roomId,roomExists:!!room});break;
     }
     if(currentRoom&&currentRoom!==room)leave();
     const oldWs=player.ws;
     if(oldWs&&oldWs!==ws){oldWs.detachRoom?.();oldWs.close(4001,'다른 탭에서 복귀했습니다.');}
     currentRoom=room;clientId=player.id;room.resumePlayer(player,ws);
     ws.worldDeltaEnabled=msg.worldDelta===true;ws.worldSnapshotRoom=null;
     joined(player,msg.resumeToken,true);room.broadcastRoomEvent();room.broadcastWorldTick();publishRooms();break;
    }
    case 'CREATE_ROOM': {
     if(!ownerHash)throw new Error('퀴즈 보관함 연결을 기다려 주세요.');
     // Validate before saving or leaving the current room.
     const {parse}=require('../client/quizFiles');
     const draft=parse(JSON.stringify({version:1,title:msg.title,targetWinners:msg.targetWinners,restSeconds:msg.restSeconds,questions:msg.questions}));validatePlayable(draft.questions);
     leave();
     evictDuplicateOwner(ownerHash,clientId);
     const room=roomManager.createRoom(draft,clientId);currentRoom=room;
     ws.worldDeltaEnabled=msg.worldDelta===true;ws.worldSnapshotRoom=null;
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     issueSession(player);room.broadcastRoomEvent();publishRooms();break;
    }
    case 'JOIN_ROOM': {
     const room=roomManager.getRoom(msg.roomId);if(!room)throw new Error('이미 종료된 방입니다.');
     const capacity=room.maxPlayers;
     const replacing=ownerHash?[...room.players.values()].filter(p=>p.id!==clientId&&p.ownerHash===ownerHash).length:0;
     // Reject before touching another tab, its room or host. A same-room
     // replacement reuses its own seat and keeps that room registered.
     if(!room.players.has(clientId)&&room.players.size-replacing>=capacity)throw new Error(`이 방은 최대 ${capacity}명까지 입장할 수 있어요.`);
     const inheritedHost=evictDuplicateOwner(ownerHash,clientId,room);
     if(currentRoom===room){ws.worldDeltaEnabled=msg.worldDelta===true;ws.worldSnapshotRoom=null;issueSession(room.players.get(clientId));room.broadcastRoomEvent();break;}
     leave();currentRoom=room;
     ws.worldDeltaEnabled=msg.worldDelta===true;ws.worldSnapshotRoom=null;
     if(inheritedHost||!room.hostId||!room.players.has(room.hostId))room.hostId=clientId;
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     if(inheritedHost)room.hostId=clientId;
     issueSession(player);room.broadcastRoomEvent();publishRooms();break;
    }
    case 'LEAVE_ROOM':leave();send(ws,{type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()});break;
    case 'MOVE':if(currentRoom&&typeof msg.x==='number'&&typeof msg.z==='number'){
     const moved=currentRoom.movePlayer(clientId,Number(msg.x),Number(msg.z),{enforceSpeed:true});
     if(moved===false){const p=currentRoom.players.get(clientId);send(ws,{type:'MOVE_CORRECTION',roomId:currentRoom.id,x:p.x,z:p.z});}
    }break;
    case 'CHAT': {
     currentRoom?.chat(clientId,msg.text);break;
    }
    case 'SUBMIT_SHORT':case 'SUBMIT_MULTIPLE':if(matchesRound(msg))currentRoom.submitAnswer(clientId,msg.answer);break;
    case 'ANSWER_EDITING':if(matchesRound(msg))currentRoom.submitAnswer(clientId,'',true);break;
    case 'START_GAME':if(currentRoom?.hostId===clientId&&['WAITING','ENDED'].includes(currentRoom.state)){currentRoom.startGame();publishRooms();}break;
    case 'RESET_GAME':if(currentRoom?.hostId===clientId){currentRoom.resetToWaiting();publishRooms();}break;
   }
  }catch(error){console.error('퀴즈/방 처리 실패:',error.message);send(ws,{type:'ERROR',message:error.message||'처리하지 못했어요. 다시 시도해 주세요.',requestId:msg.requestId});}
 });
 ws.on('close',()=>leave(true));
 ws.on('error',()=>leave(true));
});
if(process.env.OX_PUBLIC_TEST_BOTS==='48'){
 const {enablePublicTestRoom}=require('./PublicTestRoom');
 const test=enablePublicTestRoom(roomManager);console.log(`PUBLIC_TEST_ROOM_READY ${test.room.id} · 봇 48명 / 사람 2명`);
}
server.listen(PORT,()=>console.log(`모두의 퀴즈: http://localhost:${PORT}`));
