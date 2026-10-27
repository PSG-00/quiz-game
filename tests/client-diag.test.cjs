const {test}=require('node:test'),assert=require('node:assert/strict');
const ClientDiag=require('../client/clientDiag'),{sanitize,MAX_EVENTS}=require('../server/ClientDiag');
const memoryStorage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};

test('진단 대기열: 상황 정보를 붙이고 오래된 것부터 버리며, 같은 이유는 간격 제한',()=>{
 let now=1000;const diag=ClientDiag.create({now:()=>now,context:()=>({gapMs:6100,state:'BREAK'}),limit:3});
 assert.equal(diag.record('stall'),true);now+=100;
 assert.equal(diag.record('main-thread-blocked',{blockedMs:3000},{throttleMs:30000}),true);
 assert.equal(diag.record('main-thread-blocked',{blockedMs:4000},{throttleMs:30000}),false);
 for(const reason of ['socket-closed','resumed'])diag.record(reason);
 assert.equal(diag.size,3);now+=400;
 const batch=diag.take(2);
 assert.deepEqual(batch.map(e=>e.reason),['main-thread-blocked','socket-closed']);
 assert.equal(batch[0].ago,400);assert.equal(batch[0].state,'BREAK');assert.equal(batch[0].blockedMs,3000);assert.equal(batch[0].t,undefined);
 assert.equal(diag.size,1);
});

test('새로고침해도 보내지 못한 진단과 직전 방 정보가 남음',()=>{
 const storage=memoryStorage();let now=5000;
 const first=ClientDiag.create({storage,now:()=>now});first.record('stall');first.persist({leftAt:now,roomId:'room_a',state:'QUESTION'});
 now=9000;const second=ClientDiag.create({storage,now:()=>now});
 assert.deepEqual(second.previous,{leftAt:5000,roomId:'room_a',state:'QUESTION'});
 assert.deepEqual(second.take().map(e=>[e.reason,e.ago]),[['stall',4000]]);
 assert.equal(ClientDiag.create({storage}).previous,null);
});

test('서버는 알려진 필드만 크기를 제한해 남기고 잘못된 항목은 버림',()=>{
 const events=[
  {reason:'stall',gapMs:6012.4,rttMs:48,fps:24,hidden:false,state:'BREAK',detail:'x'.repeat(500),evil:'<script>',code:'1006'},
  {reason:'Bad Reason!'},null,'text',{reason:'resumed',outageMs:1e12,ago:-5}
 ];
 const clean=sanitize(events,'android/kakaotalk'+'z'.repeat(80));
 assert.equal(clean.length,2);
 assert.deepEqual(Object.keys(clean[0]).sort(),['detail','device','fps','gapMs','hidden','reason','rttMs','state']);
 assert.equal(clean[0].gapMs,6012);assert.equal(clean[0].detail.length,200);assert.equal(clean[0].device.length,40);
 assert.equal(clean[1].outageMs,1e7);assert.equal(clean[1].ago,-5);
 assert.equal(sanitize(Array.from({length:30},()=>({reason:'stall'}))).length,MAX_EVENTS);
 assert.deepEqual(sanitize('nope'),[]);
});
