const {test}=require('node:test'),assert=require('node:assert/strict');
const {Room,RoomManager,computeZone}=require('../server/RoomManager');
const {RequestLimits}=require('../server/RequestLimits');
const rules=require('../client/arenaRules');
function room(t,questions){
 const r=new Room({targetWinners:1,questions:questions||[
  {type:'OX',question:'첫 문제',answer:'O',timeLimit:15},
  {type:'SHORT',question:'부활전',answer:'서울',isRevival:true,timeLimit:15}
 ]},'a');r.addPlayer('a','A');r.addPlayer('b','B');
 t.after(()=>{clearTimeout(r.timerHandle);for(const p of r.players.values())clearTimeout(p.disconnectTimer);});return r;
}
function open(r){r.startGame();clearTimeout(r.timerHandle);r.nextQuestion({skipPreparation:true});clearTimeout(r.timerHandle);}

test('시작 명단 고정: 카운트다운·일반 문제 중 입장자는 부활전에도 관전 전용',t=>{
 const r=room(t);r.startGame();clearTimeout(r.timerHandle);const early=r.addPlayer('early','카운트다운 입장');
 r.nextQuestion({skipPreparation:true});clearTimeout(r.timerHandle);const late=r.addPlayer('late','문제 중 입장');
 r.players.get('b').alive=false;r.nextQuestion({skipPreparation:true});clearTimeout(r.timerHandle);
 assert.deepEqual([...r.roundParticipants],['b']);
 for(const p of [early,late]){assert.equal(p.eligible,false);assert.equal(r.isPlayerOnStage(p),false);r.submitAnswer(p.id,'서울');assert.equal(p.hasSubmitted,false);}
 r.submitAnswer('b','서울');r.judgeQuestion();clearTimeout(r.timerHandle);
 assert.equal(r.players.get('b').alive,true);assert.equal(early.alive,false);assert.equal(late.alive,false);
 assert.equal(r.getGhostPlayers().length,0);
});

test('연결 단절만으로 죽지 않지만 마지막 서버 좌표로 계속 판정, 복귀해도 탈락 취소 없음',t=>{
 const r=room(t);open(r);const a=r.players.get('a');a.x=2;r.players.get('b').x=-2;
 r.disconnectPlayer('a');assert.equal(a.alive,true);assert.equal(a.connected,false);assert.equal(r.hostId,'b');
 r.judgeQuestion();clearTimeout(r.timerHandle);assert.equal(a.alive,false);
 assert.equal(r.resumePlayer(a,{readyState:1}),true);assert.equal(a.alive,false);assert.equal(a.eligible,true);assert.equal(r.hostId,'b');
});

test('30초 경계: 직전 복귀 허용, 정확히 만료 시 복귀 거절·퇴장 후 재입장은 관전',t=>{
 const r=room(t);open(r);const a=r.players.get('a');r.disconnectPlayer('a',null,1000);
 assert.equal(r.resumePlayer(a,null,30999),true);r.disconnectPlayer('a',null,1000);
 assert.equal(r.resumePlayer(a,null,31000),false);assert.equal(r.expirePlayer('a',30999),false);
 assert.equal(r.expirePlayer('a',31000),true);assert.equal(r.players.has('a'),false);
 const late=r.addPlayer('new-a','다시 입장');assert.equal(late.eligible,false);assert.equal(late.alive,false);
});

test('50명에 예약 자리 포함, 예약 복귀는 자리 추가 없이 처리',t=>{
 const r=room(t);for(let i=2;i<50;i++)r.addPlayer('p'+i,'참가자');open(r);
 const p=r.players.get('a');r.disconnectPlayer('a');assert.equal(r.players.size,50);assert.throws(()=>r.addPlayer('new','관전'),/50/);
 assert.equal(r.resumePlayer(p,null),true);assert.equal(r.players.size,50);
});

test('마지막 연결 단절은 방 유지, 유예 만료 후에만 빈 방과 타이머 정리',()=>{
 const manager=new RoomManager({startLoop:false}),r=manager.createRoom({},'a');r.addPlayer('a','A');
 r.startGame();clearTimeout(r.timerHandle);
 r.disconnectPlayer('a',()=>manager.cleanupEmptyRooms(),1000);manager.cleanupEmptyRooms();assert.equal(manager.getRoom(r.id),r);
 assert.equal(r.hostId,null);assert.equal(r.expirePlayer('a',31000),true);assert.equal(manager.getRoom(r.id),undefined);manager.close();
});

test('시작 전 단절은 즉시 퇴장·자리 해제·방장 승계, 복귀 예약 없음',t=>{
 const r=room(t);const a=r.players.get('a');r.disconnectPlayer('a');
 assert.equal(r.players.has('a'),false);assert.equal(r.hostId,'b');assert.equal(r.players.size,1);
 assert.equal(a.disconnectTimer,undefined);assert.equal(r.resumePlayer(a,null),false);
});

test('시작 전 마지막 사용자 단절은 방을 즉시 정리',()=>{
 const manager=new RoomManager({startLoop:false}),r=manager.createRoom({},'a');r.addPlayer('a','A');
 r.disconnectPlayer('a',()=>manager.cleanupEmptyRooms());assert.equal(manager.getRoom(r.id),undefined);manager.close();
});

test('명시적 퇴장은 예약 없이 즉시 자격 제거, 새 게임에서는 접속한 관전자도 참가',t=>{
 const r=room(t);open(r);r.removePlayer('a');const p=r.addPlayer('new-a','재입장');assert.equal(p.eligible,false);
 r.resetToWaiting();assert.equal(p.eligible,true);r.startGame();clearTimeout(r.timerHandle);assert.equal(p.alive,true);
});

test('소수결은 유예 중 기존 참가자를 마지막 좌표로 집계하고 신규 관전자는 제외',t=>{
 const r=room(t,[{type:'MINORITY',question:'소수결',timeLimit:15}]);open(r);
 r.players.get('a').x=-2;r.players.get('b').x=2;r.addPlayer('watcher','관전').x=-3;r.disconnectPlayer('a');
 r.judgeQuestion();clearTimeout(r.timerHandle);assert.equal(r.minorityOutcome.leftCount,1);assert.equal(r.minorityOutcome.rightCount,1);assert.equal(r.minorityOutcome.tie,true);
});

test('공통 좌표 규칙: 반올림한 좌표와 원본 좌표의 OX·4구역·소수결 판정 일치',()=>{
 for(const type of ['OX','MULTIPLE','MINORITY'])for(const x of [-.015,-.005,-.001,0,.001,.005,.015])for(const z of [-.001,0,.001]){
  assert.equal(computeZone(type,x,z),rules.zone(type,rules.coordinate(x),rules.coordinate(z)));
 }
});

test('이동 방어: 정상 7m/s 이동 허용, 연속 이동 예산 초과·순간이동 거절',t=>{
 const r=room(t);open(r);const a=r.players.get('a');a.x=-2;a.z=0;a.moveCredit=1.5;a.lastMoveAt=1000;
 for(let i=1;i<=20;i++)assert.equal(r.movePlayer('a',-2+i*.35,0,{enforceSpeed:true,now:1000+i*50}),true);
 const last=a.x;assert.equal(r.movePlayer('a',-9,0,{enforceSpeed:true,now:2001}),false);assert.equal(a.x,last);
 assert.equal(r.movePlayer('a',NaN,0,{enforceSpeed:true}),undefined);
});

test('요청 제한: 연속 채팅 초과 거절, 시간 경과 시 회복하고 다른 버킷과 분리',()=>{
 const limits=new RequestLimits();for(let i=0;i<3;i++)assert.equal(limits.allow('chat',1,3,1000),true);
 assert.equal(limits.allow('chat',1,3,1000),false);assert.equal(limits.allow('move',30,10,1000),true);assert.equal(limits.allow('chat',1,3,2000),true);
});

test('관전자의 직접 이동·채팅 요청은 서버에서 차단하고 기존 유령의 이동·채팅은 허용',t=>{
 const r=room(t);open(r);const viewer=r.addPlayer('viewer','관전자'),ghost=r.players.get('b');ghost.alive=false;r.roundParticipants.delete('b');r.placePlayerInRoleZone(ghost);
 const before={x:viewer.x,z:viewer.z};r.movePlayer(viewer.id,3,9);assert.deepEqual({x:viewer.x,z:viewer.z},before);
 const messages=[];r.sendToAll=raw=>messages.push(JSON.parse(raw));assert.equal(r.chat(viewer.id,'정답은 O'),false);assert.equal(messages.length,0);
 r.movePlayer(ghost.id,3,9);assert.equal(ghost.x,3);assert.equal(r.chat(ghost.id,'유령 채팅'),true);assert.equal(messages[0].senderId,ghost.id);
 r.resetToWaiting();assert.equal(r.chat(viewer.id,'다음 게임 대기'),true);
});
