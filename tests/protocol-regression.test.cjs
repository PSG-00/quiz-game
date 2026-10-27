const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

test('실제 WebSocket: 정원 경합·중복 탭 교체·실패 입장 보존·비정상 메시지·방장 승계 회귀', {timeout:45000},async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['scripts/audit-game-concurrency.cjs'],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,AUDIT_PORT:'3136',AUDIT_LABEL:'regression'},timeout:35000
 });
 for(const id of ['WAITING-01','SESSION-01','RESERVE-01','EXPIRE-01','CAPACITY-01','JOIN-01','SESSION-02','ANSWER-01','ANSWER-02','DEADLINE-01','HOST-01','INPUT-01','CHAT-01','SPECTATOR-01','HOST-02','JUDGE-01','STALE-01','MOVE-01','SERVER-CAP-01','CLEANUP-01']){
  assert.match(stdout,new RegExp(id+' PASS'));
 }
});
