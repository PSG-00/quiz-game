const path=require('node:path');
function cacheControl(file){
 const extension=path.extname(file).toLowerCase();
 if(extension==='.html'||path.basename(file)==='sw.js')return 'no-store';
 if(file.replace(/\\/g,'/').includes('/assets/'))return 'public, max-age=3600, must-revalidate';
 if(file.replace(/\\/g,'/').includes('/vendor/'))return 'public, max-age=86400, must-revalidate';
 return 'no-cache';
}
module.exports={cacheControl};
