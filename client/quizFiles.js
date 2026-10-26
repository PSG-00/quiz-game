/* Shared file validation keeps a failed import from changing the current draft. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./quizLimits'):root.QuizLimits);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QuizFiles=api;
})(typeof window!=='undefined'?window:globalThis,(limits)=>{
  function parse(text,{allowLegacyLengths=false}={}){
    let data;
    try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('JSON 파일을 읽을 수 없어요. ‘퀴즈 파일 저장’으로 받은 파일인지 확인해 주세요.');}
    if(!data||data.version!==1||!Array.isArray(data.questions)||!data.questions.length)throw new Error('지원하는 퀴즈 파일이 아니에요. version: 1과 questions 목록이 필요합니다.');
    const questions=data.questions.map((q,i)=>{
      const invalid=message=>{throw new Error(`문제 ${i+1}: ${message}`);};
      if(!q||!['OX','SHORT','MULTIPLE','MINORITY','RACE'].includes(q.type))invalid('문제 유형을 확인해 주세요.');
      if(typeof q.question!=='string')invalid('문제 내용을 확인해 주세요.');
      if(!['MINORITY','RACE'].includes(q.type)&&(typeof q.answer!=='string'||q.answer.length>1000))invalid('정답 형식을 확인해 주세요.');
      if(q.type==='OX'&&!['O','X'].includes(q.answer))invalid('OX 정답은 O 또는 X여야 해요.');
      if(q.type==='RACE'&&(!Array.isArray(q.raceQuestions)||q.raceQuestions.length<1||q.raceQuestions.length>10||q.raceQuestions.some(item=>!item||typeof item.question!=='string'||!['O','X'].includes(item.answer))))invalid('OX 레이스는 1~10개의 OX 문제가 필요해요.');
      if(q.type==='MULTIPLE'&&(!['1','2','3','4'].includes(q.answer)||!Array.isArray(q.choices)||q.choices.length!==4))invalid('객관식은 보기 네 개와 1~4번 정답이 필요해요.');
      const choices=q.choices??['','','',''];
      if(!Array.isArray(choices)||choices.some(c=>typeof c!=='string'))invalid('보기 내용을 확인해 주세요.');
      const limitError=limits.error({...q,choices});if(limitError&&!allowLegacyLengths)invalid(limitError);
      const timeLimit=q.timeLimit??(q.type==='RACE'?120:12);
      if(!Number.isFinite(timeLimit)||timeLimit<5||timeLimit>(q.type==='RACE'?300:60))invalid(q.type==='RACE'?'레이스 제한시간은 5~300초여야 해요.':'제한시간은 5~60초여야 해요.');
      return {type:q.type,question:q.question,answer:['MINORITY','RACE'].includes(q.type)?'':q.answer,choices:[0,1,2,3].map(n=>choices[n]??''),timeLimit,isRevival:q.isRevival===true,inputMode:q.inputMode==='MOVE'?'MOVE':'BUTTON',ignoreSpaces:q.ignoreSpaces!==false,caseSensitive:q.caseSensitive===true,...(q.type==='RACE'?{raceQuestions:q.raceQuestions.map(item=>({question:item.question,answer:item.answer}))}:{})};
    });
    const result={questions};
    if(data.title!==undefined){if(typeof data.title!=='string'||data.title.length>40)throw new Error('방 제목은 40자까지 입력할 수 있어요.');result.title=data.title;}
    for(const [key,min,max] of [['targetWinners',1,100],['restSeconds',0,60]]){
      if(data[key]!==undefined){if(!Number.isInteger(data[key])||data[key]<min||data[key]>max)throw new Error(key==='restSeconds'?'쉬는 시간은 0~60초 정수로 입력해 주세요.':'당첨 목표 설정을 확인해 주세요.');result[key]=data[key];}
    }
    return result;
  }
  return {parse};
});
