// One room diff per tick, shared by capable clients. Older clients retain snapshots.
class WorldStream {
  constructor(){this.previous=new Map();this.sequence=0;this.lastSnapshotAt=0;}
  publish(roomId,players,connections,now=Date.now()){
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
    let full,delta;
    for(const ws of connections){
      if(!ws||ws.readyState!==1)continue;
      // Do not queue stale world positions behind a slow connection. Recover with
      // a complete snapshot once the queue drains; game/chat events are untouched.
      if(ws.bufferedAmount>256*1024){ws.worldSnapshotRoom=null;continue;}
      if(!ws.worldDeltaEnabled||refresh||ws.worldSnapshotRoom!==roomId){
        full??=JSON.stringify({type:'WORLD_TICK',roomId,seq:sequence,p:players});
        ws.send(full);ws.worldSnapshotRoom=roomId;
      }else if(changed.length||removed.length){
        delta??=JSON.stringify({type:'WORLD_DELTA',roomId,seq:sequence,p:changed,removed});ws.send(delta);
      }
    }
  }
}
module.exports={WorldStream};
