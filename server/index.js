const http=require('http');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const express=require('express');
const {WebSocketServer}=require('ws');
const {RoomManager}=require('./RoomManager');
const {RoomStore}=require('./RoomStore');
const {QuizLibrary,userHash}=require('./QuizLibrary');
const PORT=process.env.PORT||3000;
const app=express();
app.use(express.static(path.join(__dirname,'../client'),{etag:false,lastModified:false,setHeaders:res=>res.setHeader('Cache-Control','no-store')}));
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
    if(!ids.has(sq.id)){quizzes.push(sq);ids.add(sq.id);if(sq.code)codes.add(sq.code);added=true;}
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
function evictDuplicateOwner(targetOwnerHash,exceptClientId=null,targetRoom=null){
 if(!targetOwnerHash)return false;
 let wasHostInTarget=false,changed=false;
 for(const r of roomManager.rooms.values()){
  for(const [pid,p] of [...r.players.entries()]){
   if(pid!==exceptClientId&&p.ownerHash===targetOwnerHash){
    if(r===targetRoom&&r.hostId===pid)wasHostInTarget=true;
    p.ws?.detachRoom?.();
    r.removePlayer(pid);
    try{p.ws?.terminate?.();}catch{}
    if(r!==targetRoom&&r.players.size)r.broadcastRoomEvent();
    changed=true;
   }
  }
 }
 if(changed)roomManager.cleanupEmptyRooms();
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
 const clientId='user_'+crypto.randomBytes(6).toString('hex');let currentRoom=null,ownerHash=null;
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
 ws.detachRoom=()=>{currentRoom=null;};
 function listQuizzes(){send(ws,{type:'QUIZ_LIST',quizzes:library.list(ownerHash)});}
 function leave(){
  if(!currentRoom)return;
  const room=currentRoom;currentRoom=null;
  room.removePlayer(clientId);
  if(room.players.size)room.broadcastRoomEvent();
  roomManager.cleanupEmptyRooms();publishRooms();
 }
 ws.leaveRoom=leave;
 send(ws,{type:'WELCOME',clientId,features:{minority:true,breakTime:true},rooms:roomManager.getRoomListSummary()});
 ws.on('message',raw=>{
  let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
  try{
   if(currentRoom&&roomManager.getRoom(currentRoom.id)!==currentRoom)currentRoom=null;
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
    case 'CREATE_ROOM': {
     if(!ownerHash)throw new Error('퀴즈 보관함 연결을 기다려 주세요.');
     // Validate before saving or leaving the current room.
     const {parse}=require('../client/quizFiles');
     const draft=parse(JSON.stringify({version:1,title:msg.title,targetWinners:msg.targetWinners,restSeconds:msg.restSeconds,questions:msg.questions}));validatePlayable(draft.questions);
     leave();
     evictDuplicateOwner(ownerHash,clientId);
     const room=roomManager.createRoom(draft,clientId);currentRoom=room;
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     send(ws,{type:'JOINED_ROOM',roomId:room.id,clientId});room.broadcastRoomEvent();publishRooms();break;
    }
    case 'JOIN_ROOM': {
     const room=roomManager.getRoom(msg.roomId);if(!room)throw new Error('이미 종료된 방입니다.');
     const inheritedHost=evictDuplicateOwner(ownerHash,clientId,room);
     if(!room.players.has(clientId)&&room.players.size>=100)throw new Error('이 방은 최대 100명까지 입장할 수 있어요.');
     if(currentRoom===room){send(ws,{type:'JOINED_ROOM',roomId:room.id,clientId});room.broadcastRoomEvent();break;}
     leave();currentRoom=room;
     if(inheritedHost||!room.hostId||!room.players.has(room.hostId))room.hostId=clientId;
     const player=room.addPlayer(clientId,msg.nickname||'참가자',ws,msg.avatarId);player.ownerHash=ownerHash;
     if(inheritedHost)room.hostId=clientId;
     send(ws,{type:'JOINED_ROOM',roomId:room.id,clientId});room.broadcastRoomEvent();publishRooms();break;
    }
    case 'LEAVE_ROOM':leave();send(ws,{type:'ROOM_LIST',rooms:roomManager.getRoomListSummary()});break;
    case 'MOVE':if(currentRoom)currentRoom.movePlayer(clientId,Number(msg.x),Number(msg.z));break;
    case 'CHAT': {
     const player=currentRoom?.players.get(clientId),text=String(msg.text||'').trim().slice(0,40);
     if(player&&text)currentRoom.sendToAll(JSON.stringify({type:'CHAT_MSG',senderId:clientId,senderName:player.name,text}));break;
    }
    case 'SUBMIT_SHORT':case 'SUBMIT_MULTIPLE':if(currentRoom)currentRoom.submitAnswer(clientId,msg.answer);break;
    case 'ANSWER_EDITING':if(currentRoom)currentRoom.submitAnswer(clientId,'',true);break;
    case 'START_GAME':if(currentRoom?.hostId===clientId&&['WAITING','ENDED'].includes(currentRoom.state)){currentRoom.startGame();publishRooms();}break;
    case 'RESET_GAME':if(currentRoom?.hostId===clientId){currentRoom.resetToWaiting();publishRooms();}break;
   }
  }catch(error){console.error('퀴즈/방 처리 실패:',error.message);send(ws,{type:'ERROR',message:error.message||'처리하지 못했어요. 다시 시도해 주세요.',requestId:msg.requestId});}
 });
 ws.on('close',leave);
 ws.on('error',leave);
});
server.listen(PORT,()=>console.log(`모두의 퀴즈: http://localhost:${PORT}`));
