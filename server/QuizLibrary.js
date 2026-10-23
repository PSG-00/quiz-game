const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {parse}=require('../client/quizFiles');
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN=/^[A-HJ-NP-Z2-9]{6}$/;

function userHash(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('내 퀴즈 보관함을 연결하지 못했어요. 새로고침해 주세요.');
  return crypto.createHash('sha256').update(token).digest('hex');
}

class QuizLibrary {
  constructor({file=null,legacyRooms=[]}={}){
    this.file=file;this.quizzes=new Map();this.deletedQuizIds=new Set();this.usedCodes=new Set();
    this.withStorage(()=>{
    // Keep old room definitions, including deleted rooms, as claimable quizzes.
    let migrated=false;
    for(const room of legacyRooms){
      const id='quiz_legacy_'+room.id;
      if(!room.ownerTokenHash||this.quizzes.has(id)||this.deletedQuizIds.has(id))continue;
      const code=this.generateCode();this.usedCodes.add(code);
      this.quizzes.set(id,{id,code,title:room.title,targetWinners:room.targetWinners,questions:room.questions,legacyRoomId:room.id,legacyOwnerHash:room.ownerTokenHash,ownerHash:null,createdAt:room.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});migrated=true;
    }
    if(migrated)this.persist();
    });
  }
  readSnapshot(){
    const file=this.file;
    this.quizzes=new Map();this.deletedQuizIds=new Set();this.usedCodes=new Set();
    if(file&&fs.existsSync(file)){
      let data;
      try{data=JSON.parse(fs.readFileSync(file,'utf8'));}
      catch(error){if(fs.existsSync(file+'.bak'))data=JSON.parse(fs.readFileSync(file+'.bak','utf8'));else throw error;}
      if(data.version!==1||!Array.isArray(data.quizzes))throw new Error('저장된 퀴즈 보관함 형식을 확인해 주세요.');
      for(const quiz of data.quizzes)this.quizzes.set(quiz.id,quiz);
      this.deletedQuizIds=new Set(data.deletedQuizIds||[]);
      this.usedCodes=new Set((data.usedCodes||[]).filter(code=>typeof code==='string'&&CODE_PATTERN.test(code)));
    }
    let migrated=false;
    const seen=new Set();
    for(const quiz of this.quizzes.values())if(typeof quiz.code==='string'&&CODE_PATTERN.test(quiz.code))this.usedCodes.add(quiz.code);
    for(const quiz of this.quizzes.values()){
      if(typeof quiz.code!=='string'||!CODE_PATTERN.test(quiz.code)||seen.has(quiz.code)){
        quiz.code=this.generateCode();this.usedCodes.add(quiz.code);migrated=true;
      }
      seen.add(quiz.code);
    }
    if(migrated)this.persist();
  }
  withStorage(action){
    if(!this.file||this.inStorage)return action();
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const lockFile=this.file+'.lock',deadline=Date.now()+2000;
    let lock;
    while(lock===undefined){
      try{lock=fs.openSync(lockFile,'wx');}
      catch(error){
        if(!['EEXIST','EPERM','EBUSY'].includes(error.code))throw error;
        try{
          const pid=Number(fs.readFileSync(lockFile,'utf8'));
          if(Number.isInteger(pid)&&pid>0){
            try{process.kill(pid,0);}catch(dead){if(dead.code==='ESRCH'){fs.unlinkSync(lockFile);continue;}}
          }else if(Date.now()-fs.statSync(lockFile).mtimeMs>30000){fs.unlinkSync(lockFile);continue;}
        }catch(stale){if(stale.code==='ENOENT')continue;}
        if(Date.now()>=deadline)throw new Error('다른 서버가 퀴즈를 저장 중입니다. 잠시 후 다시 시도해 주세요.');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
      }
    }
    this.inStorage=true;
    try{fs.writeFileSync(lock,String(process.pid));this.readSnapshot();return action();}
    finally{
      this.inStorage=false;fs.closeSync(lock);
      for(let attempt=0;;attempt++){
        try{fs.unlinkSync(lockFile);break;}
        catch(error){if(error.code==='ENOENT')break;if(!['EPERM','EBUSY'].includes(error.code)||attempt>=100)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
      }
    }
  }
  generateCode(){
    for(let attempt=0;attempt<1000;attempt++){
      const code=Array.from({length:6},()=>CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
      if(!this.usedCodes.has(code))return code;
    }
    throw new Error('불러오기 코드를 발급하지 못했어요. 다시 저장해 주세요.');
  }
  persist(){
    if(!this.file)return;
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify({version:1,quizzes:[...this.quizzes.values()],deletedQuizIds:[...this.deletedQuizIds],usedCodes:[...this.usedCodes]},null,2),'utf8');
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(tmp,this.file);
  }
  claimLegacy(ownerHash,tokens={}){
    return this.withStorage(()=>this.claimLegacyInside(ownerHash,tokens));
  }
  claimLegacyInside(ownerHash,tokens={}){
    if(!tokens||typeof tokens!=='object')return;
    const claimed=[];
    for(const quiz of this.quizzes.values()){
      const token=tokens[quiz.legacyRoomId];
      if(quiz.ownerHash||!quiz.legacyOwnerHash||typeof token!=='string')continue;
      if(crypto.createHash('sha256').update(token).digest('hex')===quiz.legacyOwnerHash){quiz.ownerHash=ownerHash;claimed.push(quiz);}
    }
    if(claimed.length)try{this.persist();}catch(error){for(const quiz of claimed)quiz.ownerHash=null;throw error;}
  }
  getOwners(quiz){
    if(!quiz)return [];
    if(Array.isArray(quiz.owners))return [...new Set(quiz.owners.filter(Boolean))];
    return typeof quiz.ownerHash==='string'&&quiz.ownerHash?[quiz.ownerHash]:[];
  }
  hasOwner(quiz,ownerHash){
    return Boolean(ownerHash&&this.getOwners(quiz).includes(ownerHash));
  }
  applyOwners(record,owners){
    const unique=[...new Set(owners.filter(Boolean))];
    record.ownerHash=unique[0]||null;
    if(unique.length>1)record.owners=unique;
    else delete record.owners;
    return record;
  }
  normalizeQuiz(input,allowLegacyLengths=false){
    return parse(JSON.stringify({version:1,title:(input.title??'').trim(),targetWinners:input.targetWinners??2,restSeconds:input.restSeconds===undefined?5:input.restSeconds,questions:input.questions}),{allowLegacyLengths});
  }
  contentHash(input){
    try{return crypto.createHash('sha256').update(JSON.stringify(this.normalizeQuiz(input,true))).digest('hex');}
    catch{return null;}
  }
  findByContentHash(hash,excludeId=null){
    if(!hash)return null;
    for(const q of this.quizzes.values())if(q.id!==excludeId&&this.contentHash(q)===hash)return q;
    return null;
  }
  list(ownerHash){return this.withStorage(()=>[...this.quizzes.values()].filter(q=>this.hasOwner(q,ownerHash)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(q=>({id:q.id,code:q.code,title:q.title,questionCount:q.questions.length,targetWinners:q.targetWinners,updatedAt:q.updatedAt})));}
  listPublic(){
    return this.withStorage(()=>{
      const seen=new Set();
      const list=[];
      for(const q of [...this.quizzes.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
        const key=`${q.title}::${q.questions?.length||0}`;
        if(seen.has(key))continue;
        seen.add(key);
        list.push({
          id:q.id,
          code:q.code,
          title:q.title||'제목 없는 퀴즈',
          questionCount:q.questions?.length||0,
          targetWinners:q.targetWinners??2,
          restSeconds:q.restSeconds??5,
          updatedAt:q.updatedAt
        });
      }
      return list;
    });
  }
  get(ownerHash,id){return this.withStorage(()=>{const q=this.quizzes.get(id);if(!q||!this.hasOwner(q,ownerHash))throw new Error('내가 저장한 퀴즈만 불러올 수 있어요.');return {id:q.id,code:q.code,title:q.title,targetWinners:q.targetWinners,restSeconds:q.restSeconds??5,questions:JSON.parse(JSON.stringify(q.questions))};});}
  getByCode(value,ownerHash){
    return this.withStorage(()=>{
      const code=typeof value==='string'?value.trim().toUpperCase():'';
      if(!CODE_PATTERN.test(code))throw new Error('영문·숫자 6자리 코드를 확인해 주세요.');
      const quiz=[...this.quizzes.values()].find(q=>q.code===code);
      if(!quiz)throw new Error('저장된 퀴즈를 찾지 못했어요. 코드를 확인해 주세요.');
      const imported=!this.hasOwner(quiz,ownerHash);
      return {id:imported?null:quiz.id,code:quiz.code,title:quiz.title,targetWinners:quiz.targetWinners,restSeconds:quiz.restSeconds??5,questions:JSON.parse(JSON.stringify(quiz.questions)),imported};
    });
  }
  delete(ownerHash,id){
    return this.withStorage(()=>this.deleteInside(ownerHash,id));
  }
  deleteInside(ownerHash,id){
    this.get(ownerHash,id);
    const previous=this.quizzes.get(id);
    const snapshot=JSON.parse(JSON.stringify(previous));
    const remaining=this.getOwners(previous).filter(o=>o!==ownerHash);
    if(remaining.length>0){
      this.applyOwners(previous,remaining);
      try{this.persist();}catch(error){this.quizzes.set(id,snapshot);throw error;}
    }else{
      this.quizzes.delete(id);this.deletedQuizIds.add(id);
      try{this.persist();}catch(error){this.quizzes.set(id,snapshot);this.deletedQuizIds.delete(id);throw error;}
    }
  }
  saveByTitle(ownerHash,options){
    return this.withStorage(()=>this.saveByTitleInside(ownerHash,options));
  }
  saveByTitleInside(ownerHash,options){
    let quizId=options.quizId;
    if(quizId){const target=this.quizzes.get(quizId);if(!this.hasOwner(target,ownerHash))quizId=null;}
    const data=this.normalizeQuiz(options);
    const targetHash=this.contentHash(data);
    const candidates=[...this.quizzes.values()].filter(q=>this.hasOwner(q,ownerHash)&&q.title.trim()===data.title).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const previous=(quizId&&candidates.find(q=>q.id===quizId))||candidates[0];
    if(!previous){
      const existingPool=this.findByContentHash(targetHash);
      if(existingPool){
        const beforeSnapshot=JSON.parse(JSON.stringify(existingPool));
        this.applyOwners(existingPool,[...this.getOwners(existingPool),ownerHash]);
        try{this.persist();}catch(error){this.quizzes.set(existingPool.id,beforeSnapshot);throw error;}
        return {quiz:this.get(ownerHash,existingPool.id),shared:true,created:false};
      }
      return {quiz:this.save(ownerHash,{...data,quizId:null}),created:true};
    }
    const before=this.normalizeQuiz(previous,true);
    if(JSON.stringify(before)===JSON.stringify(data))return {quiz:this.get(ownerHash,previous.id),unchanged:true};
    const version=crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex');
    if(options.confirmOverwrite!==true||options.expectedVersion!==version)return {confirmation:true,title:previous.title,version};
    return {quiz:this.save(ownerHash,{...data,quizId:previous.id})};
  }
  save(ownerHash,options){
    return this.withStorage(()=>this.saveInside(ownerHash,options));
  }
  saveInside(ownerHash,options){
    const previous=options.quizId?this.quizzes.get(options.quizId):null;
    if(options.quizId&&(!previous||!this.hasOwner(previous,ownerHash)))throw new Error('이 퀴즈를 수정할 권한이 없어요.');
    const data=parse(JSON.stringify({version:1,title:options.title??'',targetWinners:options.targetWinners??2,restSeconds:options.restSeconds===undefined?5:options.restSeconds,questions:options.questions}));
    const targetHash=this.contentHash(data);
    if(previous){
      const prevSnapshot=JSON.parse(JSON.stringify(previous));
      const prevOwners=this.getOwners(previous);
      const otherOwners=prevOwners.filter(o=>o!==ownerHash);
      const existingPool=this.findByContentHash(targetHash,previous.id);
      if(existingPool){
        const poolSnapshot=JSON.parse(JSON.stringify(existingPool));
        if(otherOwners.length>0)this.applyOwners(previous,otherOwners);
        else{this.quizzes.delete(previous.id);this.deletedQuizIds.add(previous.id);}
        this.applyOwners(existingPool,[...this.getOwners(existingPool),ownerHash]);
        try{this.persist();}catch(error){this.quizzes.set(previous.id,prevSnapshot);this.deletedQuizIds.delete(previous.id);this.quizzes.set(existingPool.id,poolSnapshot);throw error;}
        return this.get(ownerHash,existingPool.id);
      }
      if(otherOwners.length>0){
        this.applyOwners(previous,otherOwners);
        const id='quiz_'+crypto.randomUUID(),code=this.generateCode();this.usedCodes.add(code);
        const now=new Date().toISOString();
        const record=this.applyOwners({...data,id,code,createdAt:now,updatedAt:now},[ownerHash]);
        this.quizzes.set(id,record);
        try{this.persist();}catch(error){this.quizzes.set(previous.id,prevSnapshot);this.quizzes.delete(id);this.usedCodes.delete(code);throw error;}
        return this.get(ownerHash,id);
      }
      const id=previous.id,code=previous.code||this.generateCode();this.usedCodes.add(code);
      const record=this.applyOwners({...previous,...data,id,code,createdAt:previous.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()},[ownerHash]);
      this.quizzes.set(id,record);
      try{this.persist();}catch(error){this.quizzes.set(id,prevSnapshot);throw error;}
      return this.get(ownerHash,id);
    }
    const id='quiz_'+crypto.randomUUID(),code=this.generateCode();this.usedCodes.add(code);
    const record=this.applyOwners({...data,id,code,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},[ownerHash]);
    this.quizzes.set(id,record);
    try{this.persist();}catch(error){this.quizzes.delete(id);this.usedCodes.delete(code);throw error;}
    return this.get(ownerHash,id);
  }
}
module.exports={QuizLibrary,userHash};
