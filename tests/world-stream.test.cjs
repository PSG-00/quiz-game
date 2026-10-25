const {test}=require('node:test'),assert=require('node:assert/strict');
const {WorldStream}=require('../server/WorldStream'),{create}=require('../client/worldUpdates');
const player=(i,x=0)=>({i,n:'참가자',x,z:0,a:1,st:1,av:'liv',h:0,e:0,r:null});
const socket=(delta=true)=>({readyState:1,bufferedAmount:0,worldDeltaEnabled:delta,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});

test('좌표 변화가 없어도 단계 버전 변경은 알리고 이후 정지는 방송하지 않음',()=>{
 const stream=new WorldStream(),ws=socket();stream.publish('r',[player('a')],[ws],10000,1);
 stream.publish('r',[player('a')],[ws],10066,2);
 assert.equal(ws.messages.length,2);assert.equal(ws.messages[1].stateVersion,2);assert.deepEqual(ws.messages[1].p,[]);
 stream.publish('r',[player('a')],[ws],10132,2);assert.equal(ws.messages.length,2);
});
test('최초 전체 상태 이후 변경된 좌표만 보내고 정지는 방송하지 않음',()=>{
 const stream=new WorldStream(),ws=socket(),legacy=socket(false),state=create();
 stream.publish('r',[player('a'),player('b')],[ws,legacy],10000);assert.equal(ws.messages[0].type,'WORLD_TICK');state.apply(ws.messages[0]);
 stream.publish('r',[player('a',2),player('b')],[ws,legacy],10066);
 assert.deepEqual(ws.messages[1].p,[{i:'a',x:2}]);assert.equal(ws.messages[1].type,'WORLD_DELTA');
 assert.equal(state.apply(ws.messages[1])[0].n,'참가자');assert.equal(create().apply(legacy.messages[1])[0].x,2);
 stream.publish('r',[player('a',2),player('b')],[ws,legacy],10132);assert.equal(ws.messages.length,2);assert.equal(legacy.messages.length,3);
});
test('새 참가자 전체 정보, 유령·부활·답안 변경과 퇴장도 누락 없이 병합',()=>{
 const stream=new WorldStream(),ws=socket(),state=create();
 stream.publish('r',[player('a')],[ws],10000);state.apply(ws.messages.at(-1));
 stream.publish('r',[{...player('a'),a:0,st:0,h:1,e:1,r:'WRONG'},player('b')],[ws],10066);
 let merged=state.apply(ws.messages.at(-1));assert.equal(merged[0].a,0);assert.equal(merged[0].h,1);assert.equal(merged[1].av,'liv');
 stream.publish('r',[{...player('a'),h:0,e:0,r:'REVIVED'}],[ws],10132);assert.deepEqual(ws.messages.at(-1).removed,['b']);
 merged=state.apply(ws.messages.at(-1));assert.equal(merged.length,1);assert.equal(merged[0].a,1);assert.equal(merged[0].h,0);assert.equal(merged[0].e,0);
});
test('늦게 입장한 연결·다시 입장한 연결·5초 주기는 전체 스냅샷',()=>{
 const stream=new WorldStream(),first=socket(),late=socket();stream.publish('r',[player('a')],[first],10000);
 stream.publish('r',[player('a')],[first,late],10066);assert.equal(late.messages[0].type,'WORLD_TICK');assert.equal(first.messages.length,1);
 first.worldSnapshotRoom=null;stream.publish('r',[player('a')],[first,late],10132);assert.equal(first.messages.at(-1).type,'WORLD_TICK');
 stream.publish('r',[player('a')],[first,late],15000);assert.equal(late.messages.at(-1).type,'WORLD_TICK');
});
test('느린 연결은 오래된 위치를 쌓지 않고 큐가 비면 전체 상태로 복구',()=>{
 const stream=new WorldStream(),ws=socket();stream.publish('r',[player('a')],[ws],10000);ws.bufferedAmount=300000;
 for(let i=1;i<=20;i++)stream.publish('r',[player('a',i)],[ws],10000+i*66);assert.equal(ws.messages.length,1);
 ws.bufferedAmount=0;stream.publish('r',[player('a',21)],[ws],11400);assert.equal(ws.messages.at(-1).type,'WORLD_TICK');assert.equal(ws.messages.at(-1).p[0].x,21);
});
test('초기 상태 없는 델타·다른 방·오래된 패킷은 무시, 로비 복귀 초기화',()=>{
 const state=create();assert.equal(state.apply({type:'WORLD_DELTA',roomId:'r',seq:1,p:[{i:'a',x:1}]}),null);
 state.apply({type:'WORLD_TICK',roomId:'r',seq:2,p:[player('a')]});
 assert.equal(state.apply({type:'WORLD_DELTA',roomId:'other',seq:3,p:[]}),null);assert.equal(state.apply({type:'WORLD_DELTA',roomId:'r',seq:1,p:[]}),null);
 state.reset();assert.equal(state.apply({type:'WORLD_DELTA',roomId:'r',seq:4,p:[]}),null);
 assert.equal(state.apply({type:'WORLD_TICK',p:[player('old-server')]}).length,1);
});
