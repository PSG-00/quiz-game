(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoomStateSync=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 create(){
  let applied=-1,observed=-1,pending=false,lastRequest=-Infinity;
  return {
   reset(){applied=observed=-1;pending=false;lastRequest=-Infinity;},
   accept(version){if(Number.isInteger(version))applied=version;pending=observed>applied;},
   observe(version){if(Number.isInteger(version)){observed=Math.max(observed,version);if(observed>applied)pending=true;}},
   invalidate(){pending=true;},
   due(state,serverNow,now){
    const expired=state&&!['WAITING','ENDED'].includes(state.state)&&state.stateEndTime>0&&serverNow>=state.stateEndTime+250;
    if(!(pending||expired)||now-lastRequest<1000)return false;
    lastRequest=now;return true;
   }
  };
 }
}));
