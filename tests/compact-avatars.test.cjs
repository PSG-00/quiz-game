const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {parse}=require('../scripts/build-compact-avatars.cjs');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},bytes={5126:4,5125:4,5123:2,5121:1};
function raw(g,id){const a=g.json.accessors[id],v=g.json.bufferViews[a.bufferView],stride=sizes[a.type]*bytes[a.componentType],out=Buffer.alloc(a.count*stride);for(let i=0;i<a.count;i++){const start=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||stride);g.bin.copy(out,i*stride,start,start+stride);}return out;}
function indices(g,p){const a=g.json.accessors[p.indices],b=raw(g,p.indices);return Array.from({length:a.count},(_,i)=>a.componentType===5125?b.readUInt32LE(i*4):b.readUInt16LE(i*2));}
test('경량 6종은 원본 얼굴 삼각형·정점 속성과 텍스처 바이트·스킨/노드 구조를 보존',()=>{
 for(const name of names){const original=parse(fs.readFileSync(`client/assets/models/${name}.glb`)),compact=parse(fs.readFileSync(`client/assets/models/${name}-compact-v1.glb`));
  assert.deepEqual(compact.json.nodes,original.json.nodes);assert.deepEqual(compact.json.materials,original.json.materials);
  assert.deepEqual(compact.json.skins.map(s=>s.joints),original.json.skins.map(s=>s.joints));
  for(let i=0;i<original.json.images.length;i++){const image=g=>{const v=g.json.bufferViews[g.json.images[i].bufferView];return g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};assert.deepEqual(image(compact),image(original));}
  const face=g=>g.json.meshes.flatMap(m=>m.primitives).find(p=>g.json.materials[p.material].name.includes('-face'));
  const a=face(original),b=face(compact),ai=indices(original,a),bi=indices(compact,b);assert.equal(ai.length,bi.length);
  for(const semantic of Object.keys(a.attributes)){const spec=original.json.accessors[a.attributes[semantic]],stride=sizes[spec.type]*bytes[spec.componentType],ar=raw(original,a.attributes[semantic]),br=raw(compact,b.attributes[semantic]);for(let i=0;i<ai.length;i++)assert.ok(ar.subarray(ai[i]*stride,(ai[i]+1)*stride).equals(br.subarray(bi[i]*stride,(bi[i]+1)*stride)),name+' face '+semantic);}
  for(const mesh of compact.json.meshes)for(const p of mesh.primitives){const count=compact.json.accessors[p.attributes.POSITION].count;for(const i of indices(compact,p))assert.ok(i<count);}
 }
});
test('경량 LOD들은 새 GLB와 일치하고 정점 범위를 벗어나지 않음',()=>{
 for(const name of names){const file=`client/assets/models/${name}-compact-v1.glb`,source=fs.readFileSync(file),g=parse(source),meta=JSON.parse(fs.readFileSync(file+'.lod.json')),bin=fs.readFileSync(file+'.lod.bin');assert.equal(meta.sourceHash,crypto.createHash('sha256').update(source).digest('hex'));
  for(const e of meta.entries){const p=g.json.meshes[e.mesh].primitives[e.primitive],n=g.json.accessors[p.attributes.POSITION].count;let previous=e.original*3;for(const l of e.levels){assert.ok(l.count<=previous);assert.equal(l.count%3,0);for(let i=0;i<l.count;i++)assert.ok(bin.readUInt32LE(l.offset+i*4)<n);previous=l.count;}}
 }
});
