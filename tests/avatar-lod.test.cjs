const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
test('6개 LOD가 현재 원본과 일치하고 UV·스킨 정점 범위 안의 삼각형만 참조',()=>{
 for(const name of names){const file='client/assets/models/'+name+'.glb',glb=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.lod.json')),bytes=fs.readFileSync(file+'.lod.bin');assert.equal(meta.sourceHash,crypto.createHash('sha256').update(glb).digest('hex'));
  const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());let full=0,medium=0,low=0;
  for(const entry of meta.entries){const primitive=json.meshes[entry.mesh].primitives[entry.primitive],vertices=json.accessors[primitive.attributes.POSITION].count;assert.equal(entry.levels.length,2);let prior=entry.original*3;
   for(const l of entry.levels){assert.equal(l.count%3,0);assert.ok(l.count<=prior);assert.ok(l.offset+l.count*4<=bytes.length);for(let i=0;i<l.count;i++)assert.ok(bytes.readUInt32LE(l.offset+i*4)<vertices);prior=l.count;}
   full+=entry.original;medium+=entry.levels[0].count/3;low+=entry.levels[1].count/3;
  }assert.ok(medium<full*.5);assert.ok(low<full*.25);
 }
});
test('구 GLTFLoader의 노드 식별자와 새 로더의 메시 식별자 모두 LOD를 연결',async()=>{
 for(const association of [{type:'nodes',index:0},{meshes:2,primitives:0}]){
  const geometry={userData:{}},mesh={isMesh:true,geometry},buffer=new Uint32Array([0,1,2]).buffer,context={window:{},THREE:{BufferAttribute:class{constructor(array){this.array=array;}}},fetch:async url=>url.endsWith('.json')?{ok:true,json:async()=>({entries:[{mesh:2,primitive:0,levels:[{offset:0,count:3}]}]})}:{ok:true,arrayBuffer:async()=>buffer}};
  vm.runInNewContext(fs.readFileSync('client/avatarLOD.js','utf8'),context);await context.window.AvatarLOD.load('model.glb',{scene:{traverse:fn=>fn(mesh)},parser:{json:{nodes:[{mesh:2}]},associations:new Map([[mesh,association]])}});assert.deepEqual([...geometry.userData.lodIndices[0].array],[0,1,2]);
 }
});

test('75%로 줄인 관전석 아바타는 실제 표시 크기를 반영해 LOD를 선택',()=>{
 const context={window:{},THREE:{Vector3:class{applyMatrix4(){return this;}}}};
 vm.runInNewContext(fs.readFileSync('client/avatarLOD.js','utf8'),context);
 const camera={fov:60,matrixWorldInverse:{}},level=(scale,depth)=>context.window.AvatarLOD.level({scale:{y:scale},userData:{visualHeight:3.16},getWorldPosition:out=>{out.z=-depth;return out;}},camera,1000);
 assert.equal(level(1,15),0);assert.equal(level(.75,15),1);
 assert.equal(level(1,32),1);assert.equal(level(.75,32),2);
});
