const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WorldStream,MAX_UNACKED_TICKS}=require('../server/WorldStream'),{create}=require('../client/worldUpdates');
const {versionedHtml}=require('../server/staticCache');
const player=(i,k,x=0,z=0)=>({i,k,n:'참가자',x,z,a:1,st:1,av:'liv',h:0,e:0,r:null});
const socket=(flags={})=>({readyState:1,bufferedAmount:0,worldDeltaEnabled:true,...flags,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});

test('압축 델타: 위치만 바뀐 참가자는 정수 묶음, 다른 변화는 기존 패치로 보내고 그대로 복원',()=>{
 const stream=new WorldStream(),compact=socket({worldCompact:true}),legacy=socket(),state=create(),old=create();
 stream.publish('r',[player('a',1),player('b',2)],[compact,legacy],10000);state.apply(compact.messages[0]);old.apply(legacy.messages[0]);
 stream.publish('r',[player('a',1,2.5,-1.25),{...player('b',2),a:0},player('c',3,1,1)],[compact,legacy],10100);
 const delta=compact.messages[1];assert.deepEqual(delta.m,[1,250,-125]);assert.deepEqual(delta.p.map(p=>p.i),['b','c']);
 for(const merged of [state.apply(delta),old.apply(legacy.messages[1])]){
  const byId=Object.fromEntries(merged.map(p=>[p.i,p]));
  assert.equal(byId.a.x,2.5);assert.equal(byId.a.z,-1.25);assert.equal(byId.a.n,'참가자');assert.equal(byId.b.a,0);assert.equal(byId.c.x,1);
 }
 stream.publish('r',[player('a',1,2.5,-1.25),{...player('b',2),a:0},player('c',3,-3,1)],[compact],10200);
 assert.deepEqual(compact.messages[2].m,[3,-300,100]);assert.equal(state.apply(compact.messages[2]).find(p=>p.i==='c').x,-3);
});

test('압축 델타의 모르는 번호는 잘못된 캐릭터를 만들지 않고 전체 상태를 요청',()=>{
 const state=create();state.apply({type:'WORLD_TICK',roomId:'r',seq:1,p:[player('a',1)]});
 assert.equal(state.apply({type:'WORLD_DELTA',roomId:'r',seq:2,p:[],m:[9,100,100]}),null);assert.equal(state.needsSnapshot(),true);
});

test('응답 기반 흐름 제어: 확인이 밀린 연결은 월드 전송을 멈추고 따라잡으면 전체 상태로 재개',()=>{
 const stream=new WorldStream(),slow=socket({worldFlow:true,worldCompact:true}),fast=socket({worldFlow:true,worldCompact:true});
 stream.publish('r',[player('a',1)],[slow,fast],10000);
 for(let i=1;i<=MAX_UNACKED_TICKS+10;i++){stream.publish('r',[player('a',1,i/10)],[slow,fast],10000+i*100);fast.worldAckSeq=fast.worldSentSeq;}
 assert.equal(fast.messages.length,MAX_UNACKED_TICKS+11);
 assert.ok(slow.messages.length<=MAX_UNACKED_TICKS+2);assert.ok(slow.worldSkipped>0);assert.equal(slow.worldPaused,true);
 const before=slow.messages.length;stream.publish('r',[player('a',1,9)],[slow],14000);assert.equal(slow.messages.length,before);
 slow.worldAckSeq=slow.worldSentSeq;stream.publish('r',[player('a',1,9.5)],[slow],14100);
 assert.equal(slow.messages.at(-1).type,'WORLD_TICK');assert.equal(slow.messages.at(-1).p[0].x,9.5);assert.equal(slow.worldPaused,false);
 stream.publish('r',[player('a',1,9.6)],[slow],14200);assert.equal(slow.messages.at(-1).type,'WORLD_DELTA');
});

test('흐름 제어를 요청하지 않은 이전 클라이언트는 확인 없이도 계속 받음',()=>{
 const stream=new WorldStream(),legacy=socket();
 for(let i=0;i<=MAX_UNACKED_TICKS+5;i++)stream.publish('r',[player('a',1,i)],[legacy],10000+i*100);
 assert.equal(legacy.messages.length,MAX_UNACKED_TICKS+6);
});

test('자산 주소에 내용 해시를 붙여 Cloudflare 브라우저 캐시 수명과 무관하게 새 파일을 받음',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-assets-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'app.js'),'one');fs.writeFileSync(path.join(dir,'style.css'),'body{}');
 const html='<link href="./style.css?v=42"><script src="./app.js?v=79"></script><script src="./missing.js?v=1"></script><script src="https://cdn.example/x.js"></script>';
 const first=versionedHtml(html,dir);
 assert.match(first,/\.\/app\.js\?v=[0-9a-f]{10}"/);assert.match(first,/\.\/style\.css\?v=[0-9a-f]{10}"/);
 assert.match(first,/\.\/missing\.js\?v=1"/);assert.match(first,/https:\/\/cdn\.example\/x\.js/);
 fs.writeFileSync(path.join(dir,'app.js'),'two');
 const second=versionedHtml(html,dir);assert.notEqual(first.match(/app\.js\?v=(\w+)/)[1],second.match(/app\.js\?v=(\w+)/)[1]);
 assert.equal(first.match(/style\.css\?v=(\w+)/)[1],second.match(/style\.css\?v=(\w+)/)[1]);
});
