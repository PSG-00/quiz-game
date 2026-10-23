const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGate,keyFor}=require('../client/resultNotifications');
function storage(){const data=new Map();return{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}
const ended={state:'ENDED',roomId:'room1',gameId:'game1',stateEndTime:100,winners:[{id:'p1'}]};
test('같은 게임의 종료 상태가 반복되어도 결과 안내는 한 번만 표시',()=>{
 const gate=createGate(storage());assert.equal(gate.consume(ended),true);
 for(let i=0;i<100;i++)assert.equal(gate.consume({...ended,hostId:'new-host',serverNow:i}),false);
});
test('창을 닫은 뒤 새로고침·재입장해도 같은 게임의 결과를 자동 재표시하지 않음',()=>{
 const saved=storage();assert.equal(createGate(saved).consume(ended),true);assert.equal(createGate(saved).consume({...ended}),false);
});
test('새 게임·다른 방의 결과는 각각 한 번씩 표시',()=>{
 const gate=createGate(storage());gate.consume(ended);assert.equal(gate.consume({...ended,gameId:'game2'}),true);assert.equal(gate.consume({...ended,roomId:'room2'}),true);
});
test('아직 종료되지 않은 게임은 결과 안내 기록에 추가하지 않음',()=>{
 const gate=createGate(storage());for(const state of ['WAITING','COUNTDOWN','QUESTION','JUDGE','LOTTERY'])assert.equal(gate.consume({...ended,state}),false);assert.equal(gate.consume(ended),true);
});
test('기존 실행 중인 서버의 종료 시각으로도 중복 결과창 방지',()=>{
 const gate=createGate(storage());const old={...ended,gameId:undefined};assert.equal(gate.consume(old),true);assert.equal(gate.consume({...old,serverNow:200}),false);assert.equal(gate.consume({...old,stateEndTime:300}),true);
});
test('브라우저 저장소가 막혀 있어도 메모리로 결과창 반복 방지',()=>{
 const gate=createGate({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});assert.equal(gate.consume(ended),true);assert.equal(gate.consume(ended),false);assert.equal(keyFor(null),null);
});
test('새 게임은 다른 식별자를 보내고 같은 게임의 인원 변경은 식별자를 유지',()=>{
 const {Room}=require('../server/RoomManager');const room=new Room({},'host');room.addPlayer('host','주최자');room.startGame();clearTimeout(room.timerHandle);const first=room.gameId;let snapshot;room.sendToAll=value=>snapshot=JSON.parse(value);room.broadcastRoomEvent();assert.equal(snapshot.gameId,first);room.addPlayer('visitor','참가자');room.removePlayer('visitor');room.broadcastRoomEvent();assert.equal(snapshot.gameId,first);room.resetToWaiting();room.startGame();clearTimeout(room.timerHandle);assert.notEqual(room.gameId,first);
});
