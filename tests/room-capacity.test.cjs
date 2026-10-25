const {test}=require('node:test'),assert=require('node:assert/strict');
const {Room,RoomManager,MAX_ROOM_PLAYERS}=require('../server/RoomManager');
test('모든 방은 50명 정원이며 클라이언트의 정원 변경 요청은 무시',()=>{
 assert.equal(MAX_ROOM_PLAYERS,50);
 const manager=new RoomManager({startLoop:false});
 const room=manager.createRoom({maxPlayers:1000,loadTestCapacity:101},'p0');room.addPlayer('p0','방장');
 const summary=manager.getRoomListSummary()[0];assert.equal(summary.playerCount,1);assert.equal(summary.maxPlayers,50);
});
test('50명까지 입장, 유령·관전자 포함 51번째 거절, 퇴장 후 재입장 허용',()=>{
 for(const state of ['WAITING','QUESTION','ENDED']){
  const room=new Room({},'p0');room.state=state;
  for(let i=0;i<50;i++)room.addPlayer('p'+i,'참가자');
  assert.equal(room.players.size,50);assert.throws(()=>room.addPlayer('overflow','초과'),/최대 50명/);
  assert.equal(room.players.size,50);room.removePlayer('p1');room.addPlayer('new','새 참가자');assert.equal(room.players.size,50);
 }
});
test('방 상태와 목록에서 현재 인원/정원을 전송하고 퇴장 후 목록 갱신',()=>{
 const manager=new RoomManager({startLoop:false}),room=manager.createRoom({},'host');let payload;
 room.addPlayer('host','방장',{readyState:1,send:json=>payload=JSON.parse(json)});
 room.broadcastRoomEvent();assert.equal(payload.playerCount,1);assert.equal(payload.maxPlayers,50);
 room.addPlayer('guest','손님');assert.equal(manager.getRoomListSummary()[0].playerCount,2);
 room.removePlayer('guest');assert.equal(manager.getRoomListSummary()[0].playerCount,1);
});
