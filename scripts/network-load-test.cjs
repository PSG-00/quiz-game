/* Bounded network-only test. No rendering, quiz saves or changes to existing rooms. */
const fs=require('node:fs'),crypto=require('node:crypto'),WebSocket=require('ws');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(2,i),a.slice(i+1)];}));
const base=new URL(args.url||'http://127.0.0.1:3105'),count=Number(args.clients||50),seconds=Number(args.seconds||30);
if(![50,100].includes(count)||!Number.isFinite(seconds)||seconds<10||seconds>120)throw Error('Use --clients=50|100 --seconds=10..120');
// --compact=1 opts into compact deltas plus acknowledged flow control, like the current client.
const compact=args.compact==='1',worldFlags=compact?{worldDelta:true,worldCompact:true,worldFlow:true}:{worldDelta:true};
const label=args.label||'test',report={label,url:base.origin,clients:count,seconds,createdAt:new Date().toISOString(),http:{statuses:{},failures:[],bytes:0},ws:{connected:0,joined:0,upgradeStatuses:{},errors:[],unexpectedCloses:[],receivedBytes:0,worldBytes:0,worldMessages:0,moves:0,latencyMs:[]},rooms:[]};
const bots=[],timers=new Set();let measuring=false,cleaning=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pool(items,limit,fn){let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));}
async function request(path,headers={}){const start=performance.now();try{const r=await fetch(new URL(path,base),{headers,signal:AbortSignal.timeout(20000)}),bytes=(await r.arrayBuffer()).byteLength;report.http.statuses[r.status]=(report.http.statuses[r.status]||0)+1;report.http.bytes+=bytes;return {status:r.status,ms:performance.now()-start,bytes,cache:r.headers.get('cache-control'),cfCache:r.headers.get('cf-cache-status')};}catch(e){report.http.failures.push(e.message);return {error:e.message};}}
function connect(index,roomId){return new Promise(resolve=>{
 const url=new URL(base);url.protocol=base.protocol==='https:'?'wss:':'ws:';
 const b={index,socket:new WebSocket(url),id:null,joined:false,probe:index%10===0,pending:new Map()};bots.push(b);
 let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timeout);timers.delete(timeout);resolve(b);};
 const timeout=setTimeout(()=>{report.ws.errors.push('Join timeout '+index);b.socket.terminate();finish();},30000);timers.add(timeout);
 const send=m=>{if(b.socket.readyState===1)b.socket.send(JSON.stringify(m));};
 b.socket.on('open',()=>report.ws.connected++);
 b.socket.on('unexpected-response',(_,res)=>{report.ws.upgradeStatuses[res.statusCode]=(report.ws.upgradeStatuses[res.statusCode]||0)+1;res.resume();finish();});
 b.socket.on('error',e=>{report.ws.errors.push(e.message);finish();});
 b.socket.on('close',(code,reason)=>{if(!cleaning)report.ws.unexpectedCloses.push({index,code,reason:reason.toString().slice(0,100)});finish();});
 b.socket.on('message',raw=>{
  if(measuring)report.ws.receivedBytes+=raw.length;
  const world=raw.subarray(0,50).toString().includes('WORLD_');
  if(world&&compact){const seq=/"seq":(\d+)/.exec(raw.subarray(0,120).toString());if(seq)b.seq=Math.max(b.seq??-1,Number(seq[1]));}
  if(world&&measuring){report.ws.worldBytes+=raw.length;report.ws.worldMessages++;if(!b.probe)return;}
  let m;try{m=JSON.parse(raw);}catch{return;}
  if(Number.isInteger(m.seq))b.seq=Math.max(b.seq??-1,m.seq);
  if(m.type==='WELCOME'){b.id=m.clientId;if(roomId)send({type:'JOIN_ROOM',roomId,nickname:'검증봇'+index,avatarId:['woni','liv','minami','may','may-school','zena'][index%6],...worldFlags});else send({type:'AUTH_LIBRARY',token:crypto.randomBytes(32).toString('hex')});}
  if(m.type==='QUIZ_LIST'&&!roomId&&!b.creating){b.creating=true;send({type:'CREATE_ROOM',nickname:'검증봇'+index,avatarId:'woni',...worldFlags,title:'[부하검증] '+label+' '+index,targetWinners:1,restSeconds:0,questions:[{type:'MINORITY',question:'네트워크 부하 검증',timeLimit:15}]});}
  if(m.type==='JOINED_ROOM'){b.roomId=m.roomId;b.joined=true;report.ws.joined++;if(!roomId)report.rooms.push(m.roomId);finish();}
  if(m.type==='ERROR'){report.ws.errors.push(m.message);finish();}
  if(m.type==='WORLD_TICK')b.key=m.p?.find(p=>p.i===b.id)?.k;
  if(world&&measuring&&b.probe&&m.m)for(let j=0;j<m.m.length;j+=3)if(m.m[j]===b.key){const key=(m.m[j+1]/100).toFixed(2)+':'+(m.m[j+2]/100).toFixed(2),sent=b.pending.get(key);if(sent){report.ws.latencyMs.push(performance.now()-sent);b.pending.delete(key);}}
  if(world&&measuring&&b.probe){const own=m.p?.find(p=>p.i===b.id);if(own&&own.x!==undefined&&own.z!==undefined){const key=own.x.toFixed(2)+':'+own.z.toFixed(2),sent=b.pending.get(key);if(sent){report.ws.latencyMs.push(performance.now()-sent);b.pending.delete(key);}}}
 });
});}
async function main(){
 try{
  // Simultaneous page shell + representative resources, model payload sampled at 64 KiB.
  // This deliberately does NOT claim to download six full models for every user.
  await pool(Array.from({length:count}),count,()=>request('/'));
  const resources=['/app.js','/style.css','/assets/models/woni-sd-v3-walk.glb'];
  await pool(Array.from({length:count*resources.length},(_,i)=>resources[i%resources.length]),Math.min(200,count*4),p=>request(p,p.endsWith('.glb')||p.endsWith('.bin')?{Range:'bytes=0-65535'}:{}));
  report.http.modelSample=await request('/assets/models/woni-sd-v3-walk.glb',{Range:'bytes=0-65535'});
  for(let group=0;group<count/50;group++){
   const host=await connect(group*50);if(!host.joined)continue;
   await Promise.all(Array.from({length:49},(_,i)=>connect(group*50+i+1,host.roomId)));
  }
  await sleep(1000);measuring=true;const start=performance.now();
  const interval=setInterval(()=>{const t=(performance.now()-start)/1000;
   for(const b of bots)if(b.joined&&b.socket.readyState===1&&b.socket.bufferedAmount<128*1024){
    const x=Math.sin(t*.35+b.index*2.399)*8,z=Math.cos(t*.27+b.index*1.71)*4.8;
    b.socket.send(JSON.stringify({type:'MOVE',x,z}));report.ws.moves++;
    if(b.probe){b.pending.set(x.toFixed(2)+':'+z.toFixed(2),performance.now());if(b.pending.size>100)b.pending.delete(b.pending.keys().next().value);}
   }
  },100);timers.add(interval);
  const acks=setInterval(()=>{if(compact)for(const b of bots)if(b.socket.readyState===1&&b.seq>(b.acked??-1)){b.acked=b.seq;b.socket.send(JSON.stringify({type:'WORLD_ACK',seq:b.seq}));}},200);timers.add(acks);
  await sleep(seconds*1000);clearInterval(interval);timers.delete(interval);clearInterval(acks);timers.delete(acks);measuring=false;
  report.ws.measuredSeconds=(performance.now()-start)/1000;report.ws.receivedBytesPerSecond=report.ws.receivedBytes/report.ws.measuredSeconds;
  const sorted=report.ws.latencyMs.sort((a,b)=>a-b);report.ws.latency={samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)]??null,p95:sorted[Math.floor(sorted.length*.95)]??null};delete report.ws.latencyMs;
 }finally{
  cleaning=true;for(const timer of timers)clearTimeout(timer);
  for(const b of bots)if(b.socket.readyState===1)b.socket.close();else b.socket.terminate();
  await sleep(800);for(const b of bots)if(b.socket.readyState!==3)b.socket.terminate();
  const output=args.output||'artifacts/network-'+label+'-'+count+'.json';fs.mkdirSync(require('node:path').dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
