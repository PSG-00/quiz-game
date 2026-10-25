// Local-only browser reproduction of predicted UI versus authoritative judgement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),WebSocket=require('ws'),{fork}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=Number(process.env.AUDIT_PORT||3133),base='http://127.0.0.1:'+port,requests=new Map();let child,browser,guest,serial=0;
const mobile=process.env.AUDIT_MOBILE==='1',suffix=mobile?'-mobile':'',viewport=mobile?{width:390,height:844}:{width:1280,height:800};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<600;i++){try{const value=await fn();if(value)return value;}catch{}await sleep(20);}throw Error('Audit timeout');}
function control(command,data={}){return new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});child.send({id,command,...data});});}
(async()=>{const result={viewport,device:mobile?'desktop Chromium mobile viewport; not a physical phone':'desktop Chromium'};fs.mkdirSync('artifacts',{recursive:true});try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.resume();child.on('message',m=>{const q=requests.get(m.id);if(q){requests.delete(m.id);m.error?q.reject(Error(m.error)):q.resolve(m.result);}});
 await until(async()=>{try{return(await fetch(base+'/api/rooms')).ok;}catch{return false;}});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base);await page.waitForFunction(()=>libraryReady&&Object.values(AvatarModels).every(m=>m.loaded),{}, {timeout:120000});
 await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'판정 격리 점검',nickname:'판정 점검',avatarId:'woni',worldDelta:true,targetWinners:1,questions:[{type:'OX',question:'정답은 O입니다',answer:'O',timeLimit:15}]})));
 await page.waitForFunction(()=>currentRoomId&&roomState?.state==='WAITING');const roomId=await page.evaluate(()=>currentRoomId),hostId=await page.evaluate(()=>myClientId);
 guest=new WebSocket('ws://127.0.0.1:'+port);let guestId;await new Promise((resolve,reject)=>{guest.on('error',reject);guest.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='WELCOME'){guestId=m.clientId;guest.send(JSON.stringify({type:'JOIN_ROOM',roomId,nickname:'다른 참가자',worldDelta:true}));}if(m.type==='JOINED_ROOM')resolve();});});
 await page.waitForFunction(()=>playerEntities.size===2);
 await control('patch',{roomId,players:{[hostId]:{x:0,z:0},[guestId]:{x:0,z:0}}});await page.evaluate(()=>{myPos={x:0,z:0};myMoveTarget=null;});await sleep(800);
 guest.send(JSON.stringify({type:'CHAT',text:'이동 중 말풍선 표시 확인'}));
 await page.waitForFunction(id=>!!playerEntities.get(id)?.chatBubbleText,guestId);
 result.overlayMotion=await page.evaluate(async id=>{
   const entity=playerEntities.get(id),samples=[];let reads=0;
   for(const el of [entity.nameLabel,entity.chatBubble])for(const prop of ['offsetWidth','offsetHeight']){
     const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,prop);
     Object.defineProperty(el,prop,{configurable:true,get(){reads++;return descriptor.get.call(this);}});
   }
   const originalRender=renderer.render;
   const nextRender=()=>new Promise(resolve=>{renderer.render=function(...args){originalRender.apply(this,args);renderer.render=originalRender;resolve();};});
   try{
     for(let i=0;i<24;i++){
       entity.targetX=entity.x+.15;
       await nextRender();
       samples.push(entity.nameLabel.style.transform);
     }
     const movementReads=reads;
     entity.chatBubbleText='내용이 바뀌면 크기를 다시 계산합니다';entity.chatText.textContent=entity.chatBubbleText;
     await nextRender();
     return {frames:samples.length,distinctPositions:new Set(samples).size,movementReads,contentChangeReads:reads-movementReads};
   }finally{
     renderer.render=originalRender;
     for(const el of [entity.nameLabel,entity.chatBubble])for(const prop of ['offsetWidth','offsetHeight'])delete el[prop];
   }
 },guestId);
 assert.ok(result.overlayMotion.distinctPositions>=22,JSON.stringify(result.overlayMotion));
 assert.ok(result.overlayMotion.movementReads<=8,JSON.stringify(result.overlayMotion));
 assert.ok(result.overlayMotion.contentChangeReads>=2&&result.overlayMotion.contentChangeReads<=4,JSON.stringify(result.overlayMotion));
 const renderSettings=await page.evaluate(()=>{const size=renderer.getDrawingBufferSize(new THREE.Vector2());return {shadowMap:renderer.shadowMap.enabled,antialias:renderer.getContext().getContextAttributes().antialias,fxaaLoaded:typeof SceneAntialias!=='undefined',shadowDraws:CrowdDecorations.stats().shadowDraws,pixels:size.x*size.y,pixelRatio:renderer.getPixelRatio()};});
 assert.equal(renderSettings.shadowMap,false);assert.equal(renderSettings.antialias,false);assert.equal(renderSettings.fxaaLoaded,false);assert.equal(renderSettings.shadowDraws,0);assert.ok(renderSettings.pixels<=1600000);
 result.renderSettings=renderSettings;
 if(!mobile){
  result.resizeBudget=[];
  for(const size of [{width:1920,height:1080},{width:2560,height:1440}]){
   await page.setViewportSize(size);await page.waitForFunction(()=>renderer.getSize(new THREE.Vector2()).x===container.clientWidth&&renderer.getDrawingBufferSize(new THREE.Vector2()).x*renderer.getDrawingBufferSize(new THREE.Vector2()).y<=1600000);
   result.resizeBudget.push(await page.evaluate(()=>{const size=renderer.getDrawingBufferSize(new THREE.Vector2());return {width:innerWidth,height:innerHeight,pixels:size.x*size.y,ratio:renderer.getPixelRatio()};}));
  }
  await page.setViewportSize(viewport);await page.waitForFunction(()=>renderer.getSize(new THREE.Vector2()).x===container.clientWidth);
 }
 await control('question',{roomId,positions:{[hostId]:{x:1,z:0},[guestId]:{x:-2,z:0}}});await page.waitForFunction(()=>roomState?.state==='QUESTION');
 await page.evaluate(()=>{myPos.x=-.001;myPos.z=0;myMoveTarget=null;lastSentPosKey='';lastSentPosTime=0;});
 const rounded=await until(async()=>{const r=await control('snapshot',{roomId});const p=r.players.find(p=>p.id===hostId);return p.x===0?p:null;});
 const local=await until(()=>page.evaluate(()=>{const e=playerEntities.get(myClientId);return e.zoneId==='X'&&myPos.x===-.001?{x:myPos.x,renderedX:e.x,zone:e.zoneId,badge:computeOverheadBadge(e)}:null;}));
 await page.screenshot({path:'artifacts/audit-rounding-before'+suffix+'.png'});
 const judged=await control('judge',{roomId}),victim=judged.players.find(p=>p.id===hostId);assert.equal(victim.alive,false);
 assert.equal(local.zone,'X');result.rounding={status:'PASS',client:local,server:{x:rounded.x,zone:rounded.x<0?'O':'X'},outcome:victim.result};
 await page.waitForFunction(()=>!playerEntities.get(myClientId).alive);await page.screenshot({path:'artifacts/audit-rounding-after'+suffix+'.png'});
 await page.evaluate(()=>{window.originalAuditSend=ws.send.bind(ws);ws.send=raw=>{if(JSON.parse(raw).type!=='MOVE')originalAuditSend(raw);};});
 await sleep(100);
 await control('question',{roomId,positions:{[hostId]:{x:2,z:0},[guestId]:{x:-2,z:0}}});await page.waitForFunction(()=>roomState?.state==='QUESTION'&&playerEntities.get(myClientId).onStage);await sleep(100);
 await page.evaluate(()=>{
  ws.send=raw=>{const m=JSON.parse(raw);if(m.type==='MOVE')setTimeout(()=>originalAuditSend(raw),200);else originalAuditSend(raw);};
  myPos.x=-2;myPos.z=0;myMoveTarget=null;lastSentPosKey='';lastSentPosTime=0;
 });
 await page.waitForFunction(()=>playerEntities.get(myClientId).zoneId==='O');
 const beforeDelay=(await control('snapshot',{roomId})).players.find(p=>p.id===hostId);assert.equal(beforeDelay.x,2);
 const predicted=await page.evaluate(()=>({x:myPos.x,zone:playerEntities.get(myClientId).zoneId}));
 const expired=await control('judge',{roomId});assert.equal(expired.players.find(p=>p.id===hostId).alive,false);
 result.inFlightMovement={status:'PASS_SERVER_AUTHORITY',delayMs:200,client:predicted,serverBeforeDeadline:{x:beforeDelay.x,zone:'X'},outcome:expired.players.find(p=>p.id===hostId).result};
 await sleep(250);await page.evaluate(()=>ws.send=originalAuditSend);
 const short=await control('question',{roomId,question:{type:'SHORT',answer:'서울',timeLimit:60},duration:60000});
 await page.waitForFunction(()=>roomState?.state==='QUESTION'&&roomState.currentQuestion.type==='SHORT'&&playerEntities.get(myClientId).onStage);
 await page.evaluate(()=>{document.getElementById('short-answer-input').value='서울';submitShortAnswer();});
 await until(async()=>(await control('snapshot',{roomId})).players.find(p=>p.id===hostId).submitted);
 await page.evaluate(()=>ws.close());await page.waitForFunction(()=>currentRoomId===null);
 await page.waitForFunction(id=>currentRoomId&&myClientId===id&&playerEntities.get(id)?.hasSubmitted,hostId,{timeout:30000});
 assert.equal(await page.locator('#short-answer-input').inputValue(),'서울');
 await page.reload();await page.waitForFunction(id=>currentRoomId&&myClientId===id&&playerEntities.get(id)?.hasSubmitted,hostId,{timeout:120000});
 assert.equal(await page.locator('#short-answer-input').inputValue(),'서울');
 result.reconnect={status:'PASS',samePlayerId:true,answer:'서울',socketReconnect:true,pageReload:true};
 const spectator=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
 spectator.on('pageerror',e=>errors.push('spectator: '+e.message));
 await spectator.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await spectator.goto(base);await spectator.waitForFunction(()=>libraryReady);
 await spectator.evaluate(rid=>ws.send(JSON.stringify({type:'JOIN_ROOM',roomId:rid,nickname:'늦게 온 관전자',worldDelta:true})),roomId);
 await spectator.waitForFunction(()=>currentRoomId&&playerEntities.get(myClientId)?.eligible===false);
 assert.equal(await spectator.evaluate(()=>canAnswer()),false);await spectator.locator('#spectator-status').waitFor({state:'visible'});
 assert.equal(await spectator.evaluate(()=>computeOverheadBadge(playerEntities.get(myClientId)).text),'관전');
 assert.equal(await spectator.evaluate(()=>canMove()),false);assert.equal(await spectator.locator('#btn-chat-toggle').isVisible(),false);
 await spectator.evaluate(()=>toggleChatPopup());assert.equal(await spectator.locator('#chat-popup').isVisible(),false);
 assert.equal(await spectator.locator('#hud-spectator-count').count(),0);
 assert.equal(await spectator.locator('#status-capsule .status-pill').count(),3);
 await spectator.waitForFunction(()=>!playerEntities.get(myClientId).group.visible);
 await spectator.selectOption('#spectate-target',guestId);await spectator.waitForFunction(id=>spectatorTargetId===id,guestId);
 await control('patch',{roomId,players:{[guestId]:{x:8,z:0}}});
 await spectator.waitForFunction(id=>playerEntities.get(id).x>7.9,guestId);
 if(mobile)await spectator.waitForFunction(()=>Math.abs(cameraFollow.x-Math.min(cameraFollow.maxX,playerEntities.get(spectatorTargetId).x*layoutScaleX))<.3);
 const selectedView=await spectator.evaluate(()=>({target:spectatorTargetId,cameraX:cameraFollow.x,portrait:cameraFollow.enabled}));
 await control('judge',{roomId});await spectator.waitForFunction(id=>spectatorTargetId===id,hostId);
 await spectator.waitForFunction(()=>document.getElementById('hud-ghost-count').textContent==='유령 1');
 assert.equal(await spectator.evaluate(id=>computeOverheadBadge(playerEntities.get(id)).text,guestId),'유령');
 await spectator.screenshot({path:'artifacts/spectator-view'+suffix+'.png'});
 await control('patch',{roomId,players:{[hostId]:{alive:false}}});await spectator.waitForFunction(()=>spectatorTargetId===null);
 assert.equal(await spectator.locator('#spectate-target').isDisabled(),true);
 const header=await spectator.evaluate(()=>{const timer=document.getElementById('q-timer').getBoundingClientRect(),pills=[...document.querySelectorAll('#status-capsule .status-pill')].map(e=>e.getBoundingClientRect());return {pillsFit:pills.every((r,i)=>(r.right<=timer.left||r.top>=timer.bottom)&&(!i||pills[i-1].right+3.9<=r.left)),uniform:pills.every(r=>Math.abs(r.width-pills[0].width)<1&&r.height===pills[0].height),font:parseFloat(getComputedStyle(document.querySelector('.status-pill')).fontSize),bounds:pills.map(r=>({left:r.left,right:r.right,width:r.width,height:r.height})),timerLeft:timer.left};});assert.equal(header.pillsFit,true,JSON.stringify(header));assert.equal(header.bounds.length,3);assert.ok(header.font>=9);
 if(mobile){await spectator.setViewportSize({width:320,height:700});await sleep(200);const fits=await spectator.evaluate(()=>{const timer=document.getElementById('q-timer').getBoundingClientRect(),pills=[...document.querySelectorAll('#status-capsule .status-pill')].map(e=>e.getBoundingClientRect());return pills.every((r,i)=>r.right<=timer.left&&(!i||pills[i-1].right+3.9<=r.left));});assert.equal(fits,true,'320px header fit');await spectator.screenshot({path:'artifacts/spectator-320.png'});}
 await control('reset',{roomId});await spectator.waitForFunction(()=>!document.body.classList.contains('spectator-mode'));
 assert.equal(await spectator.locator('#btn-chat-toggle').isVisible(),true);assert.equal(await spectator.locator('#spectator-status').isVisible(),false);
 result.spectator={status:'PASS',canAnswer:false,canMove:false,chatHidden:true,ownAvatarHidden:true,selectedView,autoSwitchOnDeath:true,emptyFallback:true,unlockedOnReset:true,header};
 await spectator.evaluate(()=>leaveRoom());await spectator.close();
 // A former round's ACK cannot mark the new question as submitted in the UI.
 const next=await control('question',{roomId,index:1,question:{type:'SHORT',answer:'부산',timeLimit:60},duration:60000});
 await page.waitForFunction(round=>roomState?.roundId===round&&!playerEntities.get(myClientId)?.hasSubmitted,next.roundId);
 await page.evaluate(old=>ws.onmessage({data:JSON.stringify({type:'ANSWER_ACK',roomId:currentRoomId,gameId:old.gameId,roundId:old.roundId,answer:'서울'})}),short);
 assert.equal(await page.evaluate(()=>playerEntities.get(myClientId).hasSubmitted),false);result.staleAck={status:'PASS'};
 await page.bringToFront();await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'일반 이동 점검',nickname:'이동 점검',worldDelta:true,targetWinners:1,questions:[{type:'OX',question:'점검',answer:'O',timeLimit:15}]})));
 await page.waitForFunction(old=>currentRoomId!==old&&roomState?.state==='WAITING'&&playerEntities.has(myClientId),roomId);
 await sleep(150);const walkRoom=await page.evaluate(()=>currentRoomId),walkBefore=(await control('snapshot',{roomId:walkRoom})).players.find(p=>p.id===hostId);
 await page.keyboard.down('ArrowRight');await sleep(1000);await page.keyboard.up('ArrowRight');await sleep(150);
 const walkAfter=(await control('snapshot',{roomId:walkRoom})).players.find(p=>p.id===hostId),clientAfter=await page.evaluate(()=>myPos.x),distance=walkAfter.x-walkBefore.x;
 assert.ok(distance>4&&distance<9,'Normal walking distance: '+distance);assert.ok(Math.abs(clientAfter-walkAfter.x)<.2);
 result.walking={status:'PASS',serverDistance:distance,clientServerDifference:Math.abs(clientAfter-walkAfter.x)};
 assert.equal(errors.length,0,errors.join('\n'));result.browserErrors=errors;
 fs.writeFileSync('artifacts/client-judgement-audit'+suffix+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{guest?.terminate();await browser?.close();child?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
