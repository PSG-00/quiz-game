const {test}=require('node:test'),assert=require('node:assert/strict');
const {RoomManager}=require('../server/RoomManager'),{enablePublicTestRoom,TITLE}=require('../server/PublicTestRoom');
function setup(){const manager=new RoomManager({startLoop:false});return {manager,testRoom:enablePublicTestRoom(manager,{startLoop:false})};}
test('공개 테스트 방은 하나만 생성하고 봇 48명과 사람 2자리, 모든 문제 15초',()=>{
 const {manager,testRoom}=setup();assert.equal(enablePublicTestRoom(manager,{startLoop:false}),testRoom);assert.equal(manager.rooms.size,1);
 const room=testRoom.room;assert.equal(room.title,TITLE);assert.equal(room.players.size,48);assert.equal(room.maxPlayers,50);assert.ok(room.questions.every(q=>q.timeLimit===15));
 room.addPlayer('h1','첫 사람');room.addPlayer('h2','두 번째');assert.equal(room.players.size,50);assert.throws(()=>room.addPlayer('h3','세 번째'),/최대 50명/);manager.close();
});
test('첫 사람이 방장, 퇴장 시 다음 사람에게 넘기고 사람이 없어도 방 유지',()=>{
 const {manager,testRoom}=setup(),room=testRoom.room;room.addPlayer('h1','첫 사람');room.addPlayer('h2','두 번째');assert.equal(room.hostId,'h1');
 room.removePlayer('h1');assert.equal(room.hostId,'h2');room.removePlayer('h2');assert.ok(room.testBotIds.has(room.hostId));manager.cleanupEmptyRooms();assert.equal(manager.rooms.size,1);
 room.addPlayer('h3','새 사람');assert.equal(room.hostId,'h3');manager.close();
});
test('사람이 없으면 봇 이동 정지, 입장하면 기존 패턴으로 이동하고 역할 경계 유지',()=>{
 const {manager,testRoom}=setup(),room=testRoom.room,p=room.players.values().next().value,before={x:p.x,z:p.z};testRoom.tick(10000);assert.deepEqual({x:p.x,z:p.z},before);
 room.addPlayer('h1','사람');testRoom.tick(10000);assert.notDeepEqual({x:p.x,z:p.z},before);
 p.alive=false;testRoom.tick(11000);assert.ok(p.z>=8.6&&p.z<=9.8);manager.close();
});
test('주관식도 봇이 답하고 일반 방의 방장 이전 규칙에는 영향 없음',()=>{
 const {manager,testRoom}=setup(),room=testRoom.room;room.addPlayer('h1','사람');room.currentQuestionIndex=4;room.state='QUESTION';room.gameId='test';room.stateEndTime=Date.now()+15000;room.roundParticipants=new Set(room.players.keys());
 testRoom.tick();assert.equal([...room.players.values()].filter(p=>p.hasSubmitted).length,48);
 const normal=manager.createRoom({},'first');normal.addPlayer('first','첫 사람');normal.addPlayer('second','두 번째');normal.removePlayer('first');assert.equal(normal.hostId,'second');manager.close();
});
