// Inject loss/render failure into one client only; the other keeps receiving.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3138,base=`http://127.0.0.1:${port}`,pending=new Map();let child,browser,serial=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const control=(command,data={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.send({id,command,...data});});
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.resume();
 child.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const pc=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];
 for(const page of [pc,phone]){page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base);await page.waitForFunction(()=>libraryReady);}
 await pc.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'개별 기기 전환 복구',nickname:'노트북',targetWinners:1,restSeconds:1,worldDelta:true,questions:[{type:'SHORT',question:'첫 문제',answer:'서울',timeLimit:15},{type:'SHORT',question:'다음 문제',answer:'서울',timeLimit:15}]})));
 await pc.waitForFunction(()=>currentRoomId&&roomState?.state==='WAITING');const roomId=await pc.evaluate(()=>currentRoomId);
 await phone.evaluate(roomId=>ws.send(JSON.stringify({type:'JOIN_ROOM',roomId,nickname:'모바일',worldDelta:true})),roomId);
 await phone.waitForFunction(()=>currentRoomId&&playerEntities.size===2);
 const result=[];
 for(const mode of ['missing-transition','expired-break-without-world-hint','render-error','resume']){
  await control('question',{roomId,index:0,question:{type:'SHORT',question:'첫 문제',answer:'서울'}});
  await phone.waitForFunction(()=>roomState?.state==='QUESTION'&&roomState.currentQuestion.index===0);
  await phone.evaluate(mode=>{
   window.auditRequests=0;window.auditDropped=0;
   const originalMessage=ws.onmessage,originalSend=ws.send.bind(ws),originalRender=handleRoomStateUpdate;
   ws.send=raw=>{if(JSON.parse(raw).type==='GET_ROOM_STATE')auditRequests++;originalSend(raw);};
   ws.onmessage=event=>{const msg=JSON.parse(event.data);
    if(mode!=='render-error'&&msg.type==='ROOM_STATE'&&msg.state==='QUESTION'&&msg.currentQuestion.index===1&&!auditDropped){auditDropped++;return;}
    if((mode==='expired-break-without-world-hint'||mode==='resume')&&msg.type.startsWith('WORLD_')){delete msg.stateVersion;event={data:JSON.stringify(msg)};}
    originalMessage(event);
   };
   handleRoomStateUpdate=msg=>{if(mode==='render-error'&&msg.state==='QUESTION'&&msg.currentQuestion.index===1&&!auditDropped){auditDropped++;throw Error('Injected one-client UI failure');}return originalRender(msg);};
   window.restoreAudit=()=>{ws.onmessage=originalMessage;ws.send=originalSend;handleRoomStateUpdate=originalRender;};
  },mode);
  await control('break',{roomId});await phone.waitForFunction(()=>roomState?.state==='BREAK');
  if(mode==='render-error'||mode==='resume')await phone.evaluate(()=>toggleChatPopup());
  await pc.waitForFunction(()=>roomState?.state==='QUESTION'&&roomState.currentQuestion.index===1);
  if(mode==='resume')await phone.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await phone.waitForFunction(()=>roomState?.state==='QUESTION'&&roomState.currentQuestion.index===1&&!document.getElementById('short-answer-panel').classList.contains('hidden')&&document.getElementById('q-main-text').textContent==='다음 문제',{}, {timeout:7000});
  const recovery=await phone.evaluate(()=>({requests:auditRequests,dropped:auditDropped,chatClosed:document.getElementById('chat-popup').classList.contains('hidden'),canAnswer:canAnswer()}));
  assert.equal(recovery.dropped,1);assert.ok(recovery.requests>=1&&recovery.requests<=4,JSON.stringify(recovery));assert.equal(recovery.chatClosed,true);assert.equal(recovery.canAnswer,true);
  await phone.evaluate(()=>{document.getElementById('short-answer-input').value='서울';submitShortAnswer();});
  await phone.waitForFunction(()=>playerEntities.get(myClientId)?.hasSubmitted);
  const id=await phone.evaluate(()=>myClientId),snapshot=await control('snapshot',{roomId});assert.equal(snapshot.players.find(p=>p.id===id).answer,'서울');
  await control('judge',{roomId});assert.equal((await control('snapshot',{roomId})).players.find(p=>p.id===id).alive,true);
  await phone.evaluate(()=>restoreAudit());result.push({mode,...recovery,serverAcceptedAnswer:true,survived:true});
 }
 assert.deepEqual(errors,[]);fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/phase-recovery.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(browser)await browser.close();if(child)child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
