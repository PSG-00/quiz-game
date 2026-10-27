const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
function cacheControl(file){
 const extension=path.extname(file).toLowerCase();
 if(extension==='.html'||path.basename(file)==='sw.js')return 'no-store';
 if(file.replace(/\\/g,'/').includes('/assets/'))return 'public, max-age=3600, must-revalidate';
 if(file.replace(/\\/g,'/').includes('/vendor/'))return 'public, max-age=86400, must-revalidate';
 return 'no-cache';
}
// Cloudflare's browser TTL can override no-cache for hours. A content hash in every
// local script/style URL makes each deploy fetch exactly the files that changed.
function versionedHtml(html,root){
 return html.replace(/(src|href)="\.\/([^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"/g,(match,attribute,file)=>{
  const full=path.resolve(root,file);
  if(!full.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(full))return match;
  const hash=crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex').slice(0,10);
  return `${attribute}="./${file}?v=${hash}"`;
 });
}
module.exports={cacheControl,versionedHtml};
