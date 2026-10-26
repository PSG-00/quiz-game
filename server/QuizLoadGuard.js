const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const SESSION_MS=15*60*1000;
class QuizLoadGuard{
 constructor({enabled=true,record=null}={}){this.enabled=enabled;this.record=record;this.attempts=new Map();this.pending=0;}
 require(until,now=Date.now()){
  if(this.enabled&&!(until>now)){const error=new Error('관리자 비밀번호를 입력한 뒤 퀴즈를 불러와 주세요.');error.code='QUIZ_LOAD_LOCKED';throw error;}
 }
 async unlock(address,password,now=Date.now()){
  if(!this.enabled)return now+SESSION_MS;
  for(const [key,entry] of this.attempts)if(entry.until<=now)this.attempts.delete(key);
  const entry=this.attempts.get(address)||{count:0,until:now+60000};
  if(entry.count>=5||this.pending>=4||this.attempts.size>=1000&&!this.attempts.has(address))throw new Error('비밀번호 확인이 너무 잦아요. 1분 후 다시 시도해 주세요.');
  entry.count++;this.attempts.set(address,entry);
  const {salt,hash}=this.record||{};
  if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hash||''))throw new Error('관리자 비밀번호가 아직 설정되지 않았어요.');
  if(typeof password!=='string'||password.length<1||Buffer.byteLength(password)>256)throw new Error('관리자 비밀번호가 일치하지 않아요.');
  this.pending++;
  try{const derived=await scrypt(password,Buffer.from(salt,'hex'),64);if(!crypto.timingSafeEqual(derived,Buffer.from(hash,'hex')))throw new Error('관리자 비밀번호가 일치하지 않아요.');return Date.now()+SESSION_MS;}
  finally{this.pending--;}
 }
}
module.exports={QuizLoadGuard,SESSION_MS};
