const assert=require('node:assert/strict'),{fork}=require('node:child_process'),W=require('ws');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const port=3148,base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));let child,browser,socket;
(async()=>{try{
 const password=process.env.QUIZ_TEST_PASSWORD;if(!password)throw Error('QUIZ_TEST_PASSWORD is required');
 child=fork('server/index.js',[],{env:{...process.env,PORT:String(port),NODE_ENV:'production',OX_DISABLE_PERSISTENCE:'1',OX_PUBLIC_TEST_BOTS:'0',OX_PLANA_TEST:'0'},silent:true});child.stdout.resume();child.stderr.resume();
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(100);}
 const messages=[];socket=new W(`ws://127.0.0.1:${port}`);socket.on('message',raw=>messages.push(JSON.parse(raw)));const wait=async fn=>{for(let i=0;i<300;i++){const v=fn();if(v)return v;await sleep(20);}throw Error('Message timeout');};const send=m=>socket.send(JSON.stringify(m));
 assert.equal((await wait(()=>messages.find(m=>m.type==='WELCOME'))).features.quizLoadPassword,true);send({type:'AUTH_LIBRARY',token:require('node:crypto').randomBytes(32).toString('hex')});await wait(()=>messages.find(m=>m.type==='QUIZ_LIST'));
 send({type:'SAVE_QUIZ',requestId:'save',title:'잠금 검증',targetWinners:1,restSeconds:0,questions:[{type:'OX',question:'비공개 정답',answer:'X',timeLimit:15}]});const saved=await wait(()=>messages.find(m=>m.type==='QUIZ_SAVED'));
 for(const request of [{type:'LOAD_QUIZ',quizId:saved.quiz.id},{type:'LOAD_QUIZ_BY_CODE',code:saved.quiz.code},{type:'LIST_PUBLIC_QUIZZES'}]){const requestId='locked-'+request.type;send({...request,requestId});const error=await wait(()=>messages.find(m=>m.requestId===requestId));assert.equal(error.code,'QUIZ_LOAD_LOCKED');assert.equal(error.quiz,undefined);}
 assert.equal(await(await fetch(base+'/api/recovered-draft')).json(),null);
 send({type:'UNLOCK_QUIZ_LIBRARY',requestId:'wrong',password:'wrong'});assert.equal((await wait(()=>messages.find(m=>m.requestId==='wrong'))).type,'ERROR');
 send({type:'UNLOCK_QUIZ_LIBRARY',requestId:'unlock',password});assert.equal((await wait(()=>messages.find(m=>m.requestId==='unlock'))).type,'QUIZ_LIBRARY_UNLOCKED');send({type:'LOAD_QUIZ_BY_CODE',requestId:'load',code:saved.quiz.code});assert.equal((await wait(()=>messages.find(m=>m.requestId==='load'))).quiz.questions[0].answer,'X');
 browser=await chromium.launch({headless:true,channel:'chrome'});const p=await browser.newPage({serviceWorkers:'block'});await p.goto(base);await p.waitForFunction(()=>libraryReady);await p.evaluate(()=>openMyQuizzes());assert.equal(await p.locator('#quiz-password-dialog').isVisible(),true);assert.equal(await p.locator('#my-quizzes-dialog').isVisible(),false);
 await p.locator('#quiz-admin-password').fill('wrong');await p.locator('#quiz-password-submit').click();await p.waitForFunction(()=>document.getElementById('quiz-password-error').textContent.includes('일치하지'));assert.equal(await p.locator('#my-quizzes-dialog').isVisible(),false);
 await p.locator('#quiz-admin-password').fill(password);await p.locator('#quiz-password-submit').click();await p.waitForFunction(()=>document.getElementById('my-quizzes-dialog').open);assert.equal(await p.locator('#quiz-admin-password').inputValue(),'');assert.equal(await p.evaluate(()=>Object.values(localStorage).some(v=>v.includes('password'))),false);
 console.log('PASS: production blocks raw loads/list/recovered draft; wrong password rejected; correct password opens library.');
 }finally{socket?.terminate();await browser?.close();child?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
