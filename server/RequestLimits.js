// Per connection, bounded token buckets. The overall bucket also covers invalid JSON.
class RequestLimits{
 constructor(){this.buckets=new Map();}
 allow(key,rate,burst,now=Date.now()){
  const old=this.buckets.get(key)||{tokens:burst,at:now};
  const tokens=Math.min(burst,old.tokens+Math.max(0,now-old.at)*rate/1000);
  const allowed=tokens>=1;this.buckets.set(key,{tokens:allowed?tokens-1:tokens,at:now});return allowed;
 }
}
module.exports={RequestLimits};
