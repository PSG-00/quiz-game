// One room diff per tick, shared by capable clients. Older clients retain snapshots.
// Behind a proxy (Cloudflare) bufferedAmount stays near zero even when the phone is
// far behind, so clients that acknowledge ticks get end-to-end flow control instead.
const MAX_UNACKED_TICKS=20;
const isPosition=key=>key==='i'||key==='x'||key==='z';
class WorldStream {
  constructor(){this.previous=new Map();this.sequence=0;this.lastSnapshotAt=0;}
  snapshot(roomId,players,ws,stateVersion){
    if(!ws||ws.readyState!==1||ws.bufferedAmount>256*1024)return false;
    const seq=++this.sequence;
    ws.send(JSON.stringify({type:'WORLD_TICK',roomId,seq,stateVersion,p:players}));ws.worldSnapshotRoom=roomId;ws.worldSentSeq=ws.worldAckSeq=seq;ws.worldPaused=false;return true;
  }
  publish(roomId,players,connections,now=Date.now(),stateVersion){
    const phaseChanged=stateVersion!==this.stateVersion;this.stateVersion=stateVersion;
    const current=new Map(),changed=[],removed=[];
    for(const p of players){
      current.set(p.i,p);const previous=this.previous.get(p.i);
      if(!previous){changed.push(p);continue;}
      const patch={i:p.i};let different=false;
      for(const key of Object.keys(p))if(key!=='i'&&p[key]!==previous[key]){patch[key]=p[key];different=true;}
      if(different)changed.push(patch);
    }
    for(const id of this.previous.keys())if(!current.has(id))removed.push(id);
    this.previous=current;const sequence=++this.sequence;
    const refresh=now-this.lastSnapshotAt>=5000;if(refresh)this.lastSnapshotAt=now;
    let full,delta,compact;
    for(const ws of connections){
      if(!ws||ws.readyState!==1)continue;
      // Do not queue stale world positions behind a slow connection. Recover with
      // a complete snapshot once the queue drains; game/chat events are untouched.
      if(ws.bufferedAmount>256*1024){ws.worldSnapshotRoom=null;continue;}
      if(ws.worldFlow&&ws.worldSnapshotRoom===roomId){
        const unacked=(ws.worldSentSeq||0)-(ws.worldAckSeq||0);
        if(ws.worldPaused?unacked>2:unacked>MAX_UNACKED_TICKS){ws.worldPaused=true;ws.worldSkipped=(ws.worldSkipped||0)+1;continue;}
        // Caught up after a pause: the skipped ticks are replaced by one full state.
        if(ws.worldPaused){ws.worldPaused=false;ws.worldSnapshotRoom=null;}
      }
      if(!ws.worldDeltaEnabled||refresh||ws.worldSnapshotRoom!==roomId){
        full??=JSON.stringify({type:'WORLD_TICK',roomId,seq:sequence,stateVersion,p:players});
        if(ws.worldFlow&&ws.worldSnapshotRoom!==roomId)ws.worldAckSeq=sequence;
        ws.send(full);ws.worldSnapshotRoom=roomId;ws.worldSentSeq=sequence;
      }else if(changed.length||removed.length||phaseChanged){
        if(ws.worldCompact)compact??=this.compactDelta(roomId,sequence,stateVersion,changed,removed,current);
        else delta??=JSON.stringify({type:'WORLD_DELTA',roomId,seq:sequence,stateVersion,p:changed,removed});
        ws.send(ws.worldCompact?compact:delta);ws.worldSentSeq=sequence;
      }
    }
  }
  // Position-only changes become [key, x*100, z*100] triples; everything else stays a patch.
  compactDelta(roomId,seq,stateVersion,changed,removed,current){
    const p=[],m=[];
    for(const patch of changed){
      const player=current.get(patch.i);
      if(Number.isInteger(player?.k)&&patch.n===undefined&&Object.keys(patch).every(isPosition))m.push(player.k,Math.round(player.x*100),Math.round(player.z*100));
      else p.push(patch);
    }
    return JSON.stringify({type:'WORLD_DELTA',roomId,seq,stateVersion,p,m,removed});
  }
}
module.exports={WorldStream,MAX_UNACKED_TICKS};
