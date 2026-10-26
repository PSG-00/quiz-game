const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {parse}=require('../scripts/build-compact-avatars.cjs');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
test('통합 6종은 2메쉬·2머티리얼·2이미지와 준비된 19관절을 포함하며 원본 텍스처 크기를 보존',()=>{
 for(const name of names){const prefix=`client/assets/models/${name}`,source=fs.readFileSync(prefix+'-compact-v1.glb'),original=parse(source),g=parse(fs.readFileSync(prefix+'-atlas-v1.glb')),j=g.json;
  assert.equal(j.meshes.length,2);assert.equal(j.materials.length,2);assert.equal(j.images.length,2);assert.equal(j.skins[0].joints.length,19);
  const profile=j.nodes.find(n=>n.extras?.atlasProfile)?.extras.atlasProfile;assert.equal(profile.sourceHash,crypto.createHash('sha256').update(source).digest('hex'));
  const slots=profile.groups.flatMap(group=>group.slots);assert.equal(slots.length,7);
  for(const material of original.json.materials){const slot=slots.find(s=>s.material===material.name),t=material.emissiveTexture||material.pbrMetallicRoughness.baseColorTexture,image=original.json.images[original.json.textures[t.index].source],v=original.json.bufferViews[image.bufferView],b=original.bin.subarray(v.byteOffset||0);assert.equal(slot.w,b.readUInt32BE(16));assert.equal(slot.h,b.readUInt32BE(20));}
  for(const group of profile.groups){assert.ok(group.width<=4096&&group.height<=4096);for(const a of group.slots){assert.ok(a.x>=8&&a.y>=8&&a.x+a.w+8<=group.width&&a.y+a.h+8<=group.height);for(const b of group.slots)if(a!==b)assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}}
  const triangleCount=json=>json.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+json.accessors[p.indices].count/3,0);assert.equal(triangleCount(j),triangleCount(original.json));
 }
});
test('통합 LOD는 재단순화 없이 기존 경량 LOD 삼각형을 보존하며 유효한 정점만 참조',()=>{
 for(const name of names){const file=`client/assets/models/${name}-atlas-v1.glb`,bytes=fs.readFileSync(file),g=parse(bytes),meta=JSON.parse(fs.readFileSync(file+'.lod.json')),old=JSON.parse(fs.readFileSync(`client/assets/models/${name}-compact-v1.glb.lod.json`)),bin=fs.readFileSync(file+'.lod.bin');assert.equal(meta.sourceHash,crypto.createHash('sha256').update(bytes).digest('hex'));for(let level=0;level<2;level++)assert.equal(meta.entries.reduce((n,e)=>n+e.levels[level].count,0),old.entries.reduce((n,e)=>n+e.levels[level].count,0));
  for(const e of meta.entries){const p=g.json.meshes[e.mesh].primitives[e.primitive],n=g.json.accessors[p.attributes.POSITION].count;for(const l of e.levels){assert.equal(l.count%3,0);for(let i=0;i<l.count;i++)assert.ok(bin.readUInt32LE(l.offset+i*4)<n);}}
 }
});
