// 100 players in two full rooms play a whole game over bad mobile lines: half a second of
// lag, 1 s on / 1 s off radio fades with hard cuts, a 12 KB/s line, a 12 s tunnel right as
// the first break starts and a 75 s outage that outlasts the seat hold. Two real browser
// pages ride the worst lines, and each submits one answer while its connection is down.
const fs=require('node:fs'),crypto=require('node:crypto'),{fork}=require('node:child_process'),WebSocket=require('ws');
const {createFlakyProxy}=require('./lib/flakyProxy.cjs');
const WorldUpdates=require('../client/worldUpdates');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const PORT=3160,sleep=ms=>new Promise(r=>setTimeout(r,ms)),started=Date.now(),at=()=>((Date.now()-started)/1000).toFixed(1)+'s';
const FADE={latencyMs:40,jitterMs:40,upMs:1000,downMs:1000,cutEveryMs:[8000,20000]},WEAK={latencyMs:250,jitterMs:250,bytesPerSecond:12000};
const LINES={clean:{port:3161},laggy:{port:3162,latencyMs:250,jitterMs:250},flappy:{port:3163,...FADE},slow:{port:3164,latencyMs:150,jitterMs:100,bytesPerSecond:12000},
 tunnel:{port:3169,latencyMs:30,jitterMs:30},gone:{port:3170,latencyMs:30,jitterMs:30},page1:{port:3165,...FADE},page1Direct:{port:3166,...FADE},page2:{port:3167,...WEAK},page2Direct:{port:3168,...WEAK}};
const QUESTIONS=[
 {type:'SHORT',question:'대한민국의 수도는?',answer:'서울',timeLimit:12},
 {type:'OX',question:'O 쪽으로 가세요',answer:'O',timeLimit:12},
 {type:'MULTIPLE',inputMode:'BUTTON',question:'2번을 고르세요',choices:['일','이','삼','사'],answer:'2',timeLimit:12},
 {type:'MULTIPLE',inputMode:'MOVE',question:'3번 구역으로 가세요',choices:['일','이','삼','사'],answer:'3',timeLimit:12},
 {type:'SHORT',question:'부산을 입력하세요',answer:'부산',timeLimit:12},
 {type:'OX',question:'X 쪽으로 가세요',answer:'X',timeLimit:12}
];
const TARGETS={O:{x:-4,z:0},X:{x:4,z:0},1:{x:-4,z:-2.5},2:{x:4,z:-2.5},3:{x:-4,z:2.5},4:{x:4,z:2.5}};
const FLAGS={worldDelta:true,worldCompact:true,worldFlow:true};
const proxies={},bots=[],report={rooms:{},bots:{},pages:{},server:{},eliminations:[],overdue:[],errors:[]};
let child,browser,stopping=false,serial=0,tickTimer=null;const pending=new Map(),serverLines=[];
function control(command,data={}){return new Promise((resolve,reject)=>{
 const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('server did not answer '+command));},5000);
 pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});child.send({id,command,...data});
});}
fs.mkdirSync('artifacts',{recursive:true});const serverLog=fs.createWriteStream('artifacts/flaky-server.log');

// A protocol client that behaves like client/app.js: same timers, resume, ack and answer resend.
class Bot{
 constructor(index,line,{host=false,roomName}){Object.assign(this,{index,line,host,roomName,token:crypto.randomBytes(32).toString('hex'),session:null,firstId:null,attempts:0,live:false,plan:null,pendingAnswer:null,target:null,pos:null,seq:-1,acked:-1,lastPingAt:0,stats:{drops:0,stalls:0,connectTimeouts:0,resumes:0,rejoins:0,rejected:0,lostSeat:false,errors:[]}});}
 connect(){
  if(!this.session)this.creating=false;
  const ws=this.ws=new WebSocket(`ws://127.0.0.1:${LINES[this.line].port}`);
  Object.assign(this,{welcomed:false,live:false,startedAt:Date.now(),lastPacketAt:Date.now(),world:WorldUpdates.create(),seq:-1,acked:-1});
  ws.on('message',raw=>{if(this.ws===ws)this.receive(ws,raw);});
  ws.on('close',code=>{if(this.ws!==ws||stopping)return;this.live=false;this.stats.drops++;this.reconnect(code===1012?1200:0);});
  ws.on('error',()=>{});
 }
 reconnect(min=0){if(this.timer||stopping)return;const delay=Math.max(min,Math.min(2000,250*2**Math.min(this.attempts++,3)))+Math.random()*400;this.timer=setTimeout(()=>{this.timer=null;this.replace();},delay);}
 replace(){const old=this.ws;this.connect();if(old){old.removeAllListeners('message');old.removeAllListeners('close');old.on('close',()=>{});try{old.terminate();}catch{}}}
 send(m){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(m));}
 receive(ws,raw){
  this.lastPacketAt=Date.now();let m;try{m=JSON.parse(raw);}catch{return;}
  switch(m.type){
   case 'WELCOME':this.welcomed=true;this.send({type:'AUTH_LIBRARY',token:this.token});
    if(this.session)this.send({type:'RESUME_ROOM',...this.session,...FLAGS});else if(!this.host)this.send({type:'JOIN_ROOM',roomId:report.rooms[this.roomName].id,nickname:`${this.line}${this.index}`,avatarId:'woni',...FLAGS});break;
   case 'QUIZ_LIST':if(this.host&&!this.session&&!this.creating){this.creating=true;this.send({type:'CREATE_ROOM',nickname:'방장'+this.roomName,title:'불안정 회선 '+this.roomName,targetWinners:5,restSeconds:6,questions:QUESTIONS,...FLAGS});}break;
   case 'JOINED_ROOM':
    if(this.firstId&&m.clientId!==this.firstId)this.stats.lostSeat=true;this.firstId||=m.clientId;this.id=m.clientId;
    if(m.resumed)this.stats.resumes++;this.session={roomId:m.roomId,resumeToken:m.resumeToken};this.live=true;this.attempts=0;this.pos=null;
    if(this.host&&!report.rooms[this.roomName].id)report.rooms[this.roomName].id=m.roomId;break;
   case 'RESUME_REJECTED':this.stats.rejected++;this.session=null;if(m.roomExists){this.stats.rejoins++;this.send({type:'JOIN_ROOM',roomId:m.roomId,nickname:`${this.line}${this.index}`,avatarId:'woni',...FLAGS});}break;
   case 'ROOM_STATE':this.observe(m);break;
   case 'ANSWER_ACK':if(this.pendingAnswer&&m.roundId===this.pendingAnswer.roundId&&m.answer===this.pendingAnswer.answer)this.pendingAnswer.confirmed=true;break;
   case 'MOVE_CORRECTION':this.pos={x:m.x,z:m.z};break;
   case 'WORLD_TICK':case 'WORLD_DELTA':{
    if(Number.isInteger(m.seq))this.seq=Math.max(this.seq,m.seq);
    const list=this.world.apply(m);if(list&&!this.pos){const me=list.find(p=>p.i===this.id);if(me)this.pos={x:me.x,z:me.z};}break;}
   case 'ERROR':this.stats.errors.push(m.message);break;
  }
 }
 observe(m){
  this.state=m;
  const q=m.currentQuestion;
  if(m.state==='PREPARING')this.pos=null;
  if(m.ownSubmission?.hasSubmitted&&this.pendingAnswer&&m.ownSubmission.roundId===this.pendingAnswer.roundId&&m.ownSubmission.answer===this.pendingAnswer.answer)this.pendingAnswer.confirmed=true;
  if(m.state!=='QUESTION'||!q){if(m.state!=='QUESTION')this.target=null;return;}
  const key=m.roundId;if(this.plan?.key===key)return;
  // A late arrival (back from a tunnel) answers as soon as it can, not after a fixed delay.
  const remaining=m.stateEndTime-Date.now();
  this.plan={key,index:q.index,type:q.type,mode:q.inputMode,gameId:m.gameId,roundId:m.roundId,at:Date.now()+Math.min(800+Math.random()*5200,Math.max(300,remaining-2500)),done:false};
  this.target=null;this.pendingAnswer=null;
 }
 tick(now){
  const ws=this.ws;if(!ws)return;
  if(ws.readyState===0&&now-this.startedAt>5000){this.stats.connectTimeouts++;this.replace();return;}
  if(ws.readyState!==1||!this.welcomed)return;
  if(now-this.lastPacketAt>3000){this.stats.stalls++;this.replace();return;}
  if(now-this.lastPingAt>=1000){this.lastPingAt=now;this.send({type:'APP_PING',t:now});}
  if(this.live&&this.seq>this.acked&&now-(this.ackAt||0)>=200){this.ackAt=now;this.acked=this.seq;this.send({type:'WORLD_ACK',seq:this.seq});}
  const plan=this.plan;
  if(plan&&!plan.done&&now>=plan.at&&this.state?.roundId===plan.roundId){
   plan.done=true;const answer=QUESTIONS[plan.index].answer;
   if(plan.type==='SHORT'||plan.type==='MULTIPLE'&&plan.mode!=='MOVE')this.pendingAnswer={type:plan.type==='SHORT'?'SUBMIT_SHORT':'SUBMIT_MULTIPLE',answer,gameId:plan.gameId,roundId:plan.roundId,sentAt:0};
   else this.target=TARGETS[answer];
  }
  const p=this.pendingAnswer;
  if(p&&!p.confirmed&&this.live&&this.state?.roundId===p.roundId&&now-p.sentAt>1500){p.sentAt=now;this.send({type:p.type,answer:p.answer,gameId:p.gameId,roundId:p.roundId});}
  if(this.target&&this.pos&&this.live){
   const dx=this.target.x-this.pos.x,dz=this.target.z-this.pos.z,d=Math.hypot(dx,dz);
   if(d>.05){const s=Math.min(1,.7/d);this.pos={x:this.pos.x+dx*s,z:this.pos.z+dz*s};}
   // Like the client, keep reporting the resting spot so a lost move is repaired.
   if(d>.05||now-(this.moveAt||0)>600){this.moveAt=now;this.send({type:'MOVE',x:this.pos.x,z:this.pos.z});}
  }
 }
}

async function startPage(name,line,direct,roomId){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),info={name,errors:[],answered:[],timeline:[]};report.pages[name]=info;
 page.on('pageerror',e=>info.errors.push(e.message));
 await context.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));
 // Page files come straight from the server (Cloudflare caches them in production); only
 // the game sockets ride the impaired lines. The server names one direct address, so each
 // page's copy of the HTML points at its own impaired direct line.
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!==String(LINES[line].port))return route.continue().catch(()=>{});
  url.port=String(PORT);
  try{
   const res=await route.fetch({url:url.toString()});
   if(url.pathname==='/'||url.pathname==='/index.html')return await route.fulfill({response:res,body:(await res.text()).replace(`ws://127.0.0.1:${LINES.page1Direct.port}`,`ws://127.0.0.1:${LINES[direct].port}`)});
   return await route.fulfill({response:res});
  }catch{return route.abort().catch(()=>{});}
 });
 await page.goto(`http://127.0.0.1:${LINES[line].port}/`,{timeout:60000});
 await page.waitForFunction(()=>typeof libraryReady!=='undefined'&&libraryReady,{},{timeout:60000});
 // Like a person tapping again when nothing happens; the count shows how often a tap was lost.
 info.joinTaps=0;
 for(let i=0;i<12;i++){
  info.joinTaps++;await page.evaluate(id=>joinRoom(id),roomId).catch(()=>{});
  if(await page.waitForFunction(()=>currentRoomId&&connectionLive,{},{timeout:10000}).then(()=>true,()=>false))break;
 }
 if(!await page.evaluate(()=>currentRoomId&&connectionLive))throw Error(name+' could not join in 2 minutes');
 info.id=await page.evaluate(()=>myClientId);
 await page.evaluate(()=>{window.__timeline=[];setInterval(()=>{const n=document.getElementById('connection-notice');window.__timeline.push({t:Date.now(),state:roomState?.state,index:roomState?.currentQuestion?.index,end:roomState?.stateEndTime,offset:serverTimeOffset,timer:document.getElementById('q-timer')?.textContent,live:connectionLive,path:ws?.oxPath,open:ws?.readyState===1,notice:n&&!n.hidden?n.textContent:''});if(window.__timeline.length>2000)window.__timeline.shift();},500);});
 return {page,context,info};
}
async function playPage({page,info},outageQuestion,lines){
 for(let index=0;index<QUESTIONS.length;index++){
  try{await page.waitForFunction(i=>roomState?.state==='QUESTION'&&roomState.currentQuestion?.index===i&&playerEntities.get(myClientId)?.onStage,index,{timeout:120000,polling:100});}
  catch{info.answered.push({index,skipped:'question never seen'});continue;}
  const q=QUESTIONS[index];
  if(index===outageQuestion){for(const l of lines)proxies[l].offline(3500);await sleep(500);}else await sleep(1500);
  const socket=await page.evaluate(()=>['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState]);
  try{
   await page.evaluate(({type,mode,answer})=>{
    if(type==='SHORT'){document.getElementById('short-answer-input').value=answer;submitShortAnswer();}
    else if(type==='OX')moveToLane(answer==='O'?1:2);
    else moveToLane(Number(answer));
   },q);
   info.answered.push({index,socket});
  }catch(e){info.answered.push({index,socket,threw:e.message.split('\n')[0]});}
 }
}

(async()=>{try{
 child=fork('scripts/lib/auditServer.cjs',[],{env:{...process.env,PORT:String(PORT),OX_DISABLE_PERSISTENCE:'1',OX_PUBLIC_TEST_BOTS:'0',NODE_ENV:'development',OX_DIRECT_WS_URL:`ws://127.0.0.1:${LINES.page1Direct.port}`},silent:true});
 for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{serverLog.write(d);serverLines.push(...d.toString().split('\n').filter(Boolean));});
 child.on('exit',(code,signal)=>{console.log(at(),'SERVER EXITED',code,signal);report.serverExit={code,signal,at:at()};for(const p of pending.values())p.reject(Error('server exited'));pending.clear();});
 child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);});
 for(const [name,options] of Object.entries(LINES)){proxies[name]=createFlakyProxy({...options,targetPort:PORT,label:name});await proxies[name].listen();}
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(250);}
 const lineFor=i=>i>=10&&i<=12?'tunnel':i===13?'gone':['laggy','laggy','laggy','flappy','flappy','flappy','slow','slow'][i%20]||'clean';
 const roomPlan={A:{host:'clean',guests:47},B:{host:'flappy',guests:49}};
 for(const [name,{host,guests}] of Object.entries(roomPlan)){
  report.rooms[name]={id:null,transitions:[]};
  const h=new Bot(0,host,{host:true,roomName:name});bots.push(h);h.connect();
  for(let i=0;i<200&&!report.rooms[name].id;i++)await sleep(100);
  if(!report.rooms[name].id)throw Error('host could not create room '+name);
  for(let i=1;i<=guests;i++){const b=new Bot(i,lineFor(i),{roomName:name});bots.push(b);b.connect();if(i%10===0)await sleep(300);}
 }
 tickTimer=setInterval(()=>{const now=Date.now();for(const b of bots)b.tick(now);},100);
 // Pages fulfilled by the route above have no address, so Chrome's local-network checks would
 // block their sockets to 127.0.0.1. Real pages come from the internet and dial a public host.
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-features=LocalNetworkAccessChecks']});
 const page1=await startPage('page1 (1초 끊김 반복)','page1','page1Direct',report.rooms.A.id);
 const page2=await startPage('page2 (지연+12KB/s)','page2','page2Direct',report.rooms.A.id);
 for(let i=0;i<300;i++){const [a,b]=await Promise.all([control('snapshot',{roomId:report.rooms.A.id}),control('snapshot',{roomId:report.rooms.B.id})]);if(a.players.length===50&&b.players.length===50)break;await sleep(200);}
 const seated=await Promise.all(['A','B'].map(n=>control('snapshot',{roomId:report.rooms[n].id})));
 report.seated=seated.map(s=>s.players.length);console.log(at(),'seated',report.seated);
 await control('health',{reset:true});
 for(const b of bots.filter(b=>b.host))b.send({type:'START_GAME'});
 const games=Promise.all([playPage(page1,0,['page1','page1Direct']),playPage(page2,4,['page2','page2Direct'])]);
 // Monitor both rooms: phase timeline, overdue phases, eliminations, and outage events.
 const prev={A:null,B:null},health=[];let tunnelled=false,goneOut=false,endedAt=null;
 const byId=new Map();
 const deadline=Date.now()+8*60000;
 while(Date.now()<deadline){
  const now=Date.now();
  for(const name of ['A','B']){
   const s=await control('snapshot',{roomId:report.rooms[name].id}),r=report.rooms[name];if(!s)continue;
   const last=r.transitions[r.transitions.length-1];
   if(!last||last.state!==s.state||last.index!==s.index)r.transitions.push({t:now,state:s.state,index:s.index,end:s.end});
   if(['COUNTDOWN','PREPARING','QUESTION','JUDGE','BREAK','LOTTERY'].includes(s.state)&&now>s.end+2500){const o=report.overdue.find(o=>o.room===name&&o.end===s.end);if(o)o.byMs=now-s.end;else report.overdue.push({room:name,state:s.state,index:s.index,end:s.end,byMs:now-s.end});}
   if(prev[name])for(const p of s.players){const before=prev[name].players.find(x=>x.id===p.id);if(before?.alive&&!p.alive)report.eliminations.push({room:name,index:s.index,state:s.state,id:p.id,name:p.name,connected:p.connected,answer:p.answer,x:p.x,z:p.z});}
   prev[name]=s;
   if(!tunnelled&&name==='A'&&s.state==='BREAK'){tunnelled=true;proxies.tunnel.freeze(12000);console.log(at(),'tunnel 12s (tunnel bots in both rooms)');}
   if(!goneOut&&name==='A'&&s.state==='QUESTION'&&s.index===1){goneOut=true;proxies.gone.freeze(75000);console.log(at(),'outage 75s (gone bots)');}
  }
  if(now%2000<500)health.push(await control('health'));
  if(now%10000<500)console.log(at(),'A',prev.A?.state,prev.A?.index,'B',prev.B?.state,prev.B?.index,'alive',prev.A?.players.filter(p=>p.alive).length,prev.B?.players.filter(p=>p.alive).length);
  if(prev.A?.state==='ENDED'&&prev.B?.state==='ENDED'){endedAt||=now;if(now-endedAt>3000)break;}
  await sleep(500);
 }
 await Promise.race([games,sleep(15000)]);clearInterval(tickTimer);
 report.health={samples:health.length,loopP99MaxMs:Math.max(...health.map(h=>h.loopP99Ms)),loopMaxMs:Math.max(...health.map(h=>h.loopMaxMs)),rssMaxMb:Math.max(...health.map(h=>h.rssMb)),cpuMs:health.at(-1)?.cpuMs};
 for(const name of ['A','B']){const r=report.rooms[name],s=prev[name];r.final=s?.state;r.questionsReached=Math.max(-1,...r.transitions.map(t=>t.index??-1))+1;
  r.phaseMs=r.transitions.slice(1).map((t,i)=>({state:r.transitions[i].state,index:r.transitions[i].index,ms:t.t-r.transitions[i].t}));
  r.aliveAtEnd=s?.players.filter(p=>p.alive).length;r.spectators=s?.players.filter(p=>p.eligible===false).map(p=>p.name);}
 for(const b of bots)byId.set(b.firstId,b);
 for(const e of report.eliminations){const b=byId.get(e.id);e.line=b?.line||Object.values(report.pages).find(p=>p.id===e.id)?.name||'?';}
 const lines={};for(const b of bots){const l=lines[b.line]||={count:0,drops:0,stalls:0,connectTimeouts:0,resumes:0,rejoins:0,rejected:0,lostSeat:0,errors:0};l.count++;for(const k of ['drops','stalls','connectTimeouts','resumes','rejoins','rejected','errors'])l[k]+=k==='errors'?b.stats.errors.length:b.stats[k];if(b.stats.lostSeat)l.lostSeat++;}
 report.bots=lines;report.botErrors=[...new Set(bots.flatMap(b=>b.stats.errors))];
 for(const {page,info} of [page1,page2]){
  const timeline=await page.evaluate(()=>window.__timeline);
  // A timer is stuck if the page shows the same timed phase well past its end.
  info.stuck=timeline.filter(s=>['QUESTION','BREAK','PREPARING','COUNTDOWN','JUDGE'].includes(s.state)&&s.t-s.offset>s.end+4000).length;
  info.final=timeline.at(-1)?.state;info.offlineSamples=timeline.filter(s=>!s.open).length;info.paths=[...new Set(timeline.map(s=>s.path))];
  info.notices=[...new Set(timeline.map(s=>s.notice).filter(Boolean))].slice(0,8);
  info.eliminated=report.eliminations.filter(e=>e.id===info.id).map(e=>e.index);
 }
 report.server={lines:serverLines.length,phaseFailed:serverLines.filter(l=>l.includes('ROOM_PHASE_FAILED')).length,overdueLogged:serverLines.filter(l=>l.includes('ROOM_PHASE_OVERDUE')).length,uncaught:serverLines.filter(l=>/UNCAUGHT|UNHANDLED/.test(l)).length,closes:serverLines.filter(l=>l.includes('CONNECTION_CLOSED')).length,restored:serverLines.filter(l=>l.includes('SESSION_RESTORED')).length,expired:serverLines.filter(l=>l.includes('SESSION_EXPIRED')).length,errors:serverLines.filter(l=>/실패|Error/.test(l)).slice(0,10)};
 report.proxies=Object.fromEntries(Object.entries(proxies).map(([k,p])=>[k,p.stats]));
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/flaky-network.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({seated:report.seated,rooms:Object.fromEntries(Object.entries(report.rooms).map(([k,r])=>[k,{final:r.final,questionsReached:r.questionsReached,aliveAtEnd:r.aliveAtEnd,spectators:r.spectators}])),overdue:report.overdue,eliminations:report.eliminations.map(e=>`${e.room} Q${(e.index??-1)+1} ${e.line} ${e.name} connected=${e.connected} answer=${e.answer} x=${e.x} z=${e.z}`),bots:report.bots,botErrors:report.botErrors,pages:Object.values(report.pages).map(p=>({name:p.name,answered:p.answered,eliminated:p.eliminated,stuck:p.stuck,final:p.final,paths:p.paths,offlineSamples:p.offlineSamples,errors:p.errors,notices:p.notices})),health:report.health,server:report.server,proxies:report.proxies},null,1));
}catch(e){console.error('AUDIT FAILED',e);process.exitCode=1;}
finally{stopping=true;clearInterval(tickTimer);for(const b of bots){clearTimeout(b.timer);try{b.ws?.terminate();}catch{}}await browser?.close().catch(()=>{});for(const p of Object.values(proxies))await p.close().catch(()=>{});child?.kill();setTimeout(()=>process.exit(process.exitCode||0),1000);}})();
