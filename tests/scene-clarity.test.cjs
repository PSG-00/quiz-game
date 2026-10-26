const {test}=require('node:test'),assert=require('node:assert/strict');
const clarity=require('../client/sceneClarity');
test('선명도 실험은 알 수 없는 값에서 기본 경로로 돌아가며 균형 모드만 내부 픽셀 수를 줄임',()=>{
 for(const value of [null,undefined,'','fsr','webgpu',{},'OFF']){assert.equal(clarity.mode(value),'off');assert.equal(clarity.scale(value),1);}
 assert.equal(clarity.scale('off'),1);assert.equal(clarity.scale('sharpen'),1);
 assert.equal(clarity.mode('fxaa'),'fxaa');assert.equal(clarity.scale('fxaa'),1);
 assert.equal(clarity.scale('upscale'),.85);assert.ok(clarity.scale('upscale')**2<.73);
});
