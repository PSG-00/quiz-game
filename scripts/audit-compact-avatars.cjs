const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,child;const sleep=ms=>new Promise(r=>setTimeout(r,ms)),detail=Number(process.env.AUDIT_LOD||0),walking=process.env.AUDIT_WALK==='1',suffix=detail||walking?`-lod${detail}${walking?'-walk':''}`:'';
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:'3144'},silent:true});child.stdout.resume();child.stderr.resume();
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3144')).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const source=fs.readFileSync(path.join(__dirname,'../client/app.js'),'utf8').replace(/\r\n/g,'\n').replace('  if(!framePacing.accept(frameTime))return;','  if(!framePacing.accept(frameTime)||window.pauseForCompactAudit)return;');
 await page.route('**/app.js?*',r=>r.fulfill({contentType:'application/javascript',body:source}));await page.goto('http://127.0.0.1:3144');await page.waitForFunction(()=>libraryReady&&Object.values(AvatarModels).every(m=>m.loaded),{},{timeout:120000});
 await page.evaluate(()=>{window.pauseForCompactAudit=true;});
 const report=[];fs.mkdirSync('artifacts/compact-comparison',{recursive:true});
 for(const [id,file] of Object.entries({woni:'woni-sd-v3-walk',liv:'liv-sd-v7-walk',minami:'minami-pink-sd-v2-walk',may:'may-sd-v2-walk','may-school':'may-school-sd-v2-walk',zena:'zena-sd-v2-walk'})){
  const r=await page.evaluate(async({id,file,detail,walking})=>{
   const original=AvatarModels[id],compact=createBakedAvatarModel('./assets/models/'+file+'-compact-v1.glb',id,'compact-audit',{lazy:true});await compact.load();if(!compact.loaded)throw Error('Compact load failed: '+id);
   const a=original.create(),b=compact.create();original.update(a,false,false,0,0);compact.update(b,false,false,0,0);
   if(walking){original.update(a,false,true,0,0,{phase:Math.PI/2,blend:1});compact.update(b,false,true,0,0,{phase:Math.PI/2,blend:1});}
   // Always compare against the original full-detail reference, not another
   // already simplified LOD whose own errors could hide or exaggerate changes.
   if(detail)b.traverse(o=>{if(o.isMesh&&o.geometry.userData.lodIndices)o.geometry.setIndex(o.geometry.userData.lodIndices[detail-1]);});
   const s=new THREE.Scene();s.background=new THREE.Color(0xffffff);s.add(new THREE.AmbientLight(0xffffff,.55));const light=new THREE.DirectionalLight(0xfff9f4,.75);light.position.set(12,42,26);s.add(light);
   const c=new THREE.OrthographicCamera(-1.8,1.8,1.8,-1.8,.1,30),gl=renderer.getContext();renderer.setPixelRatio(1);renderer.setSize(512,512,false);
   const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=1056;const ctx=sheet.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);const measurements=[];
   for(const [column,[view,position]] of [['front',[0,1.6,8]],['side',[8,1.6,0]],['back',[0,1.6,-8]]].entries()){
    c.position.set(...position);c.lookAt(0,1.6,0);c.updateMatrixWorld(true);const pixels=[];
    for(const [row,root] of [a,b].entries()){
     s.add(root);renderer.render(s,c);const p=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,p);pixels.push(p);
     ctx.drawImage(renderer.domElement,column*512,row*528+16);ctx.fillStyle='#111';ctx.font='14px sans-serif';ctx.fillText((row?'COMPACT LOD'+detail:'ORIGINAL LOD0')+' '+view,column*512+8,row*528+14);s.remove(root);
    }
    let union=0,xor=0,difference=0;for(let i=0;i<pixels[0].length;i+=4){const fg=p=>p[i]<250||p[i+1]<250||p[i+2]<250,fa=fg(pixels[0]),fb=fg(pixels[1]);if(fa||fb){union++;if(fa!==fb)xor++;for(let k=0;k<3;k++)difference+=Math.abs(pixels[0][i+k]-pixels[1][i+k]);}}
    measurements.push({view,silhouetteMismatch:xor/union,meanForegroundByteDifference:difference/(union*3)});
   }
   original.dispose(a);compact.dispose(b);return {id,measurements,png:sheet.toDataURL('image/png')};
  },{id,file,detail,walking});
  fs.writeFileSync(`artifacts/compact-comparison/${id}${suffix}.png`,Buffer.from(r.png.split(',')[1],'base64'));delete r.png;report.push(r);
  for(const m of r.measurements)assert.ok(m.silhouetteMismatch<.035,JSON.stringify(r));
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`artifacts/compact-visual-audit${suffix}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();if(child)child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
