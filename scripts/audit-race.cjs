// Local-only browser verification. Does not touch saved quizzes or running rooms.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),WebSocket=require('ws');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3146,base=`http://127.0.0.1:${port}`,pending=new Map(),sockets=[];let child,browser,serial=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(40);}throw Error('Timed out waiting for browser/server');}
function control(command,data={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.send({id,command,...data});});}
(async()=>{const report={};try{
 fs.mkdirSync('artifacts',{recursive:true});child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.pipe(process.stderr);child.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 await until(async()=>{try{return(await fetch(base+'/api/rooms')).ok;}catch{}});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base+'/?model=atlas&quality=ultra&aa=fxaa');await page.waitForFunction(()=>libraryReady,{}, {timeout:90000});
 await page.evaluate(()=>{builderQuestions=[newQuizStep()];activeQuizIndex=0;changeBuilderType(0,'RACE');setRaceQuestionCount(0,4);setRaceAnswer(0,2,'X');});
 assert.equal(await page.locator('[aria-label="레이스 문제 개수"]').inputValue(),'4');assert.equal(await page.locator('.race-question-row').count(),4);report.editor='문제 개수 변경 및 OX 정답 편집 통과';
 await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'OX 레이스 검증',nickname:'달리기',avatarId:'woni',worldDelta:true,targetWinners:1,restSeconds:0,questions:[{type:'RACE',question:'OX 레이스',timeLimit:120,raceQuestions:[{question:'리센느 멤버는 5명이다.',answer:'O'},{question:'가'.repeat(100),answer:'O'}]},{type:'OX',question:'일반 맵으로 돌아왔어요.',answer:'O',timeLimit:30}]})));
 await page.waitForFunction(()=>currentRoomId&&roomState?.state==='WAITING');const roomId=await page.evaluate(()=>currentRoomId),host=await page.evaluate(()=>myClientId);
 for(let i=0;i<3;i++){const socket=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(socket);await new Promise((resolve,reject)=>{socket.on('error',reject);socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='WELCOME')socket.send(JSON.stringify({type:'JOIN_ROOM',roomId,nickname:'참가자'+i,worldDelta:true}));if(m.type==='JOINED_ROOM')resolve();});});}
 await control('start',{roomId});await control('next',{roomId});await page.waitForFunction(()=>raceActive&&raceOwn?.participant&&roomState.state==='QUESTION');
 assert.equal(await page.evaluate(()=>raceOwn.quota),2);
 await page.screenshot({path:'artifacts/race-desktop.png'});
 // Drive the actual client MOVE loop, including collision prediction and server speed limits.
 async function trip(x){const seq=await page.evaluate(()=>raceOwn.seq);await page.evaluate(x=>{myMoveTarget={x:0,z:RaceRules.JUNCTION_Z,after:{x,z:RaceRules.JUNCTION_Z,after:{x,z:RaceRules.PORTAL_Z}}};},x);await page.waitForFunction(old=>raceOwn.seq>old,seq,{timeout:20000});return page.evaluate(()=>({progress:raceOwn.progress,notice:raceOwn.notice,pos:myPos}));}
 const wrong=await trip(8.5);assert.equal(wrong.progress,0);assert.match(wrong.notice,/오답/);
 const first=await trip(-8.5);assert.equal(first.progress,1);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.evaluate(()=>{raceOwn.question='가'.repeat(100);renderRaceInfo();updateQuestionReadability();});await sleep(250);const fit=await page.evaluate(()=>{const e=document.getElementById('q-main-text');return {width:innerWidth,scroll:e.scrollHeight,height:e.clientHeight,text:e.textContent.length};});assert.equal(fit.text,100);assert.ok(fit.scroll<=fit.height+1,JSON.stringify(fit));await page.screenshot({path:`artifacts/race-question-${width}.png`});}
 await page.setViewportSize({width:1280,height:800});
 await page.evaluate(()=>{myMoveTarget={x:0,z:RaceRules.JUNCTION_Z};});await page.waitForFunction(()=>Math.abs(myPos.z-RaceRules.JUNCTION_Z)<.15);await sleep(300);await page.screenshot({path:'artifacts/race-portals-desktop.png'});await page.setViewportSize({width:390,height:844});await sleep(300);await page.screenshot({path:'artifacts/race-portals-mobile.png'});await page.setViewportSize({width:1280,height:800});
 const finished=await trip(-8.5);assert.equal(finished.progress,2);assert.equal(await page.evaluate(()=>raceOwn.rank),1);report.movement={wrong,first,finished};
 const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3,serviceWorkers:'block'});phone.on('pageerror',e=>errors.push(e.message));await phone.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await phone.goto(base);await phone.waitForFunction(()=>libraryReady);await phone.evaluate(roomId=>ws.send(JSON.stringify({type:'JOIN_ROOM',roomId,nickname:'관전자',worldDelta:true})),roomId);await phone.waitForFunction(()=>raceActive&&raceOwn&&!raceOwn.participant);
 assert.equal(await phone.evaluate(()=>raceOwn.quota),2);report.lateSpectator='중도 입장자는 참가 불가·정원 불변';
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/race-mobile.png'});
 // Force only the round deadline, then confirm one finisher survives and normal OX rendering returns.
 await control('judge',{roomId});await page.waitForFunction(()=>roomState.state==='JUDGE');const snapshot=await control('snapshot',{roomId});assert.equal(snapshot.players.filter(p=>p.alive&&p.eligible).length,1);assert.equal(snapshot.players.find(p=>p.id===host).alive,true);
 await control('next',{roomId});await page.waitForFunction(()=>roomState.currentQuestion?.type==='OX'&&!raceActive&&worldGroup.visible);report.restore='레이스 판정 후 일반 OX 맵 복귀 통과';
 assert.deepEqual(errors,[]);report.errors=errors;report.result='PASS';fs.writeFileSync('artifacts/race-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{for(const s of sockets)s.terminate();await browser?.close();child?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
