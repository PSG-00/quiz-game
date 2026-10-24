const {test}=require('node:test'),assert=require('node:assert/strict'),FramePacing=require('../client/framePacing');
test('60·90·120·144Hz에서 모바일 60 제한 없이 화면 주사율대로 렌더링',()=>{
 for(const hz of [60,90,120,144]){
  const pacing=FramePacing.create(144);let rendered=0;
  for(let i=0;i<hz*10;i++)if(pacing.accept(i*1000/hz))rendered++;
  assert.equal(rendered,hz*10,`${hz}Hz`);
 }
});
test('240Hz에서도 144FPS 상한을 지키고 프레임 지연 후 밀린 렌더를 몰아 실행하지 않음',()=>{
 const pacing=FramePacing.create(144);let rendered=0;
 for(let i=0;i<2400;i++)if(pacing.accept(i*1000/240))rendered++;
 assert.ok(rendered>=1439&&rendered<=1441,String(rendered));
 assert.ok(pacing.accept(20000));assert.equal(pacing.accept(20000),false);
 assert.equal(pacing.accept(20001),false);
});
test('백그라운드 복귀 시 즉시 새 프레임을 허용',()=>{
 const pacing=FramePacing.create();assert.ok(pacing.accept(10));assert.equal(pacing.accept(11,true),false);assert.ok(pacing.accept(12));
});
