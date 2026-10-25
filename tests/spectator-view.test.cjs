const {test}=require('node:test'),assert=require('node:assert/strict');
const {candidates,pick,cycle,counts}=require('../client/spectatorView');
const people=()=>[{id:'alive',alive:true,eligible:true,connected:true},{id:'ghost',alive:false,eligible:true,connected:true},{id:'viewer',alive:false,eligible:false,connected:true},{id:'offline',alive:true,eligible:true,connected:false},{id:'alive2',alive:true,eligible:true,connected:true}];
test('관전 대상은 접속한 생존자만, 유령·신규 관전·복귀 대기는 제외',()=>{
 assert.deepEqual(candidates(people()).map(p=>p.id),['alive','alive2']);
 assert.equal(pick(people(),'alive2'),'alive2');assert.equal(pick(people(),'ghost'),'alive');
 assert.equal(cycle(people(),'alive',1),'alive2');assert.equal(cycle(people(),'alive',-1),'alive2');
});
test('대상 탈락·퇴장 시 다른 생존자로 전환, 전원 탈락·단절이면 전체 무대로 복귀',()=>{
 const list=people();list[0].alive=false;assert.equal(pick(list,'alive'),'alive2');
 list.pop();assert.equal(pick(list,'alive2'),null);assert.equal(cycle(list,'alive2',1),null);
});
test('생존·유령·관전은 독립 집계하고 예약 자리도 기존 역할로 계산',()=>{
 assert.deepEqual(counts(people()),{alive:3,ghost:1,spectator:1});
});
