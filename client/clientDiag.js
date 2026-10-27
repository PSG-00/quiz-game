// Connection diagnostics: what this device saw when it stalled, reconnected or failed.
// Events wait in a small queue (kept across a reload) until a connection works again.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClientDiag=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 STORAGE_KEY:'ox-diag-v1',
 create({storage=null,now=()=>Date.now(),context=()=>({}),limit=20}={}){
  let queue=[],previous=null;const lastByReason=new Map();
  try{
   const saved=JSON.parse(storage?.getItem('ox-diag-v1')||'null');storage?.removeItem('ox-diag-v1');
   if(Array.isArray(saved?.queue))queue=saved.queue.slice(-limit);
   if(Number.isFinite(saved?.leftAt))previous={leftAt:saved.leftAt,roomId:saved.roomId||null,state:saved.state||null};
  }catch{}
  return {
   previous,
   get size(){return queue.length;},
   record(reason,extra={},{throttleMs=0}={}){
    const t=now();if(throttleMs&&t-(lastByReason.get(reason)??-Infinity)<throttleMs)return false;
    lastByReason.set(reason,t);queue.push({...context(),...extra,reason,t});if(queue.length>limit)queue.shift();return true;
   },
   // `ago` is measured on this device's clock, so server/device clock skew does not matter.
   take(max=10){const t=now();return queue.splice(0,max).map(({t:at,...event})=>({...event,ago:t-at}));},
   persist(extra={}){try{storage?.setItem('ox-diag-v1',JSON.stringify({queue,...extra}));}catch{}}
  };
 }
}));
