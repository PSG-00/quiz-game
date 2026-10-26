/* Prepare the approved rig + two atlas meshes offline. Runtime performs no
 * atlas drawing, vertex merging or repeated 11->19 joint enhancement. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {pack}=require('./build-compact-avatars.cjs');
const {chromium}=require('C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const names=['woni-sd-v3-walk','liv-sd-v7-walk','minami-pink-sd-v2-walk','may-sd-v2-walk','may-school-sd-v2-walk','zena-sd-v2-walk'];
let browser,child;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 child=fork(path.join(__dirname,'lib/auditServer.cjs'),[],{env:{...process.env,PORT:'3145'},silent:true});child.stdout.resume();child.stderr.resume();
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3145')).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();await page.goto('http://127.0.0.1:3145');await page.addScriptTag({path:path.join(__dirname,'../client/avatarAtlas.js')});await page.waitForFunction(()=>typeof AvatarAtlas!=='undefined'&&typeof AvatarRig!=='undefined');const report=[];
 for(const name of names){
  const data=await page.evaluate(async name=>{
   const asset='./assets/models/'+name+'-compact-v1.glb',gltf=await new THREE.GLTFLoader().loadAsync(asset);await AvatarLOD.load(asset,gltf);AvatarRig.enhance(gltf.scene);await AvatarAtlas.merge(asset,gltf);
   const objects=[];gltf.scene.traverse(o=>objects.push(o));const ids=new Map(objects.map((o,i)=>[o,i]));
   const encode=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
   const skeleton=objects.find(o=>o.isSkinnedMesh).skeleton;
   const nodes=objects.map(o=>({name:o.name||'PreparedAvatar',translation:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray(),...(o.children.length?{children:o.children.map(c=>ids.get(c))}:{}),extras:o.userData}));
   const meshes=objects.filter(o=>o.isSkinnedMesh).map(o=>({node:ids.get(o),name:o.name,basic:!!o.material.emissiveMap,attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([key,a])=>[key,{data:encode(a.array),count:a.count,itemSize:a.itemSize,type:a.array instanceof Uint16Array?5123:5126,normalized:a.normalized}])),indices:encode(o.geometry.index.array),indexCount:o.geometry.index.count,lods:o.geometry.userData.lodIndices.map(a=>({data:encode(a.array),count:a.count}))}));
   const inverses=new Float32Array(skeleton.bones.length*16);skeleton.boneInverses.forEach((m,i)=>m.toArray(inverses,i*16));
   return {nodes,meshes,joints:skeleton.bones.map(b=>ids.get(b)),inverseBind:encode(inverses)};
  },name);
  const prefix=path.join('client/assets/models',name),meta=JSON.parse(fs.readFileSync(prefix+'-compact-v1.atlas.json')),j={asset:{version:'2.0',generator:'RESCENE prepared atlas-v1'},scene:0,scenes:[{nodes:[0]}],nodes:data.nodes,meshes:[],skins:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],accessors:[],bufferViews:[],buffers:[]},chunks=[];let offset=0;
  function view(b,target){const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}const id=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length,...(target?{target}:{})});chunks.push(b);offset+=b.length;return id;}
  function accessor(spec,b,target){const id=j.accessors.length;j.accessors.push({...spec,bufferView:view(b,target)});return id;}
  j.skins.push({joints:data.joints,inverseBindMatrices:accessor({componentType:5126,type:'MAT4',count:data.joints.length},Buffer.from(data.inverseBind,'base64'))});
  const semantics={position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0',skinIndex:'JOINTS_0',skinWeight:'WEIGHTS_0'},widths={2:'VEC2',3:'VEC3',4:'VEC4'},lodChunks=[],entries=[];let lodOffset=0;
  for(const m of data.meshes){const index=j.meshes.length,attributes={};for(const [key,a] of Object.entries(m.attributes)){if(!semantics[key])continue;const b=Buffer.from(a.data,'base64'),spec={componentType:a.type,count:a.count,type:widths[a.itemSize]};if(a.normalized)spec.normalized=true;if(key==='position'){spec.min=[Infinity,Infinity,Infinity];spec.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let k=0;k<3;k++){const v=b.readFloatLE((i*3+k)*4);spec.min[k]=Math.min(spec.min[k],v);spec.max[k]=Math.max(spec.max[k],v);}}attributes[semantics[key]]=accessor(spec,b,34962);}
   const group=meta.groups.find(g=>g.kind===(m.basic?'basic':'toon')),image=fs.readFileSync(path.join('client/assets/models',group.image));j.images.push({mimeType:'image/png',bufferView:view(image)});j.textures.push({sampler:0,source:index});
   j.materials.push(m.basic?{name:'Atlas basic',doubleSided:true,emissiveFactor:[1,1,1],emissiveTexture:{index},pbrMetallicRoughness:{baseColorFactor:[0,0,0,1]}}:{name:'Atlas toon',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index},metallicFactor:0,roughnessFactor:.5}});
   j.meshes.push({name:m.name,primitives:[{attributes,indices:accessor({componentType:5125,type:'SCALAR',count:m.indexCount},Buffer.from(m.indices,'base64'),34963),material:index}]});j.nodes[m.node].mesh=index;j.nodes[m.node].skin=0;
   entries.push({mesh:index,primitive:0,original:m.indexCount/3,levels:m.lods.map(l=>{const b=Buffer.from(l.data,'base64'),r={offset:lodOffset,count:l.count};lodChunks.push(b);lodOffset+=b.length;return r;})});
  }
  j.buffers=[{byteLength:offset}];const glb=pack(j,Buffer.concat(chunks)),file=prefix+'-atlas-v1.glb';fs.writeFileSync(file,glb);fs.writeFileSync(file+'.lod.bin',Buffer.concat(lodChunks));fs.writeFileSync(file+'.lod.json',JSON.stringify({version:1,sourceHash:crypto.createHash('sha256').update(glb).digest('hex'),entries}));report.push({name,meshes:j.meshes.length,materials:j.materials.length,bones:data.joints.length,bytes:glb.length,triangles:entries.reduce((n,e)=>n+e.original,0)});
 }fs.writeFileSync('artifacts/atlas-model-build-report.json',JSON.stringify(report,null,2));console.table(report);
}finally{await browser?.close();child?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
