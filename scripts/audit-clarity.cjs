// Controlled colors + frozen game frames. Tests shader output, not phone FPS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=Number(process.env.AUDIT_PORT||3141),base=`http://127.0.0.1:${port}`,requests=new Map();let child,browser,serial=0;
const mobile=process.env.AUDIT_MOBILE==='1',suffix=mobile?'-mobile':'';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const control=(command,data={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});child.send({id,command,...data});});
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:String(port)},silent:true});child.stdout.resume();child.stderr.resume();
 child.on('message',m=>{const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Shader Error'))errors.push(m.text());});
 const source=fs.readFileSync(path.join(__dirname,'../client/app.js'),'utf8').replace(/\r\n/g,'\n').replace('  if(!framePacing.accept(frameTime))return;','  if(!framePacing.accept(frameTime)||window.pauseForClarityAudit)return;');
 await page.route('**/app.js?*',r=>r.fulfill({contentType:'application/javascript',body:source}));
 await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto(base+'/?clarity=compare');
 await page.waitForFunction(()=>libraryReady&&Object.values(AvatarModels).every(m=>m.loaded),{}, {timeout:120000});
 await page.evaluate(()=>ws.send(JSON.stringify({type:'CREATE_ROOM',nickname:'선명도 비교',title:'선명도 검증',questions:[{type:'OX',question:'선명도 비교',answer:'O',timeLimit:15}]})));
 await page.waitForFunction(()=>currentRoomId&&playerEntities.size===1&&hostBackdrop.userData.imageLoaded);await sleep(3000);
 await page.evaluate(()=>{window.pauseForClarityAudit=true;});
 const report={device:mobile?'Chromium mobile viewport, not a physical phone':'desktop Chromium',modes:[]};
 report.depth=await page.evaluate(()=>{
  const gl=renderer.getContext(),original=renderer.setRenderTarget.bind(renderer);let sceneBits=0;
  original(null);const canvasBits=gl.getParameter(gl.DEPTH_BITS);
  renderer.setRenderTarget=t=>{original(t);if(t)sceneBits=gl.getParameter(gl.DEPTH_BITS);};
  try{sceneClarity.render(scene,camera);}finally{renderer.setRenderTarget=original;}
  return {canvasBits,sceneBits};
 });
 console.log('Depth precision:',report.depth);
 assert.ok(report.depth.sceneBits>=report.depth.canvasBits,JSON.stringify(report.depth));
 for(const mode of ['off','sharpen','upscale']){
  const result=await page.evaluate(mode=>{
   sceneClarity.setMode(mode);sceneClarity.render(scene,camera);updateClarityButton();
   return {...sceneClarity.stats(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png')};
  },mode);
  assert.equal(result.mode,mode);assert.equal(result.failed,false);assert.equal(result.targetCount,mode==='off'?0:1);
  if(mode==='upscale')assert.ok(result.inputWidth*result.inputHeight<result.outputWidth*result.outputHeight*.73);
  else assert.equal(result.inputWidth*result.inputHeight,result.outputWidth*result.outputHeight);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(`artifacts/clarity-${mode}${suffix}.png`,Buffer.from(result.png.split(',')[1],'base64'));delete result.png;report.modes.push(result);
 }
 assert.equal(report.modes[1].calls,report.modes[0].calls+1);assert.equal(report.modes[1].triangles,report.modes[0].triangles+1);
 report.controls=[];
 for(const expected of ['off','sharpen','upscale']){
  await page.locator('#clarity-toggle').click();
  assert.equal(await page.evaluate(()=>sceneClarity.stats().mode),expected);
  report.controls.push(await page.locator('#clarity-toggle').textContent());
 }
 report.lifecycle=await page.evaluate(()=>{
  const counts=[];for(let i=0;i<12;i++){sceneClarity.setMode(i%2?'off':'sharpen');sceneClarity.render(scene,camera);counts.push(renderer.info.memory.textures);}
  sceneClarity.setMode('off');return {counts,targets:sceneClarity.stats().targetCount};
 });
 assert.equal(report.lifecycle.targets,0);
 assert.equal(new Set(report.lifecycle.counts.filter((_,i)=>i%2===0)).size,1);
 assert.equal(new Set(report.lifecycle.counts.filter((_,i)=>i%2===1)).size,1);
 report.gameIdentity=await page.evaluate(()=>{
  const gl=renderer.getContext(),size=renderer.getDrawingBufferSize(new THREE.Vector2());
  const read=()=>{const p=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  sceneClarity.setMode('off');sceneClarity.render(scene,camera);const before=read();
  sceneClarity.setMode('sharpen');sceneClarity.setStrength(0);sceneClarity.render(scene,camera);const after=read();
  let max=0,sum=0;for(let i=0;i<before.length;i++){max=Math.max(max,Math.abs(before[i]-after[i]));sum+=Math.abs(before[i]-after[i]);}
  sceneClarity.setStrength(.65);return {maxByteDifference:max,meanByteDifference:sum/before.length};
 });
 assert.ok(report.gameIdentity.maxByteDifference<=2,JSON.stringify(report.gameIdentity));
 report.colors=await page.evaluate(()=>{
  renderer.setPixelRatio(1);renderer.setSize(96,64,false);
  const s=new THREE.Scene();s.background=new THREE.Color(0xeee8e2);
  const c=new THREE.OrthographicCamera(-3,3,2,-2,.1,10);c.position.z=4;
  const objects=[];for(let i=0;i<5;i++){
   const p=new THREE.Mesh(new THREE.PlaneGeometry(.9,2.4),new THREE.MeshBasicMaterial({color:[0x10131a,0x4cd4b0,0xf6877f,0xf5ebd6,0xffffff][i],transparent:i===3,opacity:i===3?.56:1}));p.position.x=i-2;s.add(p);objects.push(p);
  }
  const read=()=>{const p=new Uint8Array(96*64*4);renderer.getContext().readPixels(0,0,96,64,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,p);return p;};
  sceneClarity.setMode('off');sceneClarity.render(s,c);const before=read();
  sceneClarity.setMode('sharpen');sceneClarity.setStrength(0);sceneClarity.render(s,c);const after=read();
  let max=0,sum=0;for(let i=0;i<before.length;i++){max=Math.max(max,Math.abs(before[i]-after[i]));sum+=Math.abs(before[i]-after[i]);}
  for(const p of objects){p.geometry.dispose();p.material.dispose();}sceneClarity.setStrength(.65);sceneClarity.setMode('off');
  return {maxByteDifference:max,meanByteDifference:sum/before.length};
 });
 assert.ok(report.colors.maxByteDifference<=2,JSON.stringify(report.colors));assert.deepEqual(errors,[]);
 report.fallback=await page.evaluate(()=>{
  const original=renderer.setRenderTarget.bind(renderer);let injected=false;
  renderer.setRenderTarget=target=>{if(target&&!injected){injected=true;throw Error('Injected render-target failure');}return original(target);};
  try{sceneClarity.setMode('sharpen');sceneClarity.render(scene,camera);return {...sceneClarity.stats(),buttonDisabled:document.getElementById('clarity-toggle').disabled};}
  finally{renderer.setRenderTarget=original;}
 });
 assert.equal(report.fallback.mode,'off');assert.equal(report.fallback.failed,true);assert.equal(report.fallback.targetCount,0);assert.equal(report.fallback.buttonDisabled,true);
 fs.writeFileSync(`artifacts/clarity-audit${suffix}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();if(child)child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
