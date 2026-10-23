const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Room,computeZone}=require('../server/RoomManager');
const {QuizLibrary}=require('../server/QuizLibrary');
const {parse}=require('../client/quizFiles');
function setup({count=5,isRevival=false,target=1}={}){
 const room=new Room({targetWinners:target,questions:[{type:'MINORITY',question:'적은 쪽이 승리합니다.',isRevival,timeLimit:5},{type:'OX',question:'다음 문제',answer:'O'}]},'p0');
 for(let i=0;i<count;i++)room.addPlayer('p'+i,'참가'+i);
 room.currentQuestionIndex=0;room.state='QUESTION';room.stateEndTime=Date.now()+5000;
 room.roundParticipants=new Set(room.players.keys());
 return room;
}
function judge(room){room.judgeQuestion();clearTimeout(room.timerHandle);}
test('소수결은 빈 정답으로 저장·불러오기·코드 복사되며 기존 유형 정답 검증은 유지',()=>{
 const questions=[{type:'MINORITY',question:'적은 쪽으로 이동하세요.',timeLimit:12,isRevival:true}];
 const draft=parse(JSON.stringify({version:1,questions}));assert.equal(draft.questions[0].type,'MINORITY');assert.equal(draft.questions[0].answer,'');
 const lib=new QuizLibrary(),saved=lib.save('owner',{title:'소수결',questions});
 assert.equal(lib.getByCode(saved.code,'other').questions[0].type,'MINORITY');assert.equal(lib.get('owner',saved.id).questions[0].isRevival,true);
 assert.throws(()=>parse(JSON.stringify({version:1,questions:[{type:'OX',question:'OX',answer:''}]})));
 assert.equal(computeZone('MINORITY',-.01),'LEFT');assert.equal(computeZone('MINORITY',0),'RIGHT');
});
test('양쪽 중 실제 인원이 적은 구역만 통과하며 작성된 정답은 변경하지 않음',()=>{
 for(const leftCount of [2,3]){
  const r=setup();for(const [i,p]of[...r.players.values()].entries())p.x=i<leftCount?-3:3;
  judge(r);assert.deepEqual(r.minorityOutcome,{leftCount,rightCount:5-leftCount,tie:false,winningZone:leftCount<3?'LEFT':'RIGHT'});
  assert.equal(r.getAlivePlayers().length,2);assert(r.getAlivePlayers().every(p=>computeZone('MINORITY',p.x)===r.minorityOutcome.winningZone));
  assert.equal(r.questions[0].answer,'');assert.equal(r.getGhostPlayers().length,3);
 }
});
test('동수는 서버 난수로 왼쪽 또는 오른쪽을 한 번만 결정',t=>{
 let draw=0,calls=0;t.mock.method(crypto,'randomInt',max=>{assert.equal(max,2);calls++;return draw;});
 for(draw=0;draw<2;draw++){
  const r=setup({count:4});for(const [i,p]of[...r.players.values()].entries())p.x=i<2?-3:3;
  judge(r);assert.equal(r.minorityOutcome.tie,true);assert.equal(r.minorityOutcome.winningZone,draw===0?'LEFT':'RIGHT');assert.equal(r.getAlivePlayers().length,2);
  const expected={...r.minorityOutcome};r.broadcastRoomEvent();r.broadcastRoomEvent();assert.deepEqual(r.minorityOutcome,expected);
 }
 assert.equal(calls,2);
});
test('기존 관전자·중도 입장자는 집계에서 제외하고 퇴장자는 현재 인원에서 제외',()=>{
 const r=setup({count:6});r.players.get('p5').alive=false;r.roundParticipants.delete('p5');r.players.get('p5').x=-3;
 for(const [i,p]of[...r.players.values()].entries())if(i<5)p.x=i<2?-3:3;
 const late=r.addPlayer('late','중도 관전자');late.x=-3;r.removePlayer('p0');judge(r);
 assert.deepEqual(r.minorityOutcome,{leftCount:1,rightCount:3,tie:false,winningZone:'LEFT'});assert.equal(r.getAlivePlayers().length,1);assert.equal(late.alive,false);
});
test('부활전은 유령 참가자끼리 집계하며 기존 생존자는 보호',()=>{
 const r=setup({count:5,isRevival:true});r.roundParticipants=new Set(['p2','p3','p4']);
 for(const [i,p]of[...r.players.values()].entries()){p.alive=i<2;r.placePlayerInRoleZone(p);p.x=i===2?-3:3;}
 judge(r);assert.deepEqual(r.minorityOutcome,{leftCount:1,rightCount:2,tie:false,winningZone:'LEFT'});
 assert.equal(r.players.get('p2').lastResult,'REVIVED');assert.equal(r.players.get('p2').alive,true);assert.equal(r.getAlivePlayers().length,3);
 for(const id of ['p0','p1']){assert.equal(r.players.get(id).alive,true);assert.equal(r.players.get(id).lastResult,'SAFE');}
 for(const id of ['p3','p4']){assert.equal(r.players.get(id).alive,false);assert.equal(r.players.get(id).lastResult,'FAIL');}
});
test('부활전 동수도 유령 집계만으로 무작위 구역을 선택',t=>{
 t.mock.method(crypto,'randomInt',()=>1);const r=setup({count:5,isRevival:true});r.roundParticipants=new Set(['p1','p2','p3','p4']);
 for(const [i,p]of[...r.players.values()].entries()){p.alive=i===0;r.placePlayerInRoleZone(p);p.x=i<3?-3:3;}
 judge(r);assert.deepEqual(r.minorityOutcome,{leftCount:2,rightCount:2,tie:true,winningZone:'RIGHT'});assert.equal(r.getAlivePlayers().length,3);
});
test('빈 구역은 0명으로 승리 판정, 일반 라운드 전원 탈락은 기존 직전 생존자 규칙 적용',()=>{
 const r=setup({count:4,target:2});for(const p of r.players.values())p.x=3;
 let payload;r.sendToAll=text=>payload=JSON.parse(text);judge(r);
 assert.deepEqual(r.minorityOutcome,{leftCount:0,rightCount:4,tie:false,winningZone:'LEFT'});assert.equal(payload.zeroWipeoutSaved,true);assert.equal(r.getAlivePlayers().length,4);
 r.finishOrLottery('전원 탈락');clearTimeout(r.timerHandle);assert.equal(r.state,'LOTTERY');assert.equal(r.winners.length,2);
});
test('판정 전에는 결과를 공개하지 않고, 판정 후 입퇴장·재방송에도 결과 유지',()=>{
 const r=setup();for(const [i,p]of[...r.players.values()].entries())p.x=i<2?-3:3;
 let payload;r.sendToAll=text=>payload=JSON.parse(text);r.broadcastRoomEvent();assert.equal(payload.minorityOutcome,undefined);assert.equal(payload.currentQuestion.answer,undefined);
 judge(r);const result={...payload.minorityOutcome};r.removePlayer('p4');r.addPlayer('late','늦은 관전자');r.broadcastRoomEvent();assert.deepEqual(payload.minorityOutcome,result);assert.equal(payload.currentQuestion.answer,'LEFT');
 r.nextQuestion();clearTimeout(r.timerHandle);assert.equal(r.minorityOutcome,null);r.resetToWaiting();assert.equal(r.minorityOutcome,null);
});
test('생존자가 목표 이하가 되면 소수결도 다음 라운드 없이 종료',()=>{
 const r=setup({count:3,target:1});r.players.get('p0').x=-3;r.players.get('p1').x=3;r.players.get('p2').x=3;
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{r.judgeQuestion();assert.equal(r.getAlivePlayers().length,1);scheduled();assert.equal(r.state,'ENDED');assert.deepEqual(r.winners.map(p=>p.id),['p0']);}finally{global.setTimeout=original;}
});
