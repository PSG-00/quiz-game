// Which address the game socket dials. Cloudflare routes Korean carriers through Los Angeles,
// so a DNS-only host straight to the Seoul VM is preferred; the page's own host (Cloudflare)
// is the fallback when the direct one fails to open. A healthy socket is never switched.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ConnectionPath=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 STORAGE_KEY:'ox-direct-v1',
 create({directUrl='',pageUrl,storage=null,now=()=>Date.now(),blockMs=600000}={}){
  const direct=directUrl&&directUrl!==pageUrl?directUrl:'';
  let blockedUntil=0,lastDirectFailed=false;
  try{const saved=JSON.parse(storage?.getItem('ox-direct-v1')||'null');if(Number.isFinite(saved?.until))blockedUntil=saved.until;}catch{}
  function block(until){
   blockedUntil=until;
   try{if(until>now())storage?.setItem('ox-direct-v1',JSON.stringify({until}));else storage?.removeItem('ox-direct-v1');}catch{}
  }
  return {
   get enabled(){return Boolean(direct);},
   get blocked(){return blockedUntil>now();},
   // Right after a direct failure, one attempt goes through Cloudflare.
   next(){
    if(!direct)return {url:pageUrl,path:null};
    return !lastDirectFailed&&blockedUntil<=now()?{url:direct,path:'direct'}:{url:pageUrl,path:'cf'};
   },
   // A socket closed or timed out before WELCOME. When Cloudflare fails too the network is
   // down, so attempts alternate and a block from before no longer says anything.
   failed(path){
    if(path==='direct')lastDirectFailed=true;
    else if(path==='cf'){lastDirectFailed=false;if(blockedUntil)block(0);}
   },
   // True when Cloudflare worked right after the direct address failed: the caller probes
   // the direct address, so a passing blip does not keep this phone on the slower path.
   connected(path){
    const suspect=path==='cf'&&lastDirectFailed;lastDirectFailed=false;
    if(path==='direct'&&blockedUntil)block(0);
    return suspect;
   },
   probed(ok){if(!ok)block(now()+blockMs);}
  };
 }
}));
