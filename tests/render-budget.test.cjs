const {test}=require('node:test'),assert=require('node:assert/strict'),{pixelRatio}=require('../client/renderBudget');
test('가벼운 선명도 조정은 PC·모바일 모두 기존 대비 픽셀 증가를 최대 8%로 제한',()=>{
 for(const [w,h,dpr] of [[390,844,3],[1280,800,1],[1920,1080,2],[3840,2160,2],[844,390,3],[320,568,1]]){
  const before=Math.min(2,dpr,Math.sqrt(1600000/(w*h))),ratio=pixelRatio(w,h,dpr);
  assert.ok(ratio>before);assert.ok(ratio<=before*Math.sqrt(1.08)+1e-10);assert.ok(w*h*ratio*ratio<=1728000.01);
 }
 assert.ok(pixelRatio(390,844,1)>1);assert.ok(pixelRatio(3840,2160,2)<pixelRatio(1280,800,2));
});
