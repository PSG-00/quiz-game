/* Shared animation palettes. Each instance has its own phase, blend,
   heading and world transform. Original GLB geometry/textures stay shared.
   Only remote players use this path; local player keeps its full live rig. */
window.InstancedAvatars=(()=>{
 const T=THREE,frames=32,capacity=128,pools=new Map();
 let scene=null,supported=false,maxTextureSize=0;
 const skinShader=`
 attribute vec4 skinIndex;
 attribute vec4 skinWeight;
 attribute vec2 crowdPose;
 uniform sampler2D crowdBones;
 uniform vec2 crowdTextureSize;
 mat4 crowdBone(float bone,float row){
   float x=(bone*4.0+0.5)/crowdTextureSize.x;
   float y=(row+0.5)/crowdTextureSize.y;
   float dx=1.0/crowdTextureSize.x;
   return mat4(texture2D(crowdBones,vec2(x,y)),texture2D(crowdBones,vec2(x+dx,y)),texture2D(crowdBones,vec2(x+2.0*dx,y)),texture2D(crowdBones,vec2(x+3.0*dx,y)));
 }
 mat4 crowdAnimatedBone(float bone){
   if(crowdPose.y<=0.001)return crowdBone(bone,0.0);
   float phase=mod(crowdPose.x,32.0);
   float a=floor(phase);
   float t=fract(phase);
   mat4 walk=crowdBone(bone,1.0+a)*(1.0-t)+crowdBone(bone,1.0+mod(a+1.0,32.0))*t;
   if(crowdPose.y>=0.999)return walk;
   return crowdBone(bone,0.0)*(1.0-crowdPose.y)+walk*crowdPose.y;
 }
 mat4 crowdSkin(){
   mat4 skin=crowdAnimatedBone(skinIndex.x)*skinWeight.x;
   if(skinWeight.y>0.0)skin+=crowdAnimatedBone(skinIndex.y)*skinWeight.y;
   if(skinWeight.z>0.0)skin+=crowdAnimatedBone(skinIndex.z)*skinWeight.z;
   if(skinWeight.w>0.0)skin+=crowdAnimatedBone(skinIndex.w)*skinWeight.w;
   return skin;
 }
 `;
 function attach(target,renderer){scene=target;supported=renderer.capabilities.floatVertexTextures&&renderer.capabilities.maxVertexTextures>0;maxTextureSize=renderer.capabilities.maxTextureSize;}
 function build(id){
   const model=id==='plana-original'?window.PlanaOriginalModel:AvatarModels[id];if(!scene||!supported||!model?.loaded)return null;
   const poseFrames=model.poseFrames??frames;
   const rig=model.create(),parts=[];rig.updateMatrixWorld(true);
   rig.traverse(mesh=>{if(mesh.isMesh)parts.push({source:mesh,bones:mesh.isSkinnedMesh?mesh.skeleton.bones.length:1,data:new Float32Array((mesh.isSkinnedMesh?mesh.skeleton.bones.length:1)*16*(poseFrames+1))});});
   if(!parts.length){model.dispose(rig);return null;}
   if(parts.some(p=>p.bones*4>maxTextureSize)){model.dispose(rig);return null;}
   const transform=new T.Matrix4(),bone=new T.Matrix4();
   // Bake the same live pose implementation (including floor contact) once.
   for(let row=0;row<=poseFrames;row++){
     model.update(rig,false,row>0,0,0,{phase:row?((row-1)/frames)*Math.PI*2:0,blend:row?1:0});
     rig.updateMatrixWorld(true);
     for(const part of parts){
       const mesh=part.source,skeleton=mesh.skeleton;
       if(!mesh.isSkinnedMesh){mesh.matrixWorld.toArray(part.data,row*16);continue;}
       skeleton.update();
       transform.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
       for(let i=0;i<skeleton.bones.length;i++){
         bone.fromArray(skeleton.boneMatrices,i*16).premultiply(transform).multiply(mesh.bindMatrix);
         bone.toArray(part.data,(row*skeleton.bones.length+i)*16);
       }
     }
   }
   // LOD levels do not change bone matrices. Share identical palettes across
   // parts too, instead of uploading the same animation texture up to 21 times.
   const palettes=[];
   for(const part of parts){
     const shared=palettes.find(p=>p.data.length===part.data.length&&p.data.every((v,i)=>v===part.data[i]));
     if(shared){part.texture=shared.texture;continue;}
     const texture=new T.DataTexture(part.data,part.bones*4,poseFrames+1,T.RGBAFormat,T.FloatType);
     texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
     part.texture=texture;palettes.push(part);
   }
   const poses=Array.from({length:3},()=>new T.InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(T.DynamicDrawUsage));
   const batches=parts.flatMap(part=>[0,1,2].map(level=>{
     const source=part.source,width=part.bones*4;
     const texture=part.texture;
     // A geometry wrapper owns only the per-pool pose attribute; source vertex
     // buffers and indices are read-only references shared with the local model.
     const geometry=new T.BufferGeometry();geometry.setIndex(level?(source.geometry.userData.lodIndices?.[level-1]||source.geometry.index):source.geometry.index);
     for(const [name,attribute] of Object.entries(source.geometry.attributes))geometry.setAttribute(name,attribute);
     if(!source.isSkinnedMesh){
       const count=source.geometry.attributes.position.count,weights=new Float32Array(count*4);
       for(let i=0;i<count;i++)weights[i*4]=1;
       geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));
       geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
     }
     for(const group of source.geometry.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
     geometry.setAttribute('crowdPose',poses[level]);
     const material=source.material.clone();material.skinning=false;
     material.onBeforeCompile=shader=>{
       shader.uniforms.crowdBones={value:texture};shader.uniforms.crowdTextureSize={value:new T.Vector2(width,poseFrames+1)};
       shader.vertexShader=skinShader+shader.vertexShader;
       shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\nmat4 crowdDeform=crowdSkin();');
       shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','vec3 objectNormal=normalize(mat3(crowdDeform)*normal);\n#ifdef USE_TANGENT\nvec3 objectTangent=normalize(mat3(crowdDeform)*tangent.xyz);\n#endif');
       shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=(crowdDeform*vec4(position,1.0)).xyz;');
     };
     material.customProgramCacheKey=()=> 'crowd-bone-palette-v1';
     const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.name='Animated crowd '+id;mesh.count=0;mesh.frustumCulled=false;
     mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
     // Ground contact is already provided by the existing shared foot shadows.
     // Avoid a separate animated shadow pass for every remote participant.
     mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);
     return {mesh,texture,level};
   }));
   const pool={id,batches,poses,next:0,free:[],live:new Set(),dirty:false,visualHeight:rig.userData.visualHeight,frames:poseFrames,fullDetail:Boolean(model.fullDetail)};
   model.dispose(rig);pools.set(id,pool);return pool;
 }
 function create(id,seed){
   const pool=pools.get(id)||build(id);if(!pool)return null;
   if(!pool.free.length&&pool.next>=capacity)return null;
   const slot=pool.free.length?pool.free.pop():pool.next++,root=new T.Group(),body=new T.Group();root.add(body);
   root.userData={instancedAvatar:true,importedGLB:true,avatarId:id,seed,slot,pool,body,visualHeight:pool.visualHeight,displayHeight:pool.visualHeight,shown:false};
   pool.live.add(root);pool.dirty=true;return root;
 }
 function hide(root){const d=root.userData;if(!d.shown)return;d.shown=false;d.pool.dirty=true;}
 function update(root,ghost,moving,time,seed,motion){
   const d=root.userData;if(ghost){hide(root);return;}
   root.updateWorldMatrix(true,false);
   d.phase=(motion?.phase||0)/(Math.PI*2)*frames;d.blend=d.pool.frames===0?0:motion?.blend||0;
   d.shown=true;d.pool.dirty=true;
 }
 function flush(camera,height){
   for(const pool of pools.values())if(pool.dirty){
     const counts=[0,0,0];
     // Compact only visible living instances. A zero-scale matrix would still
     // run the vertex shader for every hidden character's entire geometry.
     for(const root of pool.live)if(root.userData.shown){
       const d=root.userData,level=pool.fullDetail?0:AvatarLOD.level(root,camera,height),count=counts[level]++;d.drawSlot=count;pool.poses[level].setXY(count,d.phase,d.blend);
       for(const {mesh,level:l} of pool.batches)if(l===level)mesh.setMatrixAt(count,root.matrixWorld);
     }
     for(const {mesh,level} of pool.batches){mesh.count=counts[level];mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;}
     for(const pose of pool.poses)pose.needsUpdate=true;pool.counts=counts;pool.dirty=false;
   }
 }
 function dispose(root){const d=root.userData;if(!d.pool.live.delete(root))return;hide(root);d.pool.free.push(d.slot);}
 function stats(){return {supported,lod:true,players:[...pools.values()].reduce((n,p)=>n+p.live.size,0),groups:[...pools.values()].map(p=>({avatar:p.id,players:p.live.size,levels:p.counts||[0,0,0],draws:p.batches.filter(b=>b.mesh.visible).length,frames:p.frames,bones:p.batches[0].texture.image.width/4,textureBytes:[...new Set(p.batches.map(b=>b.texture))].reduce((n,t)=>n+t.image.data.byteLength,0)}))};}
 return {attach,create,update,hide,flush,dispose,stats};
})();
