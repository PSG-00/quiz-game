const crypto=require('node:crypto'),Rules=require('../client/raceRules');
class RaceRound{
 constructor(room,question){
  this.room=room;this.items=question.raceQuestions;this.quota=Rules.quota(room.roundParticipants.size);this.runners=new Map();this.finished=[];this.qualified=null;this.progressSequence=0;
  const order=this.items.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){const j=crypto.randomInt(i+1);[order[i],order[j]]=[order[j],order[i]];}
  // One immutable question order per round; each runner advances independently.
  this.order=Object.freeze(order);
  for(const id of room.roundParticipants){this.runners.set(id,{order:this.order,progress:0,progressUpdatedAt:null,progressOrder:0,rank:0,seq:0,notice:'출발! 왼쪽 O · 오른쪽 X',lastGate:0});const p=room.players.get(id);Object.assign(p,Rules.START,{moveCredit:0,lastMoveAt:Date.now()});}
 }
 // Plain data for a restarted server; the question supplies the items again.
 snapshot(){return {quota:this.quota,order:[...this.order],finished:[...this.finished],qualified:this.qualified?[...this.qualified]:null,progressSequence:this.progressSequence,runners:[...this.runners].map(([id,r])=>[id,{...r,order:undefined}])};}
 static restore(room,question,data){
  const race=Object.create(RaceRound.prototype),order=Object.freeze([...data.order]);
  return Object.assign(race,{room,items:question.raceQuestions,quota:data.quota,order,finished:[...data.finished],qualified:data.qualified?[...data.qualified]:null,progressSequence:data.progressSequence||0,runners:new Map(data.runners.map(([id,r])=>[id,{...r,order}]))});
 }
 liveFinishers(){return this.finished.filter(id=>this.room.players.get(id)?.eligible!==false&&this.room.players.has(id));}
 passed(id){return (this.qualified||this.liveFinishers().slice(0,this.quota)).includes(id);}
 finalize(){
  if(this.qualified)return this.qualified;
  const finishers=this.liveFinishers(),finished=new Set(finishers);
  const remaining=[...this.runners.keys()].filter(id=>!finished.has(id)&&this.room.players.has(id)&&this.room.players.get(id).eligible!==false);
  // Shuffle first so completely tied zero-progress runners have no join-order bias.
  for(let i=remaining.length-1;i>0;i--){const j=crypto.randomInt(i+1);[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
  remaining.sort((a,b)=>{const x=this.runners.get(a),y=this.runners.get(b);return y.progress-x.progress||(x.progressUpdatedAt??Infinity)-(y.progressUpdatedAt??Infinity)||x.progressOrder-y.progressOrder;});
  this.qualified=[...finishers,...remaining].slice(0,this.quota);
  for(const [id,r] of this.runners)r.notice=this.passed(id)?(finished.has(id)?'완주 선착순 통과!':`진행도 ${r.progress}/${this.items.length} · 순위로 통과!`):`진행도 ${r.progress}/${this.items.length} · 이번 레이스 탈락`;
  return this.qualified;
 }
 send(player){
  if(!player?.ws||player.ws.readyState!==1)return;const runner=this.runners.get(player.id),finished=this.liveFinishers();
  player.ws.send(JSON.stringify({type:'RACE_STATE',roomId:this.room.id,gameId:this.room.gameId,roundId:this.room.roundId,seq:runner?.seq||0,participant:!!runner,progress:runner?.progress||0,total:this.items.length,quota:this.quota,finishedCount:finished.length,qualifiedCount:this.qualified?.length,qualified:this.qualified?this.passed(player.id):undefined,rank:finished.indexOf(player.id)+1,question:runner&&runner.progress<this.items.length?this.items[runner.order[runner.progress]].question:'',notice:runner?.notice||'이번 레이스 관전 중',x:player.x,z:player.z}));
 }
 visit(player,now){
  const r=this.runners.get(player.id);if(!r||r.progress>=this.items.length)return;
  const choice=Rules.gate(player.x,player.z);if(!choice||now-r.lastGate<500)return;
  r.lastGate=now;const correct=choice===this.items[r.order[r.progress]].answer;
  if(correct){r.progress++;r.progressUpdatedAt=now;r.progressOrder=++this.progressSequence;}
  r.seq++;r.notice=correct?'정답! 다음 문제로 출발하세요.':'오답! 출발점에서 다시 도전하세요.';
  if(r.progress===this.items.length){this.finished.push(player.id);r.rank=this.liveFinishers().length;r.notice=`${r.rank}등 완주! 판정을 기다려 주세요.`;}
  Object.assign(player,Rules.START,{moveCredit:0,lastMoveAt:now});
  if(r.progress===this.items.length){for(const p of this.room.players.values())this.send(p);}else this.send(player);
  this.room.broadcastWorldTick();
  if(this.liveFinishers().length>=this.quota)this.room.judgeQuestion();
 }
}
module.exports={RaceRound};
