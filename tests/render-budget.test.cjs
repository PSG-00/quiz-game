const {test}=require('node:test'),assert=require('node:assert/strict'),{pixelRatio}=require('../client/renderBudget');
test('가벼운 선명도 조정은 PC·모바일 모두 기존 대비 픽셀 증가를 최대 8%로 제한',()=>{
 for(const [w,h,dpr] of [[390,844,3],[1280,800,1],[1920,1080,2],[3840,2160,2],[844,390,3],[320,568,1]]){
  const before=Math.min(2,dpr,Math.sqrt(1600000/(w*h))),ratio=pixelRatio(w,h,dpr);
  assert.ok(ratio>before);assert.ok(ratio<=before*Math.sqrt(1.08)+1e-10);assert.ok(w*h*ratio*ratio<=1728000.01);
 }
 assert.ok(pixelRatio(390,844,1)>1);assert.ok(pixelRatio(3840,2160,2)<pixelRatio(1280,800,2));
});
test('통합 모델 50% 옵션은 픽셀만 1.5배 늘리고 FXAA 선택과 독립적임',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync('client/renderBudget.js','utf8');
 function ratio(search,w,h,dpr){const context={window:{},location:{search},URLSearchParams};vm.runInNewContext(source,context);return context.window.RenderBudget.pixelRatio(w,h,dpr);}
 for(const [w,h,dpr] of [[390,844,3],[1280,800,1],[2560,1440,2]]){
  const before=ratio('',w,h,dpr),after=ratio('?model=atlas&quality=ultra',w,h,dpr);
  assert.ok(Math.abs(after*after/(before*before)-1.5)<1e-8);assert.ok(w*h*after*after<=2592000.01);
  assert.equal(ratio('?quality=ultra',w,h,dpr),before);assert.equal(ratio('?model=atlas&quality=ultra&aa=fxaa',w,h,dpr),after);
 }
});
test('경량 모델 고해상도 옵션만 픽셀 예산을 20% 늘리며 다른 주소는 기존 예산 유지',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync('client/renderBudget.js','utf8');
 function budget(search){const context={window:{},location:{search},URLSearchParams};vm.runInNewContext(source,context);return context.window.RenderBudget;}
 for(const [w,h,dpr] of [[390,844,3],[1280,800,1],[2560,1440,2]]){
  const base=budget('').pixelRatio(w,h,dpr),compact=budget('?model=compact').pixelRatio(w,h,dpr),unrelated=budget('?quality=crisp').pixelRatio(w,h,dpr),crisp=budget('?model=compact&quality=crisp').pixelRatio(w,h,dpr);
  assert.equal(compact,base);assert.equal(unrelated,base);assert.ok(Math.abs(crisp*crisp/(base*base)-1.2)<1e-8);assert.ok(w*h*crisp*crisp<=2073600.01);
 }
});
