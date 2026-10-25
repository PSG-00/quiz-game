const AVATARS=['woni','liv','minami','may','may-school','zena'];
const TITLE='[테스트] 봇 48명 · 사람 2명';
function enablePublicTestRoom(manager,{startLoop=true}={}){
 if(manager.publicTestRoom&&!manager.publicTestRoom.closed)return manager.publicTestRoom;
 const room=manager.createRoom({title:TITLE,targetWinners:1,restSeconds:10,questions:[
  {type:'MINORITY',question:'적은 쪽을 골라 보세요. 봇 48명이 함께 움직입니다.',timeLimit:15},
  {type:'OX',question:'리센느 멤버는 5명이다.',answer:'O',timeLimit:15},
  {type:'MINORITY',question:'소수결 패자부활전! 유령 중 적은 쪽이 살아납니다.',isRevival:true,timeLimit:15},
  {type:'MULTIPLE',inputMode:'MOVE',question:'네 구역 이동 테스트: 원하는 보기로 이동해 보세요.',choices:['첫 번째 테스트 구역','두 번째 테스트 구역','세 번째 테스트 구역','네 번째 테스트 구역'],answer:'1',timeLimit:15},
  {type:'SHORT',question:'대한민국의 수도는?',answer:'서울,서울특별시',timeLimit:15}
 ]},null);
 // This set is created only by the trusted server startup path, never a client flag.
 room.testBotIds=new Set();const bots=[];
 for(let i=0;i<48;i++){
  const id=room.id+'_bot_'+i;room.testBotIds.add(id);
  const player=room.addPlayer(id,'부하봇'+String(i+1).padStart(3,'0'),null,AVATARS[i%AVATARS.length]);
  bots.push({player,index:i,answerKey:null});
 }
 room.hostId=bots[0].player.id;
 const controller={room,closed:false,interval:null,
  tick(now=Date.now()){
   if(controller.closed)return;
   // The permanent test room consumes no bot movement work while nobody watches.
   if(![...room.players.keys()].some(id=>!room.testBotIds.has(id)))return;
   const t=now/1000,q=room.getCurrentQuestion(),key=room.gameId+':'+q?.index;
   for(const bot of bots){
    const p=bot.player,stage=room.isPlayerOnStage(p),x=Math.sin(t*.35+bot.index*2.399)*8,z=stage?Math.cos(t*.27+bot.index*1.71)*4.8:8.75+(Math.sin(t*.5+bot.index)+1)*.45;
    room.movePlayer(p.id,x,z);
    if(room.state==='QUESTION'&&bot.answerKey!==key){
     bot.answerKey=key;
     if(q?.type==='SHORT')room.submitAnswer(p.id,bot.index%3?'서울':'부산');
     if(q?.type==='MULTIPLE'&&q.inputMode!=='MOVE')room.submitAnswer(p.id,String(bot.index%4+1));
    }
   }
  },
  close(){if(controller.closed)return;controller.closed=true;clearInterval(controller.interval);manager.closeRoom(room);}
 };
 if(startLoop){controller.interval=setInterval(()=>controller.tick(),100);controller.interval.unref?.();}
 manager.publicTestRoom=controller;return controller;
}
module.exports={enablePublicTestRoom,TITLE};
