// A bad mobile line between test clients and the server. Each TCP connection gets latency
// and jitter (order kept), optional periodic blackouts (bytes held, then released, like a
// radio fade), a bandwidth cap toward the client and random hard cuts. Whole-proxy controls
// imitate a tunnel or airplane mode: freeze every connection and refuse new ones.
const net=require('node:net');
function createFlakyProxy({port,targetPort,latencyMs=0,jitterMs=0,upMs=0,downMs=0,cutEveryMs=null,bytesPerSecond=0,label=String(port)}={}){
 const stats={label,connections:0,cuts:0,refused:0};const pairs=new Set();let refuseUntil=0;
 const server=net.createServer(client=>{
  if(Date.now()<refuseUntil){stats.refused++;client.resetAndDestroy?.()??client.destroy();return;}
  stats.connections++;
  const upstream=net.connect(targetPort,'127.0.0.1'),born=Date.now(),offset=Math.random()*(upMs+downMs);
  const pair={client,upstream,frozenUntil:0,closed:false,cutTimer:null};pairs.add(pair);
  client.setNoDelay(true);upstream.setNoDelay(true);
  const isDown=now=>now<pair.frozenUntil||downMs>0&&(now-born+offset)%(upMs+downMs)>=upMs;
  function lane(from,to,cap){
   const queue=[];let lastAt=0,timer=null,tokens=cap,tokenAt=Date.now(),draining=false;
   const later=ms=>{if(!timer)timer=setTimeout(pump,Math.max(1,ms));};
   function pump(){
    timer=null;if(pair.closed||draining)return;
    while(queue.length){
     const now=Date.now();if(isDown(now)){later(40);return;}
     const head=queue[0];if(head.at>now){later(head.at-now);return;}
     let chunk=head.data;
     if(cap){
      tokens=Math.min(cap,tokens+(now-tokenAt)*cap/1000);tokenAt=now;
      if(tokens<512){later(Math.ceil((512-tokens)*1000/cap));return;}
      if(chunk.length>tokens){chunk=chunk.subarray(0,Math.floor(tokens));head.data=head.data.subarray(chunk.length);}else queue.shift();
      tokens-=chunk.length;
     }else queue.shift();
     if(!to.write(chunk)){draining=true;to.once('drain',()=>{draining=false;pump();});return;}
    }
   }
   from.on('data',data=>{const now=Date.now(),at=Math.max(lastAt,now+latencyMs+Math.random()*jitterMs);lastAt=at;queue.push({data,at});later(at-now);});
   return {get empty(){return !queue.length;}};
  }
  lane(client,upstream,0);lane(upstream,client,bytesPerSecond);
  const close=()=>{if(pair.closed)return;pair.closed=true;clearTimeout(pair.cutTimer);pairs.delete(pair);client.destroy();upstream.destroy();};
  // A FIN or RST sent while the line is down is lost too; the other side only learns later.
  const closeWhenUp=()=>{if(pair.closed)return;if(isDown(Date.now()))setTimeout(closeWhenUp,100);else close();};
  for(const socket of [client,upstream]){socket.on('error',closeWhenUp);socket.on('close',closeWhenUp);}
  if(cutEveryMs){
   pair.cutTimer=setTimeout(()=>{stats.cuts++;client.resetAndDestroy?.()??client.destroy();upstream.destroy();close();},cutEveryMs[0]+Math.random()*(cutEveryMs[1]-cutEveryMs[0]));
   pair.cutTimer.unref?.();
  }
 });
 return {
  stats,
  listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);}),
  close:()=>{for(const p of pairs){p.client.destroy();p.upstream.destroy();}return new Promise(resolve=>server.close(resolve));},
  // Tunnel: open connections go silent (nothing in, nothing out) and new ones are refused.
  freeze(ms){const until=Date.now()+ms;refuseUntil=Math.max(refuseUntil,until);for(const p of pairs)p.frozenUntil=Math.max(p.frozenUntil,until);},
  // Airplane mode: every connection is cut at once and new ones fail until it ends.
  offline(ms){refuseUntil=Math.max(refuseUntil,Date.now()+ms);for(const p of [...pairs]){stats.cuts++;clearTimeout(p.cutTimer);p.client.resetAndDestroy?.()??p.client.destroy();p.upstream.destroy();p.closed=true;pairs.delete(p);}}
 };
}
module.exports={createFlakyProxy};
