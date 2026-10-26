// Local-only CPU/DOM diagnostic; injected profiling never ships to production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3140,base=`http://127.0.0.1:${port}`,requests=new Map();let child,browser,serial=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const control=(command,data={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});child.send({id,command,...data});});
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.resume();
 child.on('message',m=>{const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});
 let source=fs.readFileSync(path.join(__dirname,'../client/app.js'),'utf8').replace(/\r\n/g,'\n');
 source="window.profileCrowd={active:false,mode:'current',frames:[],raw:0};\n"+source;
 source=source.replace('  if(!framePacing.accept(frameTime))return;',"  if(profileCrowd.active)profileCrowd.raw++;\n  if(!framePacing.accept(frameTime))return;\n  const profileStart=performance.now();let profileLabels=0;");
 source=source.replace('    // Position overlays at display rate;',"    if(entity.id!==myClientId&&profileCrowd.mode==='no-overlays'){entity.nameLabel.style.visibility='hidden';entity.overheadSprite.visible=false;continue;}\n    if(entity.id!==myClientId&&profileCrowd.mode==='legacy-labels'&&now-(entity.profileLabelAt||0)<1000/30)continue;\n    entity.profileLabelAt=now;\n    const profileLabelStart=performance.now();\n    // Position overlays at display rate;");
 source=source.replace('    updatePlayerOverheadIfNeeded(entity);\n  }', '    updatePlayerOverheadIfNeeded(entity);\n    profileLabels+=performance.now()-profileLabelStart;\n  }');
 source=source.replace('  podiumGroup.visible=!!currentRoomId;', '  const profileHostStart=performance.now();\n  podiumGroup.visible=!!currentRoomId;');
 source=source.replace('  updateTimerDisplay();\n  MobileCrowd.flush();','  const profileHost=performance.now()-profileHostStart;\n  updateTimerDisplay();\n  MobileCrowd.flush();');
 source=source.replace('  sceneClarity.render(scene, camera);\n  recordRenderedFrame(frameTime);',"  const profileRenderStart=performance.now();\n  sceneClarity.render(scene, camera);\n  if(profileCrowd.active)profileCrowd.frames.push({js:performance.now()-profileStart,labels:profileLabels,host:profileHost,render:performance.now()-profileRenderStart,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});\n  recordRenderedFrame(frameTime);");
 await page.route('**/app.js?*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base);await page.addStyleTag({content:'.profileBaseline .player-name,.profileBaseline .player-chat { will-change:auto;contain:none; }'});await page.waitForFunction(()=>libraryReady&&Object.values(AvatarModels).every(m=>m.loaded),{}, {timeout:120000});
 await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',title:'프로파일 준비',nickname:'프로파일',questions:[{type:'OX',question:'준비',answer:'O',timeLimit:15}]})));await page.waitForFunction(()=>currentRoomId);
 const room=await control('profile-room');
 await page.evaluate(roomId=>ws.send(JSON.stringify({type:'JOIN_ROOM',roomId,nickname:'프로파일',worldDelta:true})),room.id);
 await page.waitForFunction(()=>playerEntities.size===50);await sleep(8000);
 const reports=[];
 const clarity=process.env.PROFILE_CLARITY==='1';
 for(const mode of clarity?['off','sharpen','upscale','off','sharpen','upscale']:['unpromoted','optimized','unpromoted','optimized']){
  await page.evaluate(mode=>{profileCrowd.mode=mode;profileCrowd.active=false;document.body.classList.toggle('profileBaseline',mode==='unpromoted');if(['off','sharpen','upscale'].includes(mode))sceneClarity.setMode(mode);},mode);await sleep(800);
  await page.evaluate(()=>{profileCrowd.frames=[];profileCrowd.raw=0;profileCrowd.start=performance.now();profileCrowd.active=true;});
  await sleep(3500);
  reports.push(await page.evaluate(()=>{
   profileCrowd.active=false;const elapsed=performance.now()-profileCrowd.start,frames=profileCrowd.frames;
   const mean=key=>frames.reduce((n,f)=>n+f[key],0)/frames.length;
   return {clarity:sceneClarity.stats(),mode:profileCrowd.mode,players:playerEntities.size,frames:frames.length,renderFps:frames.length*1000/elapsed,rafFps:profileCrowd.raw*1000/elapsed,meanMs:{js:mean('js'),labels:mean('labels'),host:mean('host'),render:mean('render')},calls:mean('calls'),triangles:mean('triangles')};
  }));
 }
 for(const report of reports){assert.equal(report.players,50);assert.ok(report.frames>0,'No rendered frames captured');}
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(clarity?'artifacts/clarity-crowd-profile.json':'artifacts/crowd-profile.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{if(browser)await browser.close();if(child)child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
