// Isolated IPC-only test controls; never loaded by the production entry point.
const {RoomManager}=require('../../server/RoomManager');let manager;
const original=RoomManager.prototype.createRoom;
RoomManager.prototype.createRoom=function(...args){manager=this;return original.apply(this,args);};
process.env.OX_DISABLE_PERSISTENCE='1';delete process.env.OX_PUBLIC_TEST_BOTS;
require('../../server/index');
function view(room){if(!room)return null;return {id:room.id,state:room.state,hostId:room.hostId,gameId:room.gameId,roundId:room.roundId,index:room.currentQuestionIndex,end:room.stateEndTime,participants:[...room.roundParticipants],players:[...room.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,alive:p.alive,eligible:p.eligible,connected:p.connected,answer:p.submittedText,submitted:p.hasSubmitted,editing:p.isEditing,avatar:p.avatarId,result:p.lastResult}))};}
process.on('message',message=>{try{
 const room=manager?.getRoom(message.roomId);let result;
 if(message.command==='rooms')result=manager?[...manager.rooms.values()].map(view):[];
 else if(message.command==='snapshot')result=view(room);
 else if(message.command==='lose-expiry-timer'){
  const p=room.players.get(message.playerId);if(p.disconnectTimer)clearTimeout(p.disconnectTimer);p.disconnectedUntil=Date.now()-1;result=view(room);
 }
 else if(message.command==='profile-room'){
  const controller=require('../../server/PublicTestRoom').enablePublicTestRoom(manager);
  controller.room.addPlayer('profile-extra','부하봇049',null,'woni');
  result=view(controller.room);
 }
 else if(message.command==='break'){
  if(room.timerHandle)clearTimeout(room.timerHandle);
  room.restSeconds=1;room.breakBeforeNextQuestion();room.broadcastWorldTick();result=view(room);
 }
 else if(message.command==='patch'){
  for(const [id,patch] of Object.entries(message.players||{})){const p=room.players.get(id);if(p){Object.assign(p,patch);room.placePlayerInRoleZone(p);}}
  room.broadcastWorldTick();result=view(room);
 }else if(message.command==='reset'){
  room.resetToWaiting();room.broadcastWorldTick();result=view(room);
 }
 else if(message.command==='question'){
  if(room.timerHandle)clearTimeout(room.timerHandle);
  const index=message.index??0;room.questions[index]={type:'OX',answer:'O',choices:[],timeLimit:15,question:'점검',...message.question,index};
  room.currentQuestionIndex=index;room.gameId=message.gameId||'audit-game';room.roundId=require('crypto').randomUUID();room.state='QUESTION';room.stateEndTime=Date.now()+(message.duration??15000);room.minorityOutcome=null;
  for(const p of room.players.values()){p.alive=true;p.hasSubmitted=false;p.submittedText='';p.lastResult=null;p.isEditing=false;if(message.positions?.[p.id])Object.assign(p,message.positions[p.id]);}
  room.roundParticipants=new Set(room.players.keys());for(const p of room.players.values())room.placePlayerInRoleZone(p);
  for(const p of room.players.values())if(message.positions?.[p.id])Object.assign(p,message.positions[p.id]);
  room.broadcastRoomEvent();room.broadcastWorldTick();result=view(room);
 }else if(message.command==='expire'){
  const p=room.players.get(message.playerId);p.disconnectedUntil=Date.now()-1;room.expirePlayer(p.id);result=view(manager.getRoom(message.roomId));
 }else if(message.command==='start'){
  room.startGame();if(room.timerHandle)clearTimeout(room.timerHandle);result=view(room);
 }else if(message.command==='next'){
  room.nextQuestion({skipPreparation:true});if(room.timerHandle)clearTimeout(room.timerHandle);room.broadcastWorldTick();result=view(room);
 }else if(message.command==='judge'){
  room.stateEndTime=Date.now();room.judgeQuestion();if(room.timerHandle)clearTimeout(room.timerHandle);room.broadcastWorldTick();result=view(room);
 }else throw Error('Unknown audit command');
 process.send({id:message.id,result});
}catch(error){process.send({id:message.id,error:error.message});}});
