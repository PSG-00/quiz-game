(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QuizLimits=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const QUESTION=100,ANSWER=30,ALIASES_TOTAL=1000;
 const length=value=>Array.from(String(value)).length;
 function error(q){
  if(length(q.question)>QUESTION)return `문제는 ${QUESTION}자까지 입력할 수 있어요.`;
  if(q.type==='SHORT'&&String(q.answer).split(',').some(a=>length(a.trim())>ANSWER))return `주관식 정답은 쉼표로 나눈 각 정답마다 ${ANSWER}자까지 입력할 수 있어요.`;
  if(q.type==='SHORT'&&length(q.answer)>ALIASES_TOTAL)return '복수 정답 전체는 1,000자까지 입력할 수 있어요.';
  if(q.type==='MULTIPLE'&&q.choices?.some(c=>length(c)>ANSWER))return `객관식 보기는 각각 ${ANSWER}자까지 입력할 수 있어요.`;
  if(q.type==='RACE'){
   if(!Array.isArray(q.raceQuestions)||q.raceQuestions.length<1||q.raceQuestions.length>10)return 'OX 레이스는 1~10개의 OX 문제가 필요해요.';
   for(const item of q.raceQuestions)if(!item||typeof item.question!=='string'||length(item.question)>QUESTION||!['O','X'].includes(item.answer))return '레이스 문제는 100자 이내, 정답은 O 또는 X로 설정해 주세요.';
  }
  return '';
 }
 return {QUESTION,ANSWER,ALIASES_TOTAL,length,error};
});
