(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FramePacing=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 function create(maxFps=144){
   const interval=1000/maxFps;let next=null;
   return {accept(timestamp,hidden=false){
     if(hidden){next=null;return false;}
     if(next===null){next=timestamp+interval;return true;}
     if(timestamp+.1<next)return false;
     next+=Math.max(1,Math.floor((timestamp-next+.1)/interval)+1)*interval;
     return true;
   }};
 }
 return {create};
});
