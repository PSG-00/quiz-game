const {test}=require('node:test'),assert=require('node:assert/strict'),{Room}=require('../server/RoomManager');
function draw({target=2,count=5,correct=1,oldGhost=null,late=false,remove=[]}={}){
 const r=new Room({targetWinners:target,questions:[{type:'OX',question:'준우승 검증',answer:'O',timeLimit:15}]},'p0');for(let i=0;i<count;i++)r.addPlayer('p'+i,'참가'+i);r.gameId='draw-test';r.nextQuestion({skipPreparation:true});clearTimeout(r.timerHandle);
 for(let i=0;i<count;i++)r.players.get('p'+i).x=i<correct?-3:3;
 if(oldGhost){const p=r.players.get(oldGhost);p.alive=false;r.roundParticipants.delete(p.id);}
 if(late)r.addPlayer('late','관전자');r.judgeQuestion();clearTimeout(r.timerHandle);for(const id of remove)r.removePlayer(id);r.finishOrLottery('검증');clearTimeout(r.timerHandle);return r;
}
test('목표2·생존1은 우승 확정1명과 직전 생존자 중 준우승1명으로 채움',()=>{const r=draw();assert.equal(r.state,'LOTTERY');assert.equal(r.winners.length,2);assert.equal(r.winners[0].id,'p0');assert.equal(r.winners[0].placement,'WINNER');assert.equal(r.winners[1].placement,'RUNNER_UP');assert.notEqual(r.winners[0].id,r.winners[1].id);assert.equal(r.getAlivePlayers().length,1);});
test('이전 라운드 유령·관전자·퇴장자는 준우승 후보에 섞이지 않음',()=>{const r=draw({oldGhost:'p4',late:true,remove:['p3']});assert.deepEqual(r.runnerUpLottery.candidates.map(p=>p.id).sort(),['p1','p2']);assert.ok(['p1','p2'].includes(r.winners[1].id));});
test('부족한 여러 자리를 중복 없이 채우고 후보 부족 시 실제 인원만 선정',()=>{const r=draw({target:4,count:6,correct:2});assert.equal(r.winners.filter(p=>p.placement==='WINNER').length,2);assert.equal(r.winners.filter(p=>p.placement==='RUNNER_UP').length,2);assert.equal(new Set(r.winners.map(p=>p.id)).size,4);const small=draw({target:4,count:3});assert.equal(small.winners.length,3);assert.equal(small.runnerUpLottery.seats,2);});
test('목표와 같으면 준우승 추첨 없이 종료하고 재시작은 후보 기록 초기화',()=>{const r=draw({target:2,correct:2});assert.equal(r.state,'ENDED');assert.equal(r.runnerUpLottery,null);const withDraw=draw();withDraw.resetToWaiting();assert.equal(withDraw.runnerUpLottery,null);assert.deepEqual(withDraw.lastEliminatedForFinal,[]);});
