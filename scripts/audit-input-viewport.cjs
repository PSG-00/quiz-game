// Emulates overlay-keyboard viewport geometry; does not emulate a physical IME.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3139,base=`http://127.0.0.1:${port}`,pending=new Map();let child,browser,serial=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const control=(command,data={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.send({id,command,...data});});
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.resume();
 child.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base);await page.waitForFunction(()=>libraryReady);
 await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'키보드 위치 검증',nickname:'모바일',targetWinners:1,questions:[{type:'SHORT',question:'답안을 입력해 주세요',answer:'서울',timeLimit:60}]})));
 await page.waitForFunction(()=>currentRoomId&&playerEntities.size===1);const roomId=await page.evaluate(()=>currentRoomId);
 await control('question',{roomId,question:{type:'SHORT',question:'답안을 입력해 주세요',answer:'서울',timeLimit:60},duration:60000});await page.locator('#short-answer-panel').waitFor({state:'visible'});
 await page.evaluate(()=>{
  window.fakeViewport={height:innerHeight,offsetTop:0,scale:1};window.inputEvents=0;
  for(const key of ['height','offsetTop','scale'])Object.defineProperty(visualViewport,key,{configurable:true,get:()=>fakeViewport[key]});
  for(const id of ['short-answer-input','chat-input'])document.getElementById(id).addEventListener('input',()=>inputEvents++);
 });
 const results=[];
 async function verify(id,label){
  await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'))-Math.max(0,innerHeight-visualViewport.height-visualViewport.offsetTop))<1);
  await page.waitForFunction(id=>{
   const r=document.getElementById(id).getBoundingClientRect();return r.bottom<=visualViewport.offsetTop+visualViewport.height-4&&r.top>=visualViewport.offsetTop;
  },id);
  const result=await page.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return {input:id,top:r.top,bottom:r.bottom,visibleBottom:visualViewport.offsetTop+visualViewport.height,value:document.getElementById(id).value,inputEvents,inset:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')),sceneHeight:container.clientHeight};},id);
  assert.equal(result.value,'');assert.equal(result.inputEvents,0);assert.ok(result.inset>=0);results.push({label,...result});
 }
 const initialSceneHeight=await page.evaluate(()=>container.clientHeight);
 await page.focus('#short-answer-input');await page.evaluate(()=>{fakeViewport.height=500;visualViewport.dispatchEvent(new Event('resize'));});
 await verify('short-answer-input','keyboard resize before typing');assert.equal(results.at(-1).sceneHeight,initialSceneHeight);
 await page.evaluate(()=>{fakeViewport.offsetTop=60;fakeViewport.height=460;visualViewport.dispatchEvent(new Event('scroll'));});
 await verify('short-answer-input','viewport pan while keyboard open');
 await page.evaluate(()=>{document.activeElement.blur();fakeViewport.height=innerHeight;fakeViewport.offsetTop=0;visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'))===0);
 await page.focus('#short-answer-input');await sleep(80);
 await page.evaluate(()=>{fakeViewport.height=510;}); // Some keyboards report geometry before the resize event.
 await verify('short-answer-input','focus animation without resize notification');
 await page.evaluate(()=>{document.activeElement.blur();fakeViewport.height=innerHeight;visualViewport.dispatchEvent(new Event('resize'));});await sleep(100);
 await page.evaluate(()=>toggleChatPopup());await page.waitForFunction(()=>document.activeElement.id==='chat-input');
 await page.evaluate(()=>{fakeViewport.height=500;visualViewport.dispatchEvent(new Event('resize'));});
 await verify('chat-input','chat keyboard before typing');
 await page.screenshot({path:'artifacts/input-viewport-mobile.png'});
 await page.evaluate(()=>{document.activeElement.blur();closeChatPopup();fakeViewport.height=innerHeight;visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>!document.body.classList.contains('keyboard-open')&&parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'))===0);
 await page.setViewportSize({width:390,height:500});
 await page.evaluate(()=>{fakeViewport.height=innerHeight;});await page.focus('#short-answer-input');
 await verify('short-answer-input','layout viewport also resizes: no double lift');assert.equal(results.at(-1).inset,0);
 assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/input-viewport.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();if(child)child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
