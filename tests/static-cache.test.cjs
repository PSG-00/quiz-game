const {test}=require('node:test'),assert=require('node:assert/strict'),{cacheControl}=require('../server/staticCache');
test('HTML과 서비스 워커는 저장 금지, 코드에는 매번 유효성 검사',()=>{
 assert.equal(cacheControl('/client/index.html'),'no-store');assert.equal(cacheControl('/client/sw.js'),'no-store');assert.equal(cacheControl('/client/app.js'),'no-cache');assert.equal(cacheControl('/client/style.css'),'no-cache');
});
test('모델·LOD·이미지만 1시간, 외부 라이브러리는 하루 캐시',()=>{
 for(const p of ['/client/assets/models/a.glb','C:\\client\\assets\\models\\a.glb.lod.bin','/client/assets/avatars/a.png'])assert.equal(cacheControl(p),'public, max-age=3600, must-revalidate');
 assert.equal(cacheControl('/client/vendor/GLTFLoader.js'),'public, max-age=86400, must-revalidate');
});
