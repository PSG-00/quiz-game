const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room,computeZone}=require('../server/RoomManager');
function setup(q={},target=2,count=3){
 const r=new Room({targetWinners:target,questions:[{type:'OX',question:'테스트',answer:'O',timeLimit:5,...q},{type:'OX',question:'다음',answer:'O',timeLimit:5}]},'p0');
 for(let i=0;i<count;i++)r.addPlayer('p'+i,'참가'+i);
 r.currentQuestionIndex=0;r.state='QUESTION';r.stateEndTime=Date.now()+5000;r.roundParticipants=new Set(r.players.keys());
 return r;
}
function judge(r){r.judgeQuestion();clearTimeout(r.timerHandle);}
test('발 중심 경계: x=0은 X, 2×2 네 구역 ID 일치',()=>{
 assert.equal(computeZone('OX',-.001),'O');assert.equal(computeZone('OX',0),'X');
 assert.deepEqual([[-1,-1],[0,-1],[-1,0],[0,0]].map(([x,z])=>computeZone('MULTIPLE',x,z)),['1','2','3','4']);
});
test('일반 유령은 관전 구역에만 머무르고 제출할 수 없음',()=>{
 const r=setup({type:'SHORT',answer:'서울'}),p=r.players.get('p1');p.alive=false;r.roundParticipants.delete(p.id);r.placePlayerInRoleZone(p);
 assert.ok(p.z>=8.5);r.movePlayer(p.id,0,-5);assert.equal(p.z,8.6);r.submitAnswer(p.id,'서울');assert.equal(p.hasSubmitted,false);
});
test('버튼형 선택은 위치와 독립적이며 마지막 제출만 판정',()=>{
 const r=setup({type:'MULTIPLE',inputMode:'BUTTON',answer:'2'});r.submitAnswer('p0','1');r.submitAnswer('p0','2');
 r.players.get('p0').x=-5;r.submitAnswer('p1','2');r.submitAnswer('p2','4');judge(r);
 assert.equal(r.players.get('p0').alive,true);assert.equal(r.players.get('p2').alive,false);assert.ok(r.players.get('p2').z>=8.5);
});
test('주관식 수정 중에도 마지막 제출값 유지, 별칭·공백·대소문자 정규화',()=>{
 const r=setup({type:'SHORT',answer:'Seoul,서울특별시'});r.submitAnswer('p0',' S E O U L ');r.submitAnswer('p0','',true);r.submitAnswer('p1','서울 특별시');judge(r);
 assert.equal(r.players.get('p0').alive,true);assert.equal(r.players.get('p1').alive,true);assert.equal(r.players.get('p2').alive,false);
});
test('시간이 지난 제출과 이동은 서버에서 거절',()=>{
 const r=setup({type:'SHORT',answer:'서울'}),p=r.players.get('p0');r.stateEndTime=Date.now()-1;
 const previous=p.x;r.submitAnswer('p0','서울');r.movePlayer('p0',9,0);assert.equal(p.hasSubmitted,false);assert.equal(p.x,previous);
});
test('부활전 유령만 제출, 기존 생존자 상태 보존, 성공자는 원래 층 복귀',()=>{
 const r=setup({type:'SHORT',isRevival:true,answer:'서울'},1),ghost=r.players.get('p1'),failed=r.players.get('p2');ghost.alive=false;failed.alive=false;
 r.roundParticipants=new Set(['p1','p2']);r.placePlayerInRoleZone(ghost);r.placePlayerInRoleZone(r.players.get('p0'));
 assert.ok(ghost.z<8);assert.ok(r.players.get('p0').z>=8.5);r.submitAnswer('p0','서울');assert.equal(r.players.get('p0').hasSubmitted,false);
 r.submitAnswer('p1','서울');judge(r);assert.equal(ghost.alive,true);assert.equal(ghost.lastResult,'REVIVED');assert.equal(r.players.get('p0').alive,true);assert.equal(failed.alive,false);
 assert.ok(ghost.z<8);assert.ok(failed.z>=8.5);
});
test('생존자가 목표와 같거나 적으면 다음 문제 없이 생존자 전원 당첨',()=>{
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{
  for(const survivors of [1,2]){
   const r=setup({},2);for(const [i,p] of [...r.players.values()].entries())p.x=i<survivors?-2:2;
   r.nextQuestion=()=>{throw Error('목표 이하에서 다음 문제를 진행하면 안 됨');};r.judgeQuestion();scheduled();assert.equal(r.state,'ENDED');assert.equal(r.winners.length,survivors);
  }
 }finally{global.setTimeout=original;}
});
test('2명 중 생존 1·유령 1, 목표 1이면 OX·주관식·객관식 모두 1명 당첨 후 종료',()=>{
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{
  for(const q of [{type:'OX',answer:'O'},{type:'SHORT',answer:'서울'},{type:'MULTIPLE',inputMode:'BUTTON',answer:'2'}]){
   const r=setup(q,1,2);r.questions[1].isRevival=true;r.players.get('p0').x=-2;r.players.get('p1').x=2;if(q.type!=='OX')r.submitAnswer('p0',q.answer);
   r.nextQuestion=()=>{throw Error('예약 부활전으로 진행하면 안 됨');};r.judgeQuestion();assert.equal(r.getAlivePlayers().length,1);assert.equal(r.getGhostPlayers().length,1);scheduled();assert.equal(r.state,'ENDED');assert.deepEqual(r.winners.map(p=>p.id),['p0']);
  }
 }finally{global.setTimeout=original;}
});
test('목표보다 많이 살아남으면 다음 문제 진행',()=>{
 const r=setup({},1,3);r.players.get('p0').x=-2;r.players.get('p1').x=-2;r.players.get('p2').x=2;
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{let next=false;r.nextQuestion=()=>{next=true;};r.judgeQuestion();scheduled();assert.equal(r.state,'BREAK');assert.equal(next,false);scheduled();assert.equal(next,true);assert.equal(r.winners.length,0);}finally{global.setTimeout=original;}
});

test('최종 목표 초과 시 생존자만 추첨, 중복 당첨 없음',()=>{
 const r=setup({},2,6);r.players.get('p5').alive=false;r.finishOrLottery('최종');clearTimeout(r.timerHandle);
 assert.equal(r.state,'LOTTERY');assert.equal(r.winners.length,2);assert.equal(new Set(r.winners.map(p=>p.id)).size,2);assert.ok(!r.winners.some(p=>p.id==='p5'));
});
test('다른 사용자에게 주관식 답안이나 버튼 선택값을 전송하지 않음',()=>{
 const r=setup({type:'SHORT',answer:'서울'});r.submitAnswer('p0','서울');r.state='JUDGE';
 let result;r.players.get('p1').ws={readyState:1,send:payload=>result=JSON.parse(payload)};r.broadcastWorldTick();assert.equal(result.p[0].t,undefined);assert.equal(result.p[0].submittedText,undefined);assert.equal(result.p[0].h,1);
});
test('전원 오답: 마지막 문제·예약 부활전 여부와 무관하게 직전 생존 4명 중 목표 2명 추첨',()=>{
 const original=global.setTimeout;
 try{
  for(const finalRound of [false,true])for(const revival of [false,true]){
   const r=setup({},2,6);if(finalRound)r.currentQuestionIndex=1;else r.questions[1].isRevival=revival;
   for(const p of r.players.values()){p.x=2;if(['p4','p5'].includes(p.id)){p.alive=false;r.roundParticipants.delete(p.id);}}
   const scheduled=[];global.setTimeout=fn=>{scheduled.push(fn);};r.nextQuestion=()=>{throw Error('전원 오답 뒤 다음 문제를 진행하면 안 됨');};
   r.judgeQuestion();assert.equal(r.getAlivePlayers().length,4);assert.match(r.lastNotice,/직전 생존자 4명/);scheduled.shift()();
   assert.equal(r.state,'LOTTERY');assert.equal(r.winners.length,2);assert.equal(new Set(r.winners.map(p=>p.id)).size,2);assert.deepEqual(r.allFinalSurvivors.map(p=>p.id),['p0','p1','p2','p3']);
   assert.ok(r.winners.every(p=>['p0','p1','p2','p3'].includes(p.id)));scheduled.shift()();assert.equal(r.state,'ENDED');assert.equal(scheduled.length,0);
  }
 }finally{global.setTimeout=original;}
});

test('전원 오답: OX·객관식·주관식에 동일 적용, 직전 인원이 목표 이하면 전원 당첨',()=>{
 const original=global.setTimeout;
 try{
  for(const question of [{type:'OX',answer:'O'},{type:'SHORT',answer:'서울'},{type:'MULTIPLE',inputMode:'BUTTON',answer:'2'}])for(const target of [2,3]){
   const r=setup(question,target,2);for(const p of r.players.values())p.x=2;let scheduled;global.setTimeout=fn=>{scheduled=fn;};r.judgeQuestion();scheduled();assert.equal(r.state,'ENDED');assert.deepEqual(r.winners.map(p=>p.id),['p0','p1']);
  }
 }finally{global.setTimeout=original;}
});

test('전원 오답 후 판정 대기 중 퇴장자는 추첨 대상에서 제외하고 늦게 들어온 유령도 제외',()=>{
 const r=setup({},2,4);for(const p of r.players.values())p.x=2;
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{r.judgeQuestion();r.removePlayer('p0');r.addPlayer('late','늦게 입장');scheduled();assert.equal(r.state,'LOTTERY');assert.deepEqual(r.allFinalSurvivors.map(p=>p.id),['p1','p2','p3']);assert.ok(r.winners.every(p=>!['p0','late'].includes(p.id)));}finally{global.setTimeout=original;}
});

test('부활전 유령이 모두 오답이고 기존 생존자가 목표와 같으면 기존 생존자 당첨',()=>{
 const r=setup({type:'SHORT',isRevival:true,answer:'서울'},1);r.players.get('p1').alive=false;r.players.get('p2').alive=false;r.roundParticipants=new Set(['p1','p2']);
 const original=global.setTimeout;let scheduled;global.setTimeout=fn=>{scheduled=fn;};
 try{r.judgeQuestion();scheduled();assert.equal(r.state,'ENDED');assert.deepEqual(r.getAlivePlayers().map(p=>p.id),['p0']);assert.deepEqual(r.winners.map(p=>p.id),['p0']);}finally{global.setTimeout=original;}
});

test('무대 준비가 끝나기 전에는 답안 제출이 불가능',()=>{
 const r=setup({type:'SHORT',answer:'서울'});r.currentQuestionIndex=-1;r.nextQuestion();assert.equal(r.state,'PREPARING');r.submitAnswer('p0','서울');assert.equal(r.players.get('p0').hasSubmitted,false);clearTimeout(r.timerHandle);
});
test('유령은 좁은 하단 구역의 좌우·앞뒤 경계를 넘을 수 없음',()=>{
 const r=setup(),p=r.players.get('p1');p.alive=false;r.roundParticipants.delete(p.id);r.placePlayerInRoleZone(p);
 r.movePlayer(p.id,-100,-100);assert.equal(p.x,-7.5);assert.equal(p.z,8.6);
 r.movePlayer(p.id,100,100);assert.equal(p.x,7.5);assert.equal(p.z,9.8);
 assert.ok(p.x>=-7.5 && p.x<=7.5);assert.ok(p.z>=8.6 && p.z<=9.8);assert.equal(r.isPlayerOnStage(p),false);
});
test('50명의 시작·일반 라운드 전환에서 현재 좌표를 유지',()=>{
 const r=setup({},1,50);
 assert.equal(new Set([...r.players.values()].map(p=>`${p.x},${p.z}`)).size,50);
 r.state='WAITING';r.currentQuestionIndex=-1;r.roundParticipants.clear();
 const before=[...r.players.values()].map((p,i)=>{p.x=-8+(i%10)*1.6;p.z=-5+Math.floor(i/10);return{id:p.id,x:p.x,z:p.z};});
 r.startGame();clearTimeout(r.timerHandle);
 for(const old of before){const p=r.players.get(old.id);assert.deepEqual({x:p.x,z:p.z},{x:old.x,z:old.z});}
 r.nextQuestion();clearTimeout(r.timerHandle);
 for(const old of before){const p=r.players.get(old.id);assert.deepEqual({x:p.x,z:p.z},{x:old.x,z:old.z});}
 r.nextQuestion();clearTimeout(r.timerHandle);
 for(const old of before){const p=r.players.get(old.id);assert.deepEqual({x:p.x,z:p.z},{x:old.x,z:old.z});}
});
test('부활전 역할 교대 후 기존 생존자는 자신의 원래 무대 위치로 돌아옴',()=>{
 const r=setup({type:'SHORT',isRevival:true,answer:'서울'},1,2),alive=r.players.get('p0'),ghost=r.players.get('p1');
 r.state='WAITING';alive.x=3.25;alive.z=-1.5;ghost.alive=false;r.placePlayerInRoleZone(ghost);
 r.currentQuestionIndex=-1;r.nextQuestion();clearTimeout(r.timerHandle);
 assert.ok(alive.z>=8.6);r.state='QUESTION';r.submitAnswer('p1','서울');judge(r);
 assert.equal(alive.x,3.25);assert.equal(alive.z,-1.5);assert.equal(ghost.alive,true);
});
test('최대 100자 문제와 줄바꿈을 그대로 보존',()=>{
 const question='가'.repeat(94)+'\n마지막문장';
 const r=setup({question});assert.equal(question.length,100);assert.equal(r.getCurrentQuestion().question,question);
});

test('방장이 오답이면 일반 참가자가 단독 당첨되고 방장은 제외',()=>{
 const r=setup({type:'SHORT',answer:'서울'},2);r.submitAnswer('p0','부산');r.submitAnswer('p1','서울');r.submitAnswer('p2','인천');judge(r);r.finishOrLottery('확인');assert.deepEqual(r.winners.map(p=>p.id),['p1']);assert.equal(r.players.get(r.hostId).alive,false);
});
test('추첨은 방장 지정과 무관하고 세 참가자의 모든 순열에서 동일 기회',()=>{
 const original=Math.random;const counts={p0:0,p1:0,p2:0};
 try{for(let j=0;j<3;j++)for(let k=0;k<2;k++){
  const r=setup({},1,3);let call=0;Math.random=()=>call++===0?(j+.1)/3:(k+.1)/2;r.finishOrLottery('추첨');clearTimeout(r.timerHandle);counts[r.winners[0].id]++;
  const first=r.winners[0].id;r.hostId='p2';call=0;r.finishOrLottery('방장 변경');clearTimeout(r.timerHandle);assert.equal(r.winners[0].id,first);
 }}finally{Math.random=original;}
 assert.deepEqual(counts,{p0:2,p1:2,p2:2});
});
