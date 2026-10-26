const crypto=require('node:crypto'),Rules=require('../client/raceRules');
class RaceRound{
 constructor(room,question){
  this.room=room;this.items=question.raceQuestions;this.quota=Rules.quota(room.roundParticipants.size);this.runners=new Map();this.finished=[];
  for(const id of room.roundParticipants){const order=this.items.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=crypto.randomInt(i+1);[order[i],order[j]]=[order[j],order[i]];}this.runners.set(id,{order,progress:0,rank:0,seq:0,notice:'출발! 왼쪽 O · 오른쪽 X',lastGate:0});const p=room.players.get(id);Object.assign(p,Rules.START,{moveCredit:0,lastMoveAt:Date.now()});}
 }
 liveFinishers(){return this.finished.filter(id=>this.room.players.get(id)?.eligible!==false&&this.room.players.has(id));}
 passed(id){return this.liveFinishers().slice(0,this.quota).includes(id);}
 send(player){
  if(!player?.ws||player.ws.readyState!==1)return;const runner=this.runners.get(player.id),finished=this.liveFinishers();
  player.ws.send(JSON.stringify({type:'RACE_STATE',roomId:this.room.id,gameId:this.room.gameId,roundId:this.room.roundId,seq:runner?.seq||0,participant:!!runner,progress:runner?.progress||0,total:this.items.length,quota:this.quota,finishedCount:finished.length,rank:finished.indexOf(player.id)+1,question:runner&&runner.progress<this.items.length?this.items[runner.order[runner.progress]].question:'',notice:runner?.notice||'이번 레이스 관전 중',x:player.x,z:player.z}));
 }
 visit(player,now){
  const r=this.runners.get(player.id);if(!r||r.progress>=this.items.length)return;
  const choice=Rules.gate(player.x,player.z);if(!choice||now-r.lastGate<500)return;
  r.lastGate=now;const correct=choice===this.items[r.order[r.progress]].answer;
  if(correct)r.progress++;
  r.seq++;r.notice=correct?'정답! 다음 문제로 출발하세요.':'오답! 출발점에서 다시 도전하세요.';
  if(r.progress===this.items.length){this.finished.push(player.id);r.rank=this.liveFinishers().length;r.notice=`${r.rank}등 완주! 판정을 기다려 주세요.`;}
  Object.assign(player,Rules.START,{moveCredit:0,lastMoveAt:now});
  if(r.progress===this.items.length){for(const p of this.room.players.values())this.send(p);}else this.send(player);
  this.room.broadcastWorldTick();
  if(this.liveFinishers().length>=this.quota)this.room.judgeQuestion();
 }
}
module.exports={RaceRound};
