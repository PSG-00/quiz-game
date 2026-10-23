const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Room}=require('../server/RoomManager');
const {QuizLibrary}=require('../server/QuizLibrary');
const {parse}=require('../client/quizFiles');
function clock(action){
 const saved={set:global.setTimeout,clear:global.clearTimeout,now:Date.now};let now=100000;const pending=new Map();
 global.setTimeout=(fn,ms)=>{const timer={};pending.set(timer,{fn,at:now+ms});return timer;};global.clearTimeout=timer=>pending.delete(timer);Date.now=()=>now;
 function advance(ms){const end=now+ms;for(;;){const next=[...pending.entries()].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;pending.delete(next[0]);now=next[1].at;next[1].fn();}now=end;}
 try{action({advance,now:()=>now});}finally{global.setTimeout=saved.set;global.clearTimeout=saved.clear;Date.now=saved.now;}
}
function room(options={}){
 const r=new Room({targetWinners:1,questions:[{type:'OX',question:'첫 문제',answer:'O',timeLimit:5},{type:'SHORT',question:'다음 문제',answer:'서울',timeLimit:5}],...options},'p0');
 for(let i=0;i<3;i++){const p=r.addPlayer('p'+i,'참가'+i);p.x=-3;}
 r.currentQuestionIndex=0;r.state='QUESTION';r.stateEndTime=Date.now()+5000;r.roundParticipants=new Set(r.players.keys());return r;
}
test('기본 흐름은 정답 3초 → 휴식 5초 → 다음 문제, 추가 준비 시간 없음',()=>clock(({advance,now})=>{
 const r=room();r.judgeQuestion();assert.equal(r.state,'JUDGE');assert.equal(r.stateEndTime-now(),3000);advance(2999);assert.equal(r.state,'JUDGE');advance(1);assert.equal(r.state,'BREAK');assert.equal(r.stateEndTime-now(),5000);advance(4999);assert.equal(r.currentQuestionIndex,0);advance(1);assert.equal(r.state,'QUESTION');assert.equal(r.currentQuestionIndex,1);assert.equal(r.stateEndTime-now(),5000);
}));
test('설정한 휴식 시간을 적용하며 0초는 정답 공개 직후 다음 문제 시작',()=>clock(({advance,now})=>{
 for(const restSeconds of [0,1,7,60]){const r=room({restSeconds});r.judgeQuestion();advance(3000);if(restSeconds){assert.equal(r.state,'BREAK');assert.equal(r.stateEndTime-now(),restSeconds*1000);advance(restSeconds*1000);}assert.equal(r.state,'QUESTION');assert.equal(r.currentQuestionIndex,1);r.resetToWaiting();}
}));
test('목표 이하 당첨과 마지막 라운드는 휴식 없이 정답 3초 후 종료·추첨',()=>clock(({advance})=>{
 const early=room();early.players.get('p1').x=3;early.players.get('p2').x=3;early.judgeQuestion();advance(3000);assert.equal(early.state,'ENDED');
 const final=room({questions:[{type:'OX',question:'마지막',answer:'O',timeLimit:5}]});final.judgeQuestion();advance(3000);assert.equal(final.state,'LOTTERY');assert.equal(final.winners.length,1);
}));
test('휴식 중 답안 제출 거절, 이동 허용, 정답 비공개 및 초기화 후 타이머 취소',()=>clock(({advance})=>{
 const r=room();r.judgeQuestion();advance(3000);assert.equal(r.state,'BREAK');r.movePlayer('p0',4,2);assert.equal(r.players.get('p0').x,4);r.submitAnswer('p0','서울');assert.equal(r.players.get('p0').hasSubmitted,false);
 let message;r.sendToAll=text=>message=JSON.parse(text);r.broadcastRoomEvent();assert.equal(message.restSeconds,5);assert.equal(message.currentQuestion.answer,undefined);
 r.resetToWaiting();advance(20000);assert.equal(r.state,'WAITING');assert.equal(r.currentQuestionIndex,-1);
}));
test('부활전 결과도 동일한 휴식 흐름, 실패 재도전 때도 휴식 적용',()=>clock(({advance})=>{
 const r=room({questions:[{type:'SHORT',question:'부활',answer:'서울',isRevival:true,timeLimit:5},{type:'OX',question:'다음',answer:'O',timeLimit:5}]});
 for(const p of r.players.values())p.alive=false;r.submitAnswer('p0','서울');r.submitAnswer('p1','서울');r.judgeQuestion();advance(3000);assert.equal(r.state,'BREAK');advance(5000);assert.equal(r.state,'QUESTION');assert.equal(r.currentQuestionIndex,1);r.resetToWaiting();
 const retry=room({questions:[{type:'SHORT',question:'부활',answer:'서울',isRevival:true,timeLimit:5}]});for(const p of retry.players.values())p.alive=false;retry.judgeQuestion();advance(3000);assert.equal(retry.state,'BREAK');advance(5000);assert.equal(retry.currentQuestionIndex,0);assert.equal(retry.state,'QUESTION');
}));
test('휴식 이후 유령 없는 부활전은 바로 건너뛰고 다음 실문제 시작',()=>clock(({advance})=>{
 const r=room({questions:[{type:'OX',question:'첫',answer:'O',timeLimit:5},{type:'OX',question:'부활',answer:'O',isRevival:true,timeLimit:5},{type:'SHORT',question:'다음',answer:'서울',timeLimit:5}]});r.judgeQuestion();advance(8000);assert.equal(r.currentQuestionIndex,2);assert.equal(r.state,'QUESTION');
}));
test('뒤에 참가자 없는 부활전만 남았다면 휴식 없이 종료',()=>clock(({advance})=>{
 const r=room({questions:[{type:'OX',question:'첫',answer:'O',timeLimit:5},{type:'OX',question:'부활',answer:'O',isRevival:true,timeLimit:5}]});r.judgeQuestion();advance(3000);assert.equal(r.state,'LOTTERY');
}));
test('휴식 설정은 0~60초 정수, 예전 저장본은 읽을 때 기본 5초',()=>{
 for(const restSeconds of [0,10,60])assert.equal(parse(JSON.stringify({version:1,restSeconds,questions:[{type:'OX',question:'Q',answer:'O'}]})).restSeconds,restSeconds);
 for(const restSeconds of [-1,61,1.5,'10',null])assert.throws(()=>parse(JSON.stringify({version:1,restSeconds,questions:[{type:'OX',question:'Q',answer:'O'}]})),/0~60/);
 const lib=new QuizLibrary();lib.quizzes.set('old',{id:'old',ownerHash:'a',title:'예전',targetWinners:2,questions:[{type:'OX',question:'Q',answer:'O'}],updatedAt:'2026'});assert.equal(lib.get('a','old').restSeconds,5);assert.equal(lib.quizzes.get('old').restSeconds,undefined);
});
test('휴식 설정 저장·재시작·코드 불러오기 및 기본값 저장 시 불필요한 덮어쓰기 없음',t=>{
 const file=path.resolve('artifacts','break-store-'+crypto.randomUUID()+'.json');t.after(()=>{for(const suffix of ['','.bak','.lock'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);});
 const lib=new QuizLibrary({file}),draft={title:'쉬는 시간',restSeconds:7,questions:[{type:'OX',question:'Q',answer:'O'}]},q=lib.save('a',draft);
 assert.equal(new QuizLibrary({file}).getByCode(q.code,'b').restSeconds,7);assert.equal(lib.saveByTitle('a',draft).unchanged,true);
 const changed=lib.saveByTitle('a',{...draft,restSeconds:0});assert.equal(changed.confirmation,true);assert.equal(lib.get('a',q.id).restSeconds,7);
 assert.equal(lib.saveByTitle('a',{...draft,restSeconds:0,confirmOverwrite:true,expectedVersion:changed.version}).quiz.restSeconds,0);
});
