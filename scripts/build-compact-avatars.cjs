/* Conservative offline edge collapse. Original GLBs, textures and face vertices
 * are retained; output gets compact per-part vertex buffers and fresh LODs. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {MeshoptSimplifier:S}=require('meshoptimizer');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},types={5126:[4,'getFloat32'],5125:[4,'getUint32'],5123:[2,'getUint16'],5121:[1,'getUint8']};
function parse(bytes){let json,bin;for(let o=12;o<bytes.length;){const n=bytes.readUInt32LE(o),t=bytes.readUInt32LE(o+4),d=bytes.subarray(o+8,o+8+n);if(t===0x4e4f534a)json=JSON.parse(d.toString());if(t===0x004e4942)bin=d;o+=n+8;}return {json,bin};}
function pack(json,bin){const j=Buffer.from(JSON.stringify(json)),jp=Buffer.alloc((j.length+3)&~3,32);j.copy(jp);const bp=Buffer.alloc((bin.length+3)&~3);bin.copy(bp);const out=Buffer.alloc(28+jp.length+bp.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jp.length,12);out.writeUInt32LE(0x4e4f534a,16);jp.copy(out,20);const o=20+jp.length;out.writeUInt32LE(bp.length,o);out.writeUInt32LE(0x004e4942,o+4);bp.copy(out,o+8);return out;}
function build(bytes){
 const {json:j,bin}=parse(bytes),out=structuredClone(j),chunks=[],views=[],accessors=[],parts=[];let offset=0;
 const raw=id=>{const a=j.accessors[id],v=j.bufferViews[a.bufferView],n=widths[a.type]*types[a.componentType][0],b=Buffer.alloc(a.count*n);if(a.sparse)throw Error('Sparse accessor unsupported');for(let i=0;i<a.count;i++)bin.copy(b,i*n,(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n),(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n)+n);return b;};
 const read=id=>{const a=j.accessors[id],b=raw(id),[n,method]=types[a.componentType],r=new Float32Array(b.length/n);for(let i=0;i<r.length;i++)r[i]=new DataView(b.buffer,b.byteOffset,b.byteLength)[method](i*n,true)/(a.normalized?(a.componentType===5121?255:65535):1);return r;};
 function view(b,target){const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const id=views.length;views.push({buffer:0,byteOffset:offset,byteLength:b.length,...(target?{target}:{})});chunks.push(b);offset+=b.length;return id;}
 function accessor(a,b,target){const id=accessors.length,c={...a,bufferView:view(b,target),byteOffset:0};delete c.sparse;accessors.push(c);return id;}
 for(let mi=0;mi<j.meshes.length;mi++)for(let pi=0;pi<j.meshes[mi].primitives.length;pi++){
  const p=j.meshes[mi].primitives[pi],dest=out.meshes[mi].primitives[pi],mat=j.materials[p.material],pos=read(p.attributes.POSITION),n=pos.length/3;
  const original=p.indices===undefined?Uint32Array.from({length:n},(_,i)=>i):Uint32Array.from(read(p.indices));
  const face=mat.name.includes('-face'),hair=mat.name.includes('-hair'),body=mat.name.includes('-Body');
  const norm=read(p.attributes.NORMAL),uv=read(p.attributes.TEXCOORD_0),skin=p.attributes.WEIGHTS_0!==undefined?read(p.attributes.WEIGHTS_0):null,joints=skin?read(p.attributes.JOINTS_0):null;
  const stride=skin?16:5,attrs=new Float32Array(n*stride),weights=[.3,.3,.3,1,1,...(skin?Array(11).fill(.7):[])];
  for(let i=0;i<n;i++){attrs.set(norm.subarray(i*3,i*3+3),i*stride);attrs.set(uv.subarray(i*2,i*2+2),i*stride+3);if(skin)for(let k=0;k<4;k++)attrs[i*stride+5+joints[i*4+k]]+=skin[i*4+k];}
  const ratio=face?1:hair?.22:body?.45:.60;
  let indices=original,error=0;
  if(!face)[indices,error]=S.simplifyWithAttributes(original,pos,3,attrs,stride,weights,null,Math.max(12,Math.floor(original.length*ratio/3)*3),.002,['RegularizeLight','PreserveFolds']);
  // Compact all attributes consistently; retain exact surviving UV/normal/skin bytes.
  const remap=new Map(),old=[];indices=Uint32Array.from(indices,id=>{if(!remap.has(id)){remap.set(id,old.length);old.push(id);}return remap.get(id);});
  for(const [semantic,id] of Object.entries(p.attributes)){
   const a=j.accessors[id],b=raw(id),element=widths[a.type]*types[a.componentType][0],compact=Buffer.alloc(old.length*element);old.forEach((v,i)=>b.copy(compact,i*element,v*element,(v+1)*element));
   const spec={...a,count:old.length};delete spec.min;delete spec.max;
   if(semantic==='POSITION'){spec.min=[Infinity,Infinity,Infinity];spec.max=[-Infinity,-Infinity,-Infinity];for(const v of old)for(let k=0;k<3;k++){spec.min[k]=Math.min(spec.min[k],pos[v*3+k]);spec.max[k]=Math.max(spec.max[k],pos[v*3+k]);}}
   dest.attributes[semantic]=accessor(spec,compact,34962);
  }
  const ib=Buffer.alloc(indices.length*4);indices.forEach((v,i)=>ib.writeUInt32LE(v,i*4));dest.indices=accessor({componentType:5125,count:indices.length,type:'SCALAR'},ib,34963);
  parts.push({mesh:mi,name:j.meshes[mi].name,face,hair,original:original.length/3,triangles:indices.length/3,verticesBefore:n,vertices:old.length,error});
 }
 for(let i=0;i<(j.skins||[]).length;i++){const id=j.skins[i].inverseBindMatrices;if(id!==undefined)out.skins[i].inverseBindMatrices=accessor(j.accessors[id],raw(id));}
 for(let i=0;i<(j.images||[]).length;i++){const v=j.bufferViews[j.images[i].bufferView];out.images[i].bufferView=view(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));}
 if(j.animations?.length)throw Error('Animation accessors require remapping');
 out.accessors=accessors;out.bufferViews=views;out.buffers=[{byteLength:offset}];out.asset.generator='RESCENE conservative compact-v1 (meshoptimizer; face/texture preserved)';
 return {bytes:pack(out,Buffer.concat(chunks)),parts};
}
async function main(){await S.ready;const report=[];for(const name of names){const file=path.join('client/assets/models',name+'.glb'),source=fs.readFileSync(file),result=build(source),output=file.replace('.glb','-compact-v1.glb');fs.writeFileSync(output,result.bytes);report.push({name,sourceHash:crypto.createHash('sha256').update(source).digest('hex'),bytesBefore:source.length,bytes:result.bytes.length,trianglesBefore:result.parts.reduce((n,p)=>n+p.original,0),triangles:result.parts.reduce((n,p)=>n+p.triangles,0),verticesBefore:result.parts.reduce((n,p)=>n+p.verticesBefore,0),vertices:result.parts.reduce((n,p)=>n+p.vertices,0),parts:result.parts});}fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/compact-build-report.json',JSON.stringify(report,null,2));console.table(report.map(({parts,...r})=>r));}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={parse,pack,build};

