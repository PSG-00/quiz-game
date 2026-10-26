const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../client/roomStateSync');
const {Room}=require('../server/RoomManager');
test('특정 기기의 단계 알림 누락은 월드 버전으로 감지, 재요청은 초당 1회로 제한',()=>{
 const sync=create(),state={state:'BREAK',stateEndTime:10000};sync.accept(2);
 assert.equal(sync.due(state,5000,0),false);sync.observe(3);
 assert.equal(sync.due(state,5000,10),true);assert.equal(sync.due(state,5000,500),false);
 sync.accept(2);assert.equal(sync.due(state,5000,1010),true);
 sync.accept(3);assert.equal(sync.due(state,5000,2010),false);
 sync.observe(2);assert.equal(sync.due(state,5000,3010),false);
});
test('타이머 종료·앱 복귀·화면 처리 실패 재동기화와 방 변경 초기화',()=>{
 const sync=create(),state={state:'BREAK',stateEndTime:10000};sync.accept(1);
 assert.equal(sync.due(state,10249,0),false);assert.equal(sync.due(state,10250,1),true);
 sync.accept(1);assert.equal(sync.due(state,11000,1001),true);
 sync.accept(2);assert.equal(sync.due({state:'QUESTION',stateEndTime:20000},11000,2001),false);
 sync.invalidate();assert.equal(sync.due({state:'WAITING'},11000,2002),true);
 sync.reset();assert.equal(sync.due(null,0,0),false);
 sync.invalidate();assert.equal(sync.due(null,0,0),true);
});
test('현재 상태 재전송은 요청자에게만 보내며 단계·마감·진행 타이머를 변경하지 않음',()=>{
 const room=new Room({title:'동기화 점검',questions:[{type:'SHORT',question:'수도',answer:'서울',timeLimit:15}]},'a');
 const first={readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw));}},other={...first,messages:[]};
 room.addPlayer('a','A',first);room.addPlayer('b','B',other);
 room.state='QUESTION';room.gameId='game';room.roundId='round';room.currentQuestionIndex=0;room.stateEndTime=Date.now()+15000;
 room.broadcastRoomEvent();const version=first.messages.at(-1).stateVersion,count=other.messages.length,end=room.stateEndTime;
 room.broadcastRoomEvent({},first);
 assert.equal(first.messages.at(-1).stateVersion,version);assert.equal(first.messages.at(-1).currentQuestion.answer,undefined);
 assert.equal(other.messages.length,count);assert.equal(room.stateEndTime,end);assert.equal(room.state,'QUESTION');
 room.state='BREAK';assert.equal(room.getStateVersion(),version+1);
});

test('강제 복구는 요청자에게 최신 단계와 전체 월드를 함께 보내며 다른 사용자에게 방송하지 않음',()=>{
 const room=new Room({},'a'),first={readyState:1,worldDeltaEnabled:true,messages:[],send(raw){this.messages.push(JSON.parse(raw));}},second={...first,messages:[]};room.addPlayer('a','A',first);room.addPlayer('b','B',second);room.broadcastWorldTick();first.messages=[];second.messages=[];room.players.get('a').x=3;room.sendCurrentState(first);
 assert.deepEqual(first.messages.map(m=>m.type),['ROOM_STATE','WORLD_TICK']);assert.equal(first.messages[1].p.find(p=>p.i==='a').x,3);assert.equal(second.messages.length,0);
 const seq=first.messages[1].seq;room.broadcastWorldTick();assert.ok(first.messages.at(-1).seq>seq);
});
