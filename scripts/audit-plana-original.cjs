const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let child,browser;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 child=fork(path.join(__dirname,'../server/index.js'),[],{env:{...process.env,PORT:'3146',OX_DISABLE_PERSISTENCE:'1',OX_PLANA_TEST:'1',OX_PUBLIC_TEST_BOTS:'0'},silent:true});child.stdout.resume();child.stderr.resume();
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3146/api/rooms')).ok)break;}catch{}await sleep(100);}
 const room=(await(await fetch('http://127.0.0.1:3146/api/rooms')).json()).rooms[0];assert.equal(room.playerCount,49);
 const mobile=process.env.AUDIT_MOBILE==='1';
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1,serviceWorkers:'block'}),errors=[],warnings=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
 await page.addInitScript(()=>sessionStorage.setItem('ox-rules-seen','1'));await page.goto('http://127.0.0.1:3146/?model=atlas&quality=ultra&aa=fxaa&test=plana');await page.waitForFunction(()=>libraryReady&&ws?.readyState===1);
 await page.evaluate(id=>ws.send(JSON.stringify({type:'JOIN_ROOM',roomId:id,nickname:'PLANA 원본 점검',avatarId:'plana-original',worldDelta:true})),room.id);
 await page.waitForFunction(()=>PlanaOriginalModel.loaded&&playerEntities.size===50&&[...playerEntities.values()].every(e=>e.charSprite.userData.importedGLB),{},{timeout:120000});await sleep(4000);
 const report=await page.evaluate(()=>{
  const root=playerEntities.get(myClientId).charSprite,meshes=[],bones=new Set();root.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isBone)bones.add(o);});
  return {players:playerEntities.size,avatars:[...new Set([...playerEntities.values()].map(e=>e.avatarId))],localMeshes:meshes.length,bones:bones.size,instancing:InstancedAvatars.stats(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,clarity:sceneClarity.stats(),fps:document.getElementById('fps-meter').textContent,unusedMemberModelsLoaded:Object.values(AvatarModels).filter(m=>m.loaded).length};
 });
 assert.deepEqual(report.avatars,['plana-original']);assert.equal(report.players,50);assert.equal(report.unusedMemberModelsLoaded,0);assert.equal(report.instancing.players,49);
 await page.screenshot({path:`artifacts/plana-original-50${mobile?'-mobile':''}.png`});
 // Inspect the exact original model at useful scale, independent of crowd overlap.
 const png=await page.evaluate(()=>{const s=new THREE.Scene();s.background=new THREE.Color(0xeee8e2);s.add(new THREE.AmbientLight(0xffffff,.55));const light=new THREE.DirectionalLight(0xfff9f4,.75);light.position.set(12,42,26);s.add(light);const root=PlanaOriginalModel.create();s.add(root);const c=new THREE.PerspectiveCamera(35,1,.01,100);c.position.set(0,1.7,7);c.lookAt(0,1.6,0);renderer.setPixelRatio(1);renderer.setSize(768,768,false);renderer.render(s,c);const png=renderer.domElement.toDataURL();PlanaOriginalModel.dispose(root);return png;});
 fs.writeFileSync('artifacts/plana-original-closeup.png',Buffer.from(png.split(',')[1],'base64'));report.errors=errors;report.warnings=warnings;fs.writeFileSync(`artifacts/plana-original-audit${mobile?'-mobile':''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
}finally{await browser?.close();child?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
