const {test}=require('node:test'),assert=require('node:assert/strict');
const ConnectionPath=require('../client/connectionPath');
const {parseDirectUrl,injectDirectMeta,socketPath}=require('../server/DirectSocket');
const {sanitize}=require('../server/ClientDiag');
const memoryStorage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const DIRECT='wss://ws.quiz.example',PAGE='wss://quiz.example';

test('직접 주소가 없으면 지금처럼 페이지 주소만 사용',()=>{
 const paths=ConnectionPath.create({pageUrl:PAGE});
 assert.equal(paths.enabled,false);assert.deepEqual(paths.next(),{url:PAGE,path:null});
 assert.equal(ConnectionPath.create({directUrl:PAGE,pageUrl:PAGE}).enabled,false);
});

test('직접 주소 우선, 실패 직후 한 번은 Cloudflare, 둘 다 실패하면 번갈아 시도',()=>{
 const paths=ConnectionPath.create({directUrl:DIRECT,pageUrl:PAGE});
 assert.equal(paths.next().path,'direct');
 paths.failed('direct');assert.equal(paths.next().path,'cf');
 paths.failed('cf');assert.equal(paths.next().path,'direct');
 paths.failed('direct');assert.equal(paths.next().path,'cf');
});

test('직접 실패 뒤 Cloudflare가 붙으면 확인 요청, 확인도 실패하면 10분 동안 Cloudflare',()=>{
 let now=0;const storage=memoryStorage();
 const paths=ConnectionPath.create({directUrl:DIRECT,pageUrl:PAGE,storage,now:()=>now});
 paths.failed('direct');
 assert.equal(paths.connected('cf'),true);
 assert.equal(paths.next().path,'direct','확인 결과 전에는 다음 재접속에서 직접 주소를 다시 시도');
 paths.probed(false);assert.equal(paths.blocked,true);assert.equal(paths.next().path,'cf');
 assert.equal(ConnectionPath.create({directUrl:DIRECT,pageUrl:PAGE,storage,now:()=>now}).next().path,'cf','새로고침해도 유지');
 now=600001;assert.equal(paths.next().path,'direct');
});

test('확인이 성공하거나 Cloudflare만 붙은 경우에는 막지 않음',()=>{
 const paths=ConnectionPath.create({directUrl:DIRECT,pageUrl:PAGE});
 assert.equal(paths.connected('direct'),false);assert.equal(paths.connected('cf'),false);
 paths.failed('direct');assert.equal(paths.connected('cf'),true);paths.probed(true);
 assert.equal(paths.blocked,false);assert.equal(paths.next().path,'direct');
});

test('막혀 있을 때 Cloudflare마저 실패하면 직접 주소를 다시 시도(Cloudflare 장애 대비)',()=>{
 const storage=memoryStorage();const paths=ConnectionPath.create({directUrl:DIRECT,pageUrl:PAGE,storage});
 paths.failed('direct');paths.connected('cf');paths.probed(false);
 paths.failed('cf');assert.equal(paths.blocked,false);assert.equal(paths.next().path,'direct');
 assert.equal(storage.getItem(ConnectionPath.STORAGE_KEY),null);
});

test('서버: 직접 주소는 ws/wss만 받고, 페이지에 한 번만 넣고, Host로 경로를 구분',()=>{
 assert.equal(parseDirectUrl(''),null);assert.equal(parseDirectUrl('https://x.example'),null);assert.equal(parseDirectUrl('not a url'),null);
 const url=parseDirectUrl('wss://WS.Quiz.Example/');
 const html=injectDirectMeta('<head>\n  <meta charset="UTF-8" />\n</head>',url);
 assert.match(html,/<meta name="ox-direct-socket" content="wss:\/\/ws\.quiz\.example" \/>/);
 assert.equal(html.match(/ox-direct-socket/g).length,1);
 assert.equal(injectDirectMeta('<meta charset="UTF-8" />',null),'<meta charset="UTF-8" />');
 assert.equal(socketPath({headers:{host:'ws.quiz.example'}},url),'direct');
 assert.equal(socketPath({headers:{host:'quiz.example'}},url),'cf');
 assert.equal(socketPath({headers:{host:'quiz.example'}},null),undefined);
});

test('진단 로그에 연결 경로가 남음',()=>{
 assert.deepEqual(sanitize([{reason:'direct-failed',path:'direct',code:1006}]),[{reason:'direct-failed',code:1006,path:'direct'}]);
 assert.equal(sanitize([{reason:'stall',path:'x'.repeat(50)}])[0].path.length,8);
});
