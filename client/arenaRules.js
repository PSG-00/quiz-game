(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArenaRules=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const coordinate=value=>Number(Number(value).toFixed(2));
 function zone(type,x,z=0){
  x=coordinate(x);z=coordinate(z);
  if(type==='OX')return x<0?'O':'X';
  if(type==='MINORITY')return x<0?'LEFT':'RIGHT';
  if(type==='MULTIPLE')return String((z>=0?2:0)+(x>=0?2:1));
  return '';
 }
 return {coordinate,zone};
});
