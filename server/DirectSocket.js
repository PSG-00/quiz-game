// Optional direct game socket: a DNS-only host (Caddy on this VM) beside the Cloudflare one.
// Cloudflare sends Korean carriers through Los Angeles; the direct host skips that detour.
function parseDirectUrl(value){
 if(!value)return null;
 try{const url=new URL(value);return ['wss:','ws:'].includes(url.protocol)?url:null;}catch{return null;}
}
function injectDirectMeta(html,url){
 if(!url)return html;
 const tag=`<meta name="ox-direct-socket" content="${`${url.protocol}//${url.host}`.replace(/[&"<>]/g,'')}" />`;
 return html.replace(/<meta charset="UTF-8" \/>/i,match=>`${match}\n  ${tag}`);
}
// Caddy and cloudflared both connect from loopback; only the Host header tells them apart.
function socketPath(req,url){
 if(!url)return undefined;
 return String(req.headers.host||'').toLowerCase()===url.host.toLowerCase()?'direct':'cf';
}
module.exports={parseDirectUrl,injectDirectMeta,socketPath};
