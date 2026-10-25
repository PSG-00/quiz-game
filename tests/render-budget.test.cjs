const {test}=require('node:test'),assert=require('node:assert/strict'),{pixelRatio}=require('../client/renderBudget');
test('PC·모바일·고해상도와 창 크기 변화 모두 같은 160만 픽셀 한도를 적용',()=>{
 for(const [w,h,dpr] of [[390,844,3],[1280,800,1],[1920,1080,2],[3840,2160,2],[844,390,3],[320,568,1]]){
  const ratio=pixelRatio(w,h,dpr);assert.ok(ratio<=2&&ratio<=dpr);assert.ok(w*h*ratio*ratio<=1600000.01);
 }
 assert.equal(pixelRatio(390,844,1),1);assert.ok(pixelRatio(3840,2160,2)<pixelRatio(1280,800,2));
});
