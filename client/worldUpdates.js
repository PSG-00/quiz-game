(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorldUpdates=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 create(){let players=new Map(),roomId=null,sequence=-1,initialized=false;
  return {
   reset(){players.clear();roomId=null;sequence=-1;initialized=false;},
   apply(message){
    if(message.type!=='WORLD_TICK'&&message.type!=='WORLD_DELTA')return null;
    if(message.type==='WORLD_DELTA'&&(!initialized||(message.roomId&&message.roomId!==roomId)))return null;
    if(message.roomId===roomId&&message.seq!==undefined&&message.seq<=sequence)return null;
    if(message.type==='WORLD_TICK'){
     players=new Map((message.p||[]).map(p=>[p.i,{...p}]));initialized=true;roomId=message.roomId||null;
    }else{
     for(const id of message.removed||[])players.delete(id);
     for(const patch of message.p||[]){const previous=players.get(patch.i);players.set(patch.i,{...previous,...patch});}
    }
    sequence=message.seq??sequence;return [...players.values()];
   }
  };
 }
}));
