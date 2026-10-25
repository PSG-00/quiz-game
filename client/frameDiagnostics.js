/* Optional frame diagnostics. These are frame costs, NOT device utilization.
   GPU results are polled asynchronously; never finish() or wait for the GPU. */
(()=>{
 const panel=document.createElement('details');
 panel.style.cssText='position:fixed;right:8px;bottom:145px;z-index:10001;max-width:min(290px,calc(100vw - 16px));padding:7px 9px;border-radius:8px;background:#172333ed;color:#fff;font:12px/1.5 system-ui';
 panel.innerHTML='<summary style="cursor:pointer">CPU / GPU 진단</summary><label><input type="checkbox"> 측정 켜기</label><div data-values>측정 꺼짐</div><div style="color:#c5d8ea">%는 60 FPS의 프레임 예산(16.67ms) 대비입니다. 기기 전체 사용률이 아닙니다. CPU는 게임 프레임 함수 실행 시간이며, GPU와 합산하지 않습니다.</div>';
 document.body.append(panel);
 const toggle=panel.querySelector('input'),values=panel.querySelector('[data-values]');
 let enabled=false,gl=null,ext=null,api=null,status='off',pending=[],active=null,lastSample=0,cpuMs=null,gpuMs=null,gpuAt=0,lastUi=0,cpuCount=0;
 const originalAnimate=window.animate,originalRender=sceneAntialias.render.bind(sceneAntialias);
 function clearQueries(){if(api){if(active){api.end();api.remove(active);active=null;}for(const q of pending)api.remove(q);}pending=[];}
 function setup(){
  gl=renderer.getContext();
  if(gl.isContextLost()){status='context-lost';return;}
  const v2=renderer.capabilities.isWebGL2;
  ext=gl.getExtension(v2?'EXT_disjoint_timer_query_webgl2':'EXT_disjoint_timer_query');
  if(!ext){api=null;status='unsupported';return;}
  api=v2?{create:()=>gl.createQuery(),begin:q=>gl.beginQuery(ext.TIME_ELAPSED_EXT,q),end:()=>gl.endQuery(ext.TIME_ELAPSED_EXT),available:q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE),result:q=>gl.getQueryParameter(q,gl.QUERY_RESULT),remove:q=>gl.deleteQuery(q)}:
   {create:()=>ext.createQueryEXT(),begin:q=>ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q),end:()=>ext.endQueryEXT(ext.TIME_ELAPSED_EXT),available:q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT),result:q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT),remove:q=>ext.deleteQueryEXT(q)};
  status='waiting';
 }
 function poll(now){
  if(!api||gl.isContextLost())return;
  if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clearQueries();gpuMs=null;status='disjoint';return;}
  while(pending.length&&api.available(pending[0])){
   const q=pending.shift(),ms=api.result(q)/1e6;api.remove(q);
   if(Number.isFinite(ms)&&ms>=0){gpuMs=ms;gpuAt=now;status='available';}
  }
 }
 function snapshot(){return {enabled,cpuFrameMs:cpuMs,gpuRenderMs:gpuMs,gpuStatus:status,gpuSampleAgeMs:gpuAt?Math.round(performance.now()-gpuAt):null,cpuFrameBudgetPercent:cpuMs===null?null:cpuMs/16.6666667*100,gpuFrameBudgetPercent:gpuMs===null?null:gpuMs/16.6666667*100,budgetFps:60,pendingQueries:pending.length};}
 function display(now){if(now-lastUi<500)return;lastUi=now;const s=snapshot(),format=ms=>ms===null?'측정 중':ms.toFixed(1)+'ms · '+(ms/16.6666667*100).toFixed(0)+'%';
  values.textContent='CPU 프레임: '+format(cpuMs)+' / GPU 렌더: '+(status==='unsupported'?'기기·브라우저 미지원':status==='context-lost'?'연결 끊김':format(gpuMs))+(gpuAt&&s.gpuSampleAgeMs>2000?' (GPU 이전 표본)':'');
 }
 sceneAntialias.render=function(scene,camera){
  if(!enabled||!api||document.hidden||gl.isContextLost())return originalRender(scene,camera);
  const now=performance.now();poll(now);
  if(now-lastSample>=250&&pending.length<4){active=api.create();if(active){api.begin(active);lastSample=now;}}
  try{return originalRender(scene,camera);}finally{if(active){api.end();pending.push(active);active=null;}}
 };
 window.animate=function(time){
  if(!enabled)return originalAnimate(time);
  const before=frameNumber,start=performance.now();
  originalAnimate(time);
  if(frameNumber!==before){const ms=performance.now()-start;cpuMs=cpuCount++?cpuMs*.9+ms*.1:ms;display(performance.now());}
 };
 toggle.onchange=()=>{clearQueries();enabled=toggle.checked;cpuMs=gpuMs=null;gpuAt=cpuCount=lastSample=lastUi=0;status='off';if(enabled){setup();display(performance.now());}else values.textContent='측정 꺼짐';};
 renderer.domElement.addEventListener('webglcontextlost',()=>{pending=[];active=null;api=null;gpuMs=null;status='context-lost';});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{if(enabled)setup();});
 const previousSnapshot=QuizPerformance.snapshot;
 QuizPerformance.snapshot=()=>({...previousSnapshot(),diagnostics:snapshot()});
 window.FrameDiagnostics={snapshot,panel};
 if(new URLSearchParams(location.search).get('diagnostics')==='1'){panel.open=true;toggle.checked=true;toggle.onchange();}
})();
