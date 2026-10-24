/* Build index-only LODs: original UVs, normals and skin weights are untouched. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {MeshoptSimplifier:S}=require('meshoptimizer');
const assets=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
(async()=>{await S.ready;const report=[];
for(const name of assets){
 const file=path.join('client/assets/models',name+'.glb'),bytes=fs.readFileSync(file);let json,bin;
 for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),data=bytes.subarray(offset+8,offset+8+size);if(type===0x4e4f534a)json=JSON.parse(data.toString());if(type===0x004e4942)bin=data;offset+=8+size;}
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},types={5126:[4,'getFloat32'],5125:[4,'getUint32'],5123:[2,'getUint16'],5121:[1,'getUint8']};
 function read(id){const a=json.accessors[id],v=json.bufferViews[a.bufferView],[size,method]=types[a.componentType],width=widths[a.type],out=new Float32Array(a.count*width),view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);for(let i=0;i<a.count;i++)for(let k=0;k<width;k++)out[i*width+k]=view[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*width)+k*size,true)/(a.normalized?(a.componentType===5121?255:65535):1);return out;}
 const chunks=[],entries=[];let offset=0;
 for(let mi=0;mi<json.meshes.length;mi++)for(let pi=0;pi<json.meshes[mi].primitives.length;pi++){
  const p=json.meshes[mi].primitives[pi],pos=read(p.attributes.POSITION),n=pos.length/3,indices=p.indices!==undefined?Uint32Array.from(read(p.indices)):Uint32Array.from({length:n},(_,i)=>i),norm=read(p.attributes.NORMAL),uv=p.attributes.TEXCOORD_0!==undefined?read(p.attributes.TEXCOORD_0):new Float32Array(n*2),skin=p.attributes.WEIGHTS_0!==undefined?read(p.attributes.WEIGHTS_0):null,joints=skin?read(p.attributes.JOINTS_0):null;
  const stride=skin?16:5,attrs=new Float32Array(n*stride),weights=[.3,.3,.3,1,1,...(skin?Array(11).fill(.7):[])];
  for(let i=0;i<n;i++){attrs.set(norm.subarray(i*3,i*3+3),i*stride);attrs.set(uv.subarray(i*2,i*2+2),i*stride+3);if(skin)for(let k=0;k<4;k++)attrs[i*stride+5+joints[i*4+k]]+=skin[i*4+k];}
  const entry={mesh:mi,primitive:pi,original:indices.length/3,levels:[]};
  for(const [ratio,error] of [[.35,.012],[.12,.035]]){
   const [out,actualError]=S.simplifyWithAttributes(indices,pos,3,attrs,stride,weights,null,Math.max(12,Math.floor(indices.length*ratio/3)*3),error,['RegularizeLight']);
   const buffer=Buffer.from(out.buffer,out.byteOffset,out.byteLength);entry.levels.push({offset,count:out.length,error:actualError});chunks.push(buffer);offset+=buffer.length;
  }entries.push(entry);
 }
 const data=Buffer.concat(chunks),meta={version:1,sourceHash:crypto.createHash('sha256').update(bytes).digest('hex'),entries};fs.writeFileSync(file+'.lod.bin',data);fs.writeFileSync(file+'.lod.json',JSON.stringify(meta));
 report.push({name,original:entries.reduce((a,e)=>a+e.original,0),medium:entries.reduce((a,e)=>a+e.levels[0].count/3,0),low:entries.reduce((a,e)=>a+e.levels[1].count/3,0),bytes:data.length});
}fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/lod-build-report.json',JSON.stringify(report,null,2));console.table(report);
})().catch(e=>{console.error(e);process.exitCode=1;});
