const {test}=require('node:test');const assert=require('node:assert/strict');const motion=require('../client/avatarMotion');
test('이동 방향으로 부드럽게 회전하고 멈추면 마지막 방향 유지',()=>{
 const s=motion.create();motion.advance(s,1/60,1,0,7/60);assert.ok(s.heading>0&&s.heading<Math.PI/2);
 for(let i=0;i<60;i++)motion.advance(s,1/60,1,0,7/60);assert.ok(Math.abs(s.heading-Math.PI/2)<.0001);
 for(let i=0;i<90;i++)motion.advance(s,1/60,0,0,0);assert.ok(Math.abs(s.heading-Math.PI/2)<.0001);assert.ok(s.blend<.00001);
});
test('180도 경계를 넘어도 최단 방향으로 회전하고 프레임 속도와 무관',()=>{
 const s=motion.create();s.heading=Math.PI-.04;s.targetHeading=-Math.PI+.04;motion.advance(s,1/60,0,0,0);assert.ok(motion.wrap(s.heading-(Math.PI-.04))>0);
 const run=fps=>{const s=motion.create();for(let i=0;i<fps;i++)motion.advance(s,1/fps,-1,-1,7/fps);return s;};const a=run(30),b=run(60);
 assert.ok(Math.abs(a.heading-b.heading)<1e-8);assert.ok(Math.abs(a.blend-b.blend)<1e-8);assert.ok(Math.abs(a.phase-b.phase)<1e-8);
});
test('역할 이동·순간 좌표 보정은 보행이나 방향 전환으로 취급하지 않음',()=>{
 const s=motion.create();motion.advance(s,.016,10,-10,14,true);assert.equal(s.heading,0);assert.equal(s.blend,0);assert.equal(s.phase,0);
});
