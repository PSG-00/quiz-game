const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Room,RoomManager,RECONNECT_GRACE_MS,RESTORE_EXTENSION_MS}=require('../server/RoomManager');
const {LiveRoomStore}=require('../server/LiveRoomStore');
const questions=[{type:'SHORT',question:'수도는?',answer:'서울',timeLimit:20},{type:'OX',question:'다음',answer:'O',timeLimit:15}];
function cleanup(t,...rooms){t.after(()=>{for(const r of rooms){clearTimeout(r.timerHandle);for(const p of r.players.values())clearTimeout(p.disconnectTimer);}});}
function playing(t){
 const r=new Room({title:'복원',targetWinners:1,restSeconds:10,questions},'a');cleanup(t,r);
 for(const id of ['a','b','c']){const p=r.addPlayer(id,id.toUpperCase());p.ownerHash='owner-'+id;p.resumeTokenHash='token-'+id;}
 r.startGame();r.nextQuestion({skipPreparation:true});return r;
}

test('재시작 복원: 문제·제출 답안·역할·복귀 토큰을 유지하고 남은 시간에 유예를 더해 판정',t=>{
 const r=playing(t);r.submitAnswer('b','서울');r.players.get('c').x=4;
 const now=Date.now(),saved=JSON.parse(JSON.stringify(r.snapshot(now)));
 const back=Room.restore(saved,{now});cleanup(t,back);
 assert.equal(back.id,r.id);assert.equal(back.state,'QUESTION');assert.equal(back.roundId,r.roundId);assert.equal(back.gameId,r.gameId);
 assert.equal(back.players.get('b').submittedText,'서울');assert.equal(back.players.get('c').x,4);assert.equal(back.players.get('a').resumeTokenHash,'token-a');
 assert.deepEqual([...back.roundParticipants].sort(),['a','b','c']);
 for(const p of back.players.values()){assert.equal(p.connected,false);assert.equal(p.ws,null);assert.equal(p.disconnectedUntil,now+RECONNECT_GRACE_MS);}
 assert.equal(back.pending.action,'judge');assert.ok(back.stateEndTime>=now+20000+RESTORE_EXTENSION_MS-50);
 assert.equal(back.resumePlayer(back.players.get('b'),{readyState:1,send(){}}),true);
 clearTimeout(back.timerHandle);back.runPending();
 assert.equal(back.state,'JUDGE');assert.equal(back.players.get('b').alive,true);assert.equal(back.players.get('a').alive,false);
});

test('재시작 복원: 쉬는 시간과 판정 후 예약 동작을 그대로 이어서 실행',t=>{
 const r=playing(t);r.submitAnswer('a','서울');r.submitAnswer('b','서울');r.judgeQuestion();
 assert.equal(r.pending.action,'break');
 const judged=Room.restore(JSON.parse(JSON.stringify(r.snapshot())));cleanup(t,judged);
 assert.equal(judged.pending.action,'break');clearTimeout(judged.timerHandle);judged.runPending();
 assert.equal(judged.state,'BREAK');assert.equal(judged.pending.action,'next');
 const resting=Room.restore(JSON.parse(JSON.stringify(judged.snapshot())));cleanup(t,resting);
 clearTimeout(resting.timerHandle);resting.runPending();
 assert.equal(resting.state,'QUESTION');assert.equal(resting.currentQuestionIndex,1);assert.equal(resting.players.get('c').alive,false);
});

test('실행 중 방 저장소: 원자적으로 저장하고 오래된 저장본·봇 방은 복원하지 않음',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-live-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new LiveRoomStore(path.join(dir,'live-rooms.json')),manager=new RoomManager({startLoop:false});
 const room=manager.createRoom({title:'저장',questions},'a');room.addPlayer('a','A');
 const bots=manager.createRoom({title:'봇',questions},null);bots.testBotIds=new Set(['bot']);bots.addPlayer('bot','봇');
 assert.equal(store.save(manager.snapshot()),true);assert.equal(fs.existsSync(path.join(dir,'live-rooms.json.tmp')),false);
 const saved=store.load();assert.deepEqual(saved.rooms.map(r=>r.id),[room.id]);
 const fresh=new RoomManager({startLoop:false});t.after(()=>{fresh.close();manager.close();for(const r of fresh.rooms.values())for(const p of r.players.values())clearTimeout(p.disconnectTimer);});
 assert.equal(fresh.restore(saved,{now:saved.savedAt+11*60*1000}),0);
 assert.equal(fresh.restore(saved,{now:saved.savedAt+1000}),1);assert.equal(fresh.getRoom(room.id).players.get('a').connected,false);
 assert.equal(store.save({rooms:[]}),true);assert.equal(store.save({rooms:[]}),false);
});

test('단계 감시: 타이머가 사라지거나 판정 밖에서 판정이 호출돼도 다음 단계로 진행',t=>{
 t.mock.method(console,'warn',()=>{});
 const r=playing(t);r.submitAnswer('a','서울');r.submitAnswer('b','서울');r.judgeQuestion();clearTimeout(r.timerHandle);
 const pending=r.pending;r.judgeQuestion();assert.equal(r.pending,pending);
 assert.equal(r.recoverOverduePhase(r.stateEndTime+1999),false);
 assert.equal(r.recoverOverduePhase(r.stateEndTime+2000),true);assert.equal(r.state,'BREAK');
 clearTimeout(r.timerHandle);r.pending=null;
 assert.equal(r.recoverOverduePhase(r.stateEndTime+2000),true);assert.equal(r.state,'QUESTION');assert.equal(r.currentQuestionIndex,1);
});

test('단계 실패: 상품이 걸린 게임은 자동 종료하지 않고 상태를 유지한 채 계속 재시도',t=>{
 const r=playing(t),messages=[];r.sendToAll=raw=>messages.push(JSON.parse(raw));
 const errors=t.mock.method(console,'error',()=>{}),judge=r.judgeQuestion;let broken=true;
 r.judgeQuestion=function(){if(broken)throw new Error('broken judge');return judge.call(this);};
 for(let i=0;i<3;i++){r.runPending();assert.equal(r.pending.action,'judge');assert.equal(r.state,'QUESTION');clearTimeout(r.timerHandle);}
 assert.equal(errors.mock.callCount(),3);assert.equal(messages.some(m=>m.state==='ENDED'),false);
 broken=false;r.runPending();assert.equal(r.state,'JUDGE');assert.equal(messages.at(-1).state,'JUDGE');
});

test('늦게 몰린 이동은 예산만큼 반영하고(되돌림 없음) 순간이동만 거절',t=>{
 const r=playing(t);r.currentQuestionIndex=1;r.questions[1].type='OX';r.state='QUESTION';r.stateEndTime=Date.now()+10000;
 const a=r.players.get('a');a.x=0;a.z=0;a.moveCredit=0;a.lastMoveAt=1000;
 // Accepted without a correction: the client keeps resending its spot and the server catches up.
 assert.equal(r.movePlayer('a',2,0,{enforceSpeed:true,now:1100}),true);assert.ok(a.x>0&&a.x<1.2);
 assert.equal(r.movePlayer('a',2,0,{enforceSpeed:true,now:1400}),true);assert.equal(a.x,2);
 a.lastMoveAt=1000;a.moveCredit=3;assert.equal(r.movePlayer('a',a.x+.8,0,{enforceSpeed:true,now:1000}),true);
 const before=a.x;assert.equal(r.movePlayer('a',before-7,0,{enforceSpeed:true,now:5000}),false);assert.equal(a.x,before);
});

test('배포 대기용 방 목록: 봇 테스트 방은 test로 표시해 실제 게임만 기다림',()=>{
 const manager=new RoomManager({startLoop:false}),real=manager.createRoom({title:'실제',questions},'a'),bots=manager.createRoom({title:'봇',questions},null);bots.testBotIds=new Set();
 const list=manager.getRoomListSummary();assert.equal(list.find(r=>r.id===real.id).test,false);assert.equal(list.find(r=>r.id===bots.id).test,true);manager.close();
});
