(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorldUpdates=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 create(){let players=new Map(),roomId=null,sequence=-1,initialized=false,invalid=false;
  return {
   reset(){players.clear();roomId=null;sequence=-1;initialized=false;invalid=false;},
   needsSnapshot(){return invalid;},
   apply(message){
    if(message.type!=='WORLD_TICK'&&message.type!=='WORLD_DELTA')return null;
    if(message.type==='WORLD_DELTA'&&(!initialized||(message.roomId&&message.roomId!==roomId))){invalid=true;return null;}
    if(message.roomId===roomId&&message.seq!==undefined&&message.seq<=sequence)return null;
    if(message.type==='WORLD_TICK'){
     players=new Map((message.p||[]).map(p=>[p.i,{...p}]));initialized=true;invalid=false;roomId=message.roomId||null;
    }else{
     // A missed baseline must never create a character with undefined identity/position.
     if((message.p||[]).some(p=>!players.has(p.i)&&typeof p.n!=='string')){invalid=true;return null;}
     for(const id of message.removed||[])players.delete(id);
     for(const patch of message.p||[]){const previous=players.get(patch.i);players.set(patch.i,{...previous,...patch});}
    }
    sequence=message.seq??sequence;return [...players.values()];
   }
  };
 }
}));
