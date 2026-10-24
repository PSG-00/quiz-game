/* Local-only integration load runner. 100 actual WebSocket clients, one server.
   Normal `npm start` never creates bots or raises normal rooms' 100-player cap. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const WebSocket=require('ws');
const {RoomManager}=require('../server/RoomManager');
const PORT=Number(process.env.PORT||3105),COUNT=100,TITLE='[테스트] 봇 100명 · 이동/소수결';
const botIds=new Set(),bots=[],avatars=['woni','liv','minami','may','may-school','zena'];
const statusFile=path.join(__dirname,'../artifacts/bot-load-test.json');
let bootstrapClientId=null,roomId=null,room=null,receivedBytes=0,sentInputs=0,stopping=false,bootstrapStarted=false;
let interval,lastStats=Date.now(),lastBytes=0;
// A test harness around the normal room implementation; never a client option.
const create=RoomManager.prototype.createRoom;
RoomManager.prototype.createRoom=function(options,hostId){
 const created=create.call(this,options,hostId);
 if(hostId!==bootstrapClientId||options.title!==TITLE)return created;
 room=created;created.loadTestCapacity=COUNT+1;
 const add=created.addPlayer.bind(created),remove=created.removePlayer.bind(created);
 created.addPlayer=(id,...args)=>{const hadHuman=[...created.players.keys()].some(id=>!botIds.has(id)),player=add(id,...args);if(!botIds.has(id)&&!hadHuman)created.hostId=id;return player;};
 created.removePlayer=id=>{const wasHost=created.hostId===id;remove(id);if(wasHost){const human=[...created.players.keys()].find(id=>!botIds.has(id));if(human)created.hostId=human;}};
 return created;
};
function send(ws,m){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<128*1024)ws.send(JSON.stringify(m));}
function connectBot(index){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(`ws://127.0.0.1:${PORT}`),bot={ws,index,id:null,player:null,state:null,answerKey:null};bots.push(bot);
 const timeout=setTimeout(()=>reject(new Error(`봇 ${index+1} 접속 시간 초과`)),20000);
 ws.on('error',reject);
 ws.on('message',raw=>{
  receivedBytes+=raw.length;
  // Every socket still receives real traffic. Parse the identical world snapshot
  // once, so the bot driver's own JSON work does not dominate this PC's result.
  if(index!==0&&raw.subarray(0,30).toString().includes('WORLD_TICK'))return;
  let m;try{m=JSON.parse(raw);}catch{return;}
  if(m.type==='WELCOME'){
   bot.id=m.clientId;botIds.add(bot.id);
   if(index===0){bootstrapClientId=bot.id;send(ws,{type:'AUTH_LIBRARY',token:crypto.randomBytes(32).toString('hex')});}
   else send(ws,{type:'JOIN_ROOM',roomId,nickname:`부하봇${String(index+1).padStart(3,'0')}`,avatarId:avatars[index%avatars.length]});
  }else if(m.type==='QUIZ_LIST'&&index===0&&!bootstrapStarted){
   bootstrapStarted=true;
   send(ws,{type:'CREATE_ROOM',nickname:'부하봇001',avatarId:'woni',title:TITLE,targetWinners:1,restSeconds:10,questions:[
    {type:'MINORITY',question:'숫자 안내 없이 적은 쪽을 골라 보세요. 봇 100명이 계속 이동합니다.',timeLimit:60},
    {type:'OX',question:'리센느 멤버는 5명이다.',answer:'O',timeLimit:40},
    {type:'MINORITY',question:'소수결 패자부활전! 유령 중 적은 쪽이 살아납니다.',isRevival:true,timeLimit:40},
    {type:'MULTIPLE',inputMode:'MOVE',question:'네 구역 이동 테스트: 원하는 보기로 이동해 보세요.',choices:['첫 번째 테스트 구역','두 번째 테스트 구역','세 번째 테스트 구역','네 번째 테스트 구역'],answer:'1',timeLimit:40},
    {type:'SHORT',question:'대한민국의 수도는?',answer:'서울,서울특별시',timeLimit:40}
   ]});
  }else if(m.type==='JOINED_ROOM'){
   if(index===0)roomId=m.roomId;clearTimeout(timeout);resolve(bot);
  }else if(m.type==='ROOM_STATE'){
   bot.state=m;
   const q=m.currentQuestion,key=`${m.gameId}:${q?.index}`;
   if(m.state==='QUESTION'&&bot.answerKey!==key){bot.answerKey=key;if(q.type==='SHORT')send(ws,{type:'SUBMIT_SHORT',answer:index%3?'서울':'부산'});if(q.type==='MULTIPLE'&&q.inputMode==='BUTTON')send(ws,{type:'SUBMIT_MULTIPLE',answer:String(index%4+1)});}
  }else if(m.type==='WORLD_TICK'){const players=new Map(m.p.map(p=>[p.i,p]));for(const other of bots)other.player=players.get(other.id);}
  else if(m.type==='ERROR'){clearTimeout(timeout);reject(new Error(m.message));}
 });
});}
function writeStats(){
 const now=Date.now(),report={pid:process.pid,url:`http://localhost:${PORT}/`,roomId,title:TITLE,botCount:bots.filter(b=>b.ws.readyState===WebSocket.OPEN).length,playerCount:room?.players.size||0,hostId:room?.hostId,state:room?.state,inputsSent:sentInputs,receivedBytes,receivedBytesPerSecond:Math.round((receivedBytes-lastBytes)/Math.max(.001,(now-lastStats)/1000)),updatedAt:new Date().toISOString()};
 fs.writeFileSync(statusFile,JSON.stringify(report,null,2));lastBytes=receivedBytes;lastStats=now;
}
async function start(){
 const probe=require('node:net').createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(PORT,'127.0.0.1',()=>probe.close(resolve));});
 fs.mkdirSync(path.dirname(statusFile),{recursive:true});process.env.PORT=String(PORT);
 require('../server/index');
 await connectBot(0);
 for(let i=1;i<COUNT;i++){await connectBot(i);await new Promise(r=>setTimeout(r,25));}
 interval=setInterval(()=>{
  const t=Date.now()/1000;for(const bot of bots){const p=bot.player;if(!p)continue;const stage=!!p.st,x=Math.sin(t*.35+bot.index*2.399)*8,z=stage?Math.cos(t*.27+bot.index*1.71)*4.8:8.75+(Math.sin(t*.5+bot.index)+1)*.45;send(bot.ws,{type:'MOVE',x,z});sentInputs++;}
 },100);
 writeStats();setInterval(writeStats,5000).unref();console.log(`LOAD_TEST_READY ${COUNT} bots · ${TITLE} · http://localhost:${PORT}/ · 첫 실제 입장자가 방장`);
}
function stop(exitCode=0){if(stopping)return;stopping=true;clearInterval(interval);for(const bot of bots)bot.ws.terminate();try{if(fs.existsSync(statusFile)){const s=JSON.parse(fs.readFileSync(statusFile,'utf8'));if(s.pid===process.pid){s.stopped=true;fs.writeFileSync(statusFile,JSON.stringify(s,null,2));}}}catch{}process.exit(exitCode);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
start().catch(error=>{console.error('부하 테스트 시작 실패:',error.message);stop(1);});
