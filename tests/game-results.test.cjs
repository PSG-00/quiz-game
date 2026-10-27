const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RoomManager}=require('../server/RoomManager');
const {ResultLog}=require('../server/ResultLog');
const questions=[{type:'OX',question:'질문',answer:'O',timeLimit:15}];
const ids=['user_aaaaaa111111','user_bbbbbb222222','user_cccccc333333'];
function started(t,targetWinners,{bots=false}={}){
 const manager=new RoomManager({startLoop:false}),records=[];manager.onGameEnded=record=>records.push(record);
 const room=manager.createRoom({title:'상품 퀴즈',targetWinners,questions},ids[0]);if(bots)room.testBotIds=new Set();
 ids.forEach((id,i)=>room.addPlayer(id,'참가'+(i+1),null,['zena','liv','woni'][i]));
 t.after(()=>manager.close());room.startGame();clearTimeout(room.timerHandle);return {manager,room,records};
}

test('게임이 끝나면 우승자를 한 번만 기록하고, 다시 끝 상태를 알려도 중복 기록하지 않음',t=>{
 const {room,records}=started(t,5);
 room.finishOrLottery('최종 라운드 종료!');
 assert.equal(room.state,'ENDED');assert.equal(records.length,1);
 const [record]=records;assert.equal(record.title,'상품 퀴즈');assert.equal(record.gameId,room.gameId);assert.equal(record.participants,3);assert.equal(record.targetWinners,5);
 assert.deepEqual(record.winners.map(w=>[w.id,w.name,w.placement,w.avatarId]),[[ids[0],'참가1','WINNER','zena'],[ids[1],'참가2','WINNER','liv'],[ids[2],'참가3','WINNER','woni']]);
 room.announceEnded('다시 알림');assert.equal(records.length,1);
 room.resetToWaiting();room.startGame();clearTimeout(room.timerHandle);room.finishOrLottery('두 번째 게임');assert.equal(records.length,2);
});

test('목표 초과 추첨과 준우승 추첨은 발표 시점에 기록하고, 봇 테스트 방은 기록하지 않음',t=>{
 const lottery=started(t,1);lottery.room.finishOrLottery('최종');
 assert.equal(lottery.room.state,'LOTTERY');assert.equal(lottery.records.length,0);
 clearTimeout(lottery.room.timerHandle);lottery.room.runPending();
 assert.equal(lottery.room.state,'ENDED');assert.equal(lottery.records.length,1);assert.equal(lottery.records[0].winners.length,1);
 const runner=started(t,2);runner.room.players.get(ids[1]).alive=false;runner.room.players.get(ids[2]).alive=false;runner.room.lastEliminatedForFinal=[ids[1],ids[2]];
 runner.room.finishOrLottery('목표 미달');clearTimeout(runner.room.timerHandle);runner.room.runPending();
 assert.deepEqual(runner.records[0].winners.map(w=>w.placement),['WINNER','RUNNER_UP']);assert.equal(runner.records[0].winners[0].id,ids[0]);
 const bots=started(t,5,{bots:true});bots.room.finishOrLottery('봇 게임');assert.equal(bots.room.state,'ENDED');assert.equal(bots.records.length,0);
});

test('재시작 복원 뒤에도 같은 게임은 한 번만 기록',t=>{
 const {manager,room}=started(t,1);room.finishOrLottery('최종');
 const fresh=new RoomManager({startLoop:false}),again=[];fresh.onGameEnded=record=>again.push(record);t.after(()=>fresh.close());
 fresh.restore(JSON.parse(JSON.stringify(manager.snapshot())));const back=fresh.getRoom(room.id);
 clearTimeout(back.timerHandle);back.runPending();assert.equal(back.state,'ENDED');assert.equal(again.length,1);
 const later=new RoomManager({startLoop:false}),none=[];later.onGameEnded=record=>none.push(record);t.after(()=>later.close());
 later.restore(JSON.parse(JSON.stringify(fresh.snapshot())));assert.equal(later.getRoom(room.id).state,'ENDED');assert.equal(none.length,0);
});

test('결과 파일은 한 줄씩 쌓고 최신순으로 읽으며 깨진 줄은 건너뜀',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-results-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'nested','results.jsonl'),log=new ResultLog(file);
 log.append({gameId:'g1'});fs.appendFileSync(file,'{"gameId":"broken\n');log.append({gameId:'g2'});
 assert.deepEqual(new ResultLog(file).recent().map(r=>r.gameId),['g2','g1']);assert.deepEqual(new ResultLog(file).recent(1).map(r=>r.gameId),['g2']);
 const memory=new ResultLog(null);for(let i=0;i<60;i++)memory.append({gameId:'m'+i});
 assert.equal(memory.recent().length,50);assert.equal(memory.recent()[0].gameId,'m59');
});
