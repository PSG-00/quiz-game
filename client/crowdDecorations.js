/* Shared screen-facing status cards. The local gold
   ring/status card and all DOM text retain their existing rendering paths. */
window.CrowdDecorations=(()=>{
 const T=THREE,capacity=128,labels=new Map(),object=new T.Object3D(),up=new T.Vector3();
 let scene=null;
 function attach(target){scene=target;}
 function batch(texture){
  if(labels.has(texture))return labels.get(texture);
  const mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}),capacity);
  mesh.name='Crowd status cards';mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=11;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);labels.set(texture,mesh);return mesh;
 }
 function flush(entities,myId,camera){
  if(!scene)return;for(const mesh of labels.values())mesh.count=0;
  up.set(0,1,0).applyQuaternion(camera.quaternion);
  for(const entity of entities){
   if(entity.id===myId||!entity.group.visible)continue;
   entity.group.updateWorldMatrix(true,false);
   const sprite=entity.overheadSprite;
   if(!sprite.visible||!entity.overheadTex)continue;
   const mesh=batch(entity.overheadTex);
   object.position.copy(sprite.position).applyMatrix4(entity.group.matrixWorld).addScaledVector(up,(.5-sprite.center.y)*sprite.scale.y);
   object.quaternion.copy(camera.quaternion);object.scale.copy(sprite.scale);object.updateMatrix();mesh.setMatrixAt(mesh.count++,object.matrix);
  }
  for(const mesh of labels.values()){mesh.visible=mesh.count>0;if(mesh.visible)mesh.instanceMatrix.needsUpdate=true;}
 }
 function stats(){return {shadowDraws:0,statusDraws:[...labels.values()].filter(m=>m.visible).length};}
 return {attach,flush,stats};
})();
