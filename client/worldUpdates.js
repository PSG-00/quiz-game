(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorldUpdates=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 create(){let players=new Map(),keys=new Map(),roomId=null,sequence=-1,initialized=false,invalid=false;
  const remember=p=>{if(Number.isInteger(p.k))keys.set(p.k,p.i);};
  return {
   reset(){players.clear();keys.clear();roomId=null;sequence=-1;initialized=false;invalid=false;},
   needsSnapshot(){return invalid;},
   apply(message){
    if(message.type!=='WORLD_TICK'&&message.type!=='WORLD_DELTA')return null;
    if(message.type==='WORLD_DELTA'&&(!initialized||(message.roomId&&message.roomId!==roomId))){invalid=true;return null;}
    if(message.roomId===roomId&&message.seq!==undefined&&message.seq<=sequence)return null;
    if(message.type==='WORLD_TICK'){
     players=new Map((message.p||[]).map(p=>[p.i,{...p}]));keys=new Map();for(const p of players.values())remember(p);
     initialized=true;invalid=false;roomId=message.roomId||null;
    }else{
     // A missed baseline must never create a character with undefined identity/position.
     const patches=message.p||[],moves=message.m||[];
     if(patches.some(p=>!players.has(p.i)&&typeof p.n!=='string')){invalid=true;return null;}
     for(let j=0;j<moves.length;j+=3)if(!keys.has(moves[j])&&!patches.some(p=>p.k===moves[j])){invalid=true;return null;}
     for(const id of message.removed||[])players.delete(id);
     for(const patch of patches){const merged={...players.get(patch.i),...patch};players.set(patch.i,merged);remember(merged);}
     // Compact [key, x*100, z*100] position triples.
     for(let j=0;j<moves.length;j+=3){const player=players.get(keys.get(moves[j]));if(player){player.x=moves[j+1]/100;player.z=moves[j+2]/100;}}
    }
    sequence=message.seq??sequence;return [...players.values()];
   }
  };
 }
}));
