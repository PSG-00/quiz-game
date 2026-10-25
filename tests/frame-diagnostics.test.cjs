const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../client/frameDiagnostics.js'),'utf8');
function fixture({supported=true,v2=true,ready=true}={}){
 let now=1000,nextId=0,deleted=[],calls=0,disjoint=false,lost=false;
 const toggle={},values={},panel={style:{},querySelector:s=>s==='input'?toggle:values};
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2,QUERY_RESULT_AVAILABLE_EXT:3,QUERY_RESULT_EXT:4};
 const gl={isContextLost:()=>lost,getExtension:()=>supported?ext:null,createQuery:()=>++nextId,beginQuery:()=>calls++,endQuery:()=>{},getParameter:()=>disjoint,QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getQueryParameter:(_,p)=>p===3?ready:8000000,deleteQuery:q=>deleted.push(q)};
 Object.assign(ext,{createQueryEXT:gl.createQuery,beginQueryEXT:gl.beginQuery,endQueryEXT:gl.endQuery,getQueryObjectEXT:gl.getQueryParameter,deleteQueryEXT:gl.deleteQuery});
 const context={URLSearchParams,location:{search:''},performance:{now:()=>now},document:{hidden:false,createElement:()=>panel,body:{append(){}}},renderer:{getContext:()=>gl,capabilities:{isWebGL2:v2},domElement:{addEventListener(){}}},sceneAntialias:{render(){}},QuizPerformance:{snapshot:()=>({fps:60})},frameNumber:0};
 context.window=context;context.animate=()=>{context.sceneAntialias.render();context.frameNumber++;now+=5;};vm.runInNewContext(source,context);
 return {context,toggle,values,enable(){toggle.checked=true;toggle.onchange();},disable(){toggle.checked=false;toggle.onchange();},frame(){now+=300;context.animate(now);},get deleted(){return deleted;},get calls(){return calls;},disjoint(){disjoint=true;},stats:()=>context.FrameDiagnostics.snapshot()};
}
test('진단 기본 OFF: 쿼리 생성 없이 기존 프레임 실행',()=>{
 const f=fixture();f.frame();assert.equal(f.calls,0);assert.equal(f.context.frameNumber,1);assert.equal(f.stats().enabled,false);
});
test('WebGL1/2 비동기 GPU 시간은 ms와 60 FPS 예산으로 표시',()=>{
 for(const v2 of [true,false]){const f=fixture({v2});f.enable();f.frame();f.frame();assert.equal(f.stats().gpuRenderMs,8);assert.ok(Math.abs(f.stats().gpuFrameBudgetPercent-48)<.01);assert.equal(f.stats().cpuFrameMs,5);assert.equal(f.stats().gpuStatus,'available');f.disable();assert.equal(f.stats().pendingQueries,0);assert.ok(f.deleted.length>=2);}
});
test('지원하지 않는 브라우저도 CPU 측정 유지, GPU는 null',()=>{
 const f=fixture({supported:false});f.enable();f.frame();assert.equal(f.stats().gpuStatus,'unsupported');assert.equal(f.stats().gpuRenderMs,null);assert.equal(f.stats().cpuFrameMs,5);assert.match(f.values.textContent,/미지원/);
});
test('GPU 결과 지연 시 쿼리 최대 4개, disjoint 발생 시 모두 해제',()=>{
 const f=fixture({ready:false});f.enable();for(let i=0;i<20;i++)f.frame();assert.equal(f.calls,4);assert.equal(f.stats().pendingQueries,4);f.disjoint();f.frame();assert.ok(f.deleted.length>=4);assert.equal(f.stats().gpuRenderMs,null);assert.equal(f.stats().gpuStatus,'disjoint');f.disable();assert.equal(f.stats().pendingQueries,0);
});
