const {test}=require('node:test'),assert=require('node:assert/strict');
const {Room}=require('../server/RoomManager'),Rules=require('../client/raceRules'),Files=require('../client/quizFiles');
const questions=[{question:'리센느는 5인조다.',answer:'O'},{question:'1 더하기 1은 3이다.',answer:'X'}];
function setup(n=4,items=questions,revival=false){const room=new Room({targetWinners:1,questions:[{type:'RACE',question:'OX 레이스',answer:'',raceQuestions:items,timeLimit:120,isRevival:revival}]},'p0');for(let i=0;i<n;i++)room.addPlayer('p'+i,'참가자'+i);return room;}
function begin(room){room.gameId='race-test';room.nextQuestion({skipPreparation:true});clearTimeout(room.timerHandle);}
function gate(room,id,answer,now=Date.now()+1000){room.movePlayer(id,0,Rules.JUNCTION_Z,{now:now-2});room.movePlayer(id,answer==='O'?-8.5:8.5,Rules.JUNCTION_Z,{now:now-1});room.movePlayer(id,answer==='O'?-8.5:8.5,Rules.PORTAL_Z,{now});}
function solve(room,id,now=Date.now()+1000){const r=room.race.runners.get(id),item=room.race.items[r.order[r.progress]];gate(room,id,item.answer,now);}
test('레이스 정원은 시작 인원의 절반 내림이며 25→12, 50→25, 1→1',()=>{assert.equal(Rules.quota(25),12);assert.equal(Rules.quota(50),25);assert.equal(Rules.quota(1),1);assert.equal(Rules.quota(0),0);});
test('벽을 가로질러 선택 문으로 건너뛸 수 없고 T자 경로만 이동',()=>{const blocked=Rules.move(Rules.START,{x:8,z:5.5});assert.ok(blocked.x<=1.65);assert.equal(blocked.z,5.5);const corner=Rules.move({x:0,z:Rules.JUNCTION_Z},{x:-8.5,z:Rules.JUNCTION_Z});assert.equal(Rules.gate(corner.x,corner.z),'');const portal=Rules.move(corner,{x:-8.5,z:Rules.PORTAL_Z});assert.equal(Rules.gate(portal.x,portal.z),'O');assert.equal(Rules.inside(5,4),false);});
test('25명 중 12명만 서버 도착 순서대로 통과하고 그 즉시 나머지 입력 잠금',()=>{
 const room=setup(25,[questions[0]]);begin(room);for(let i=0;i<12;i++)solve(room,'p'+i,Date.now()+i*1000+1000);
 assert.equal(room.state,'JUDGE');assert.equal(room.race.quota,12);assert.equal(room.getAlivePlayers().length,12);assert.deepEqual(room.race.finished,Array.from({length:12},(_,i)=>'p'+i));
 solve(room,'p12');assert.equal(room.race.finished.length,12);assert.equal(room.players.get('p12').alive,false);clearTimeout(room.timerHandle);
});
test('오답은 같은 문제로 리셋하고 정답은 개인 문제 진행도만 증가',()=>{
 const room=setup();begin(room);const r=room.race.runners.get('p0'),answer=room.race.items[r.order[0]].answer;
 gate(room,'p0',answer==='O'?'X':'O');assert.equal(r.progress,0);assert.deepEqual({x:room.players.get('p0').x,z:room.players.get('p0').z},Rules.START);
 solve(room,'p0',Date.now()+3000);assert.equal(r.progress,1);assert.equal(room.race.runners.get('p1').progress,0);assert.equal(room.state,'QUESTION');
});
test('정답과 전체 문제 순서는 공개 상태와 개인 메시지에 노출하지 않음',()=>{
 const room=setup();const messages=[];room.players.get('p0').ws={readyState:1,send:s=>messages.push(JSON.parse(s))};begin(room);
 const state=messages.find(m=>m.type==='ROOM_STATE'),own=messages.find(m=>m.type==='RACE_STATE');assert.equal(state.currentQuestion.raceQuestions,undefined);assert.equal(state.currentQuestion.answer,undefined);assert.equal(own.answer,undefined);assert.equal(own.order,undefined);assert.ok(questions.some(q=>q.question===own.question));
});
test('중도 입장자는 관전만 하고 참가 정원과 부활 자격을 얻지 못함',()=>{
 const room=setup(5);begin(room);const p=room.addPlayer('late','늦은 입장');assert.equal(p.eligible,false);assert.equal(room.race.quota,2);assert.equal(room.race.runners.has(p.id),false);gate(room,p.id,'O');assert.equal(room.race.finished.length,0);
});
test('패자부활전은 시작 시 유령 참가자만 절반 선착순 부활',()=>{
 const room=setup(5,[questions[0]],true);room.players.get('p0').alive=false;room.players.get('p1').alive=false;begin(room);assert.equal(room.race.quota,1);assert.equal(room.race.runners.size,2);solve(room,'p0');assert.equal(room.players.get('p0').alive,true);assert.equal(room.players.get('p1').alive,false);assert.equal(room.getAlivePlayers().length,4);clearTimeout(room.timerHandle);
});
test('완주자 0명이어도 푼 개수가 같으면 먼저 정답에 도달한 순서로 절반 통과',()=>{const room=setup();begin(room);solve(room,'p2',Date.now()+1000);solve(room,'p1',Date.now()+2000);room.judgeQuestion();assert.equal(room.state,'JUDGE');assert.deepEqual(room.race.qualified,['p2','p1']);assert.equal(room.getAlivePlayers().length,2);clearTimeout(room.timerHandle);});

test('완주자 자리를 확보한 뒤 문제 수 내림차순과 마지막 정답 시각 오름차순으로 보충',()=>{
 const room=setup(6,Array(4).fill(questions[0]));begin(room);let now=Date.now()+1000;
 for(let i=0;i<4;i++)solve(room,'p0',now+=1000);
 solve(room,'p1',now+=1000);solve(room,'p2',now+=1000);
 solve(room,'p3',now+=1000);solve(room,'p3',now+=1000);
 assert.equal(room.state,'QUESTION');room.judgeQuestion();assert.deepEqual(room.race.qualified,['p0','p3','p1']);assert.equal(room.getAlivePlayers().length,3);clearTimeout(room.timerHandle);
});

test('오답과 재접속은 마지막 정답 시각을 갱신하지 않음',()=>{
 const room=setup();begin(room);const time=Date.now()+1000;solve(room,'p0',time);const r=room.race.runners.get('p0'),updated=r.progressUpdatedAt,answer=room.race.items[r.order[r.progress]].answer;
 gate(room,'p0',answer==='O'?'X':'O',time+1000);room.disconnectPlayer('p0');room.resumePlayer(room.players.get('p0'),null);assert.equal(r.progressUpdatedAt,updated);assert.equal(r.progress,1);
});

test('모두 0문제여도 정원만 한 번 추첨하고 자격 상실자와 중도 입장은 제외',()=>{
 const room=setup(6);begin(room);room.players.get('p0').eligible=false;room.addPlayer('late','관전');room.judgeQuestion();const selected=room.race.qualified.slice();assert.equal(selected.length,3);assert.ok(!selected.includes('p0')&&!selected.includes('late'));assert.deepEqual(room.race.finalize(),selected);assert.equal(room.getAlivePlayers().length,3);clearTimeout(room.timerHandle);
});

test('진행도로 선정한 유령도 패자부활전에서 부활',()=>{
 const room=setup(4,questions,true);room.players.get('p0').alive=false;room.players.get('p1').alive=false;begin(room);solve(room,'p1');room.judgeQuestion();assert.equal(room.players.get('p1').lastResult,'REVIVED');assert.equal(room.players.get('p0').alive,false);clearTimeout(room.timerHandle);
});

test('제한시간을 생략하면 문제 수 × 15초로 계산하고 명시적 설정은 유지',()=>{
 const q={type:'RACE',question:'레이스',raceQuestions:Array(5).fill(questions[0])};const room=new Room({questions:[q]},'p0');assert.equal(room.questions[0].timeLimit,75);assert.equal(Files.parse(JSON.stringify({version:1,questions:[q]})).questions[0].timeLimit,75);assert.equal(setup().questions[0].timeLimit,120);
});
test('짧은 연결 끊김과 복귀에도 개인 진행도와 순서를 유지',()=>{
 const room=setup();begin(room);solve(room,'p0');const r=room.race.runners.get('p0'),order=r.order.slice();room.disconnectPlayer('p0');assert.equal(room.players.get('p0').alive,true);room.resumePlayer(room.players.get('p0'),null);assert.equal(r.progress,1);assert.deepEqual(r.order,order);
});
test('레이스 이동도 속도 예산을 넘는 순간이동을 거부',()=>{const room=setup();begin(room);const p=room.players.get('p0');assert.equal(room.movePlayer('p0',8.5,-3,{enforceSpeed:true,now:p.lastMoveAt+1}),false);assert.equal(room.race.runners.get('p0').progress,0);});
test('레이스 파일은 문제 목록과 OX 정답을 저장하며 잘못된 개수·정답을 거절',()=>{
 const q={type:'RACE',question:'레이스',raceQuestions:questions,timeLimit:120},parsed=Files.parse(JSON.stringify({version:1,questions:[q]}));assert.deepEqual(parsed.questions[0].raceQuestions,questions);assert.equal(parsed.questions[0].answer,'');
 for(const items of [[],Array(11).fill(questions[0]),[{question:'오류',answer:'A'}]])assert.throws(()=>Files.parse(JSON.stringify({version:1,questions:[{...q,raceQuestions:items}]})),/OX|레이스/);
});
