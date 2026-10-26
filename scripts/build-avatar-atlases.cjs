/* Lossless-size atlas packing. Does not resize or repaint any source image. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parse}=require('./build-compact-avatars.cjs');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
async function main(){const browser=await chromium.launch({headless:true,channel:'chrome'});try{const page=await browser.newPage();const reports=[];
 for(const name of names){const file=path.join('client/assets/models',name+'-compact-v1.glb'),bytes=fs.readFileSync(file),{json:j,bin}=parse(bytes),inputs=j.materials.map(m=>{
  const basic=Boolean(m.emissiveTexture),im=j.images[j.textures[(m.emissiveTexture||m.pbrMetallicRoughness.baseColorTexture).index].source],v=j.bufferViews[im.bufferView],data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  return {material:m.name,kind:basic?'basic':'toon',url:'data:'+im.mimeType+';base64,'+data.toString('base64')};
 });
 const groups=await page.evaluate(async inputs=>{
  const decoded=await Promise.all(inputs.map(async input=>{const blob=await(await fetch(input.url)).blob(),image=await createImageBitmap(blob);return {...input,image,w:image.width,h:image.height};})),result=[];
  for(const kind of ['basic','toon']){
   const list=decoded.filter(d=>d.kind===kind).sort((a,b)=>b.h-a.h||b.w-a.w),pad=8,widths=new Set();
   for(let mask=1;mask<(1<<list.length);mask++){let w=0;for(let i=0;i<list.length;i++)if(mask&(1<<i))w+=list[i].w+pad*2;if(w<=4096)widths.add(w);}
   let best;for(const width of widths){if(list.some(d=>d.w+pad*2>width))continue;let x=0,y=0,row=0;const slots=[];for(const d of list){if(x+d.w+pad*2>width){y+=row;x=0;row=0;}slots.push({material:d.material,x:x+pad,y:y+pad,w:d.w,h:d.h});x+=d.w+pad*2;row=Math.max(row,d.h+pad*2);}const height=y+row;if(height<=4096&&(!best||width*height<best.width*best.height))best={width,height,slots};}
   if(!best)throw Error('Atlas exceeds texture size');const canvas=document.createElement('canvas');canvas.width=best.width;canvas.height=best.height;const ctx=canvas.getContext('2d');
   for(const slot of best.slots){const d=list.find(d=>d.material===slot.material),{x,y,w,h}=slot;ctx.drawImage(d.image,x,y);ctx.drawImage(d.image,0,0,w,1,x,y-pad,w,pad);ctx.drawImage(d.image,0,h-1,w,1,x,y+h,w,pad);ctx.drawImage(d.image,0,0,1,h,x-pad,y,pad,h);ctx.drawImage(d.image,w-1,0,1,h,x+w,y,pad,h);for(const [sx,sy,dx,dy] of [[0,0,x-pad,y-pad],[w-1,0,x+w,y-pad],[0,h-1,x-pad,y+h],[w-1,h-1,x+w,y+h]])ctx.drawImage(d.image,sx,sy,1,1,dx,dy,pad,pad);}
   result.push({kind,...best,png:canvas.toDataURL('image/png')});
  }for(const d of decoded)d.image.close();return result;
 },inputs);
 for(const group of groups){group.image=path.basename(file).replace('.glb',`.atlas-${group.kind}.png`);fs.writeFileSync(path.join(path.dirname(file),group.image),Buffer.from(group.png.split(',')[1],'base64'));delete group.png;}
 const meta={version:1,sourceHash:crypto.createHash('sha256').update(bytes).digest('hex'),groups};fs.writeFileSync(file.replace('.glb','.atlas.json'),JSON.stringify(meta));reports.push({name,groups});
 }fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/atlas-build-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
