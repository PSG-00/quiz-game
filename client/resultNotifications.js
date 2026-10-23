/* Result notifications are scoped to a game, never to roster broadcasts. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.QuizResultNotices=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function keyFor(state){
    if(state?.state!=='ENDED'||!state.roomId)return null;
    // Compatibility with a running server from before explicit game IDs existed.
    return `${state.roomId}:${state.gameId||`legacy-${state.stateEndTime}`}`;
  }
  function createGate(storage){
    const storageKey='ox-seen-results-v1';let keys=[];
    try{const saved=JSON.parse(storage?.getItem(storageKey)||'[]');if(Array.isArray(saved))keys=saved.filter(k=>typeof k==='string').slice(-50);}catch{}
    const seen=new Set(keys);
    return {consume(state){
      const key=keyFor(state);if(!key||seen.has(key))return false;
      seen.add(key);keys.push(key);
      while(keys.length>50)seen.delete(keys.shift());
      try{storage?.setItem(storageKey,JSON.stringify(keys));}catch{}
      return true;
    }};
  }
  return {keyFor,createGate};
});
