/* Opt-in deterministic, local-only workload. No room creation or server bots. */
(()=>{
 const variant=window.PERF_VARIANT||'baseline',active=new URLSearchParams(location.search).get('benchmark')==='100';
 const panel=document.createElement('div');panel.style.cssText='position:fixed;right:8px;top:8px;z-index:10000;background:#172333ed;color:white;padding:8px;border-radius:8px;font:12px system-ui;max-width:270px';
 panel.innerHTML='<b>'+variant+'</b> <span data-live></span><br><button data-measure>30초 측정</button> <button data-save disabled>결과 저장</button> <a href="/performance-compare.html" style="color:#9de7dd">비교 목록</a><div data-result></div>';document.body.append(panel);
 const live=panel.querySelector('[data-live]'),result=panel.querySelector('[data-result]'),measure=panel.querySelector('[data-measure]'),save=panel.querySelector('[data-save]');let report=null,ready=!active;
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 if(active)(async()=>{
  measure.disabled=true;result.textContent='모델 준비 중…';
  while(!myClientId||!Object.values(AvatarModels).every(m=>m.loaded))await delay(100);
  lowSpecMode=false;const ids=Object.keys(AvatarModels);
  getOrCreatePlayerEntity({i:myClientId,n:'본인',av:'woni',s:0,x:0,z:0,a:true,st:true});
  for(let i=0;i<100;i++)getOrCreatePlayerEntity({i:'perf-'+i,n:'참가자'+i,av:ids[i%6],s:i,x:(i%10-4.5)*1.8,z:(Math.floor(i/10)-4.5)*1.1,a:true,st:true});
  document.getElementById('lobby-overlay').classList.add('hidden');document.getElementById('game-hud').classList.remove('hidden');currentRoomId='local-only-profile';updateCameraForScreen();
  const start=performance.now();setInterval(()=>{const t=(performance.now()-start)/1000;for(let i=0;i<100;i++){const e=playerEntities.get('perf-'+i);e.targetX=(i%10-4.5)*1.8+Math.sin(t+i)*.5;e.targetZ=(Math.floor(i/10)-4.5)*1.1+Math.cos(t+i)*.4;}},50);
  await delay(10000);ready=true;measure.disabled=false;result.textContent='준비 완료 · 100명 + 본인';
 })();
 setInterval(()=>{if(window.QuizPerformance){const s=QuizPerformance.snapshot();live.textContent=s.fps+' FPS · '+s.drawCalls+' draws';}},500);
 window.PerfCompare={get report(){return report;},get ready(){return ready;},async measure(duration=30000){
  if(!ready)throw Error('Models not ready');measure.disabled=true;save.disabled=true;const samples=[],start=performance.now(),first=frameNumber;let last=first,prev=start;
  await new Promise(resolve=>{function tick(now){if(frameNumber!==last){samples.push(now-prev);prev=now;last=frameNumber;}if(now-start>=duration)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  const elapsed=performance.now()-start,snapshot=QuizPerformance.snapshot(),sorted=samples.slice().sort((a,b)=>a-b);
  report={variant,createdAt:new Date().toISOString(),workload:active?'deterministic-100-remotes':'live-room',durationMs:elapsed,avgFps:(frameNumber-first)*1000/elapsed,frameP95Ms:sorted[Math.floor(sorted.length*.95)]||null,snapshot,backend:renderer.backend?.isWebGPUBackend?'webgpu':renderer.isWebGPURenderer?'webgl2-fallback':'webgl',viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent,secureContext:isSecureContext,webgpuAvailable:!!navigator.gpu};
  result.textContent=report.avgFps.toFixed(1)+' FPS · P95 '+report.frameP95Ms?.toFixed(1)+'ms · '+report.backend;measure.disabled=false;save.disabled=false;return report;
 }};
 measure.onclick=()=>PerfCompare.measure();save.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='quiz-'+variant+'-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})();
