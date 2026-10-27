// What a phone saw when it stalled or reconnected. Client input is reduced to known
// fields with bounded sizes before it reaches the log.
const MAX_EVENTS=10;
const NUMBERS=['code','gapMs','rttMs','minRttMs','fps','maxFrameMs','attempts','outageMs','awayMs','blockedMs','ago'];
const STRINGS={detail:200,state:12,room:24,net:12};
function sanitize(events,device){
 if(!Array.isArray(events))return [];
 const deviceName=typeof device==='string'&&device?device.slice(0,40):null;
 return events.slice(0,MAX_EVENTS).filter(event=>event&&typeof event==='object'&&typeof event.reason==='string'&&/^[a-z-]{1,32}$/.test(event.reason)).map(event=>{
  const clean={reason:event.reason};
  for(const key of NUMBERS)if(Number.isFinite(event[key]))clean[key]=Math.max(-1e7,Math.min(1e7,Math.round(event[key])));
  for(const [key,max] of Object.entries(STRINGS))if(typeof event[key]==='string'&&event[key])clean[key]=event[key].slice(0,max);
  if(typeof event.hidden==='boolean')clean.hidden=event.hidden;
  if(deviceName)clean.device=deviceName;
  return clean;
 });
}
module.exports={sanitize,MAX_EVENTS};
