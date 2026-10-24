/* Extend the approved GLB's 11-joint limb rig without changing its surfaces,
   textures or rest silhouette. Skin data is prepared once, before cloning. */
window.AvatarRig=(()=>{
 const T=THREE,smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 function enhance(scene){
  scene.updateMatrixWorld(true);
  const meshes=[],byName=new Map();scene.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isBone)byName.set(o.name,o);});
  const original=meshes.find(m=>m.isSkinnedMesh)?.skeleton;if(!original||!byName.has('Root'))return;
  const bones=original.bones.slice(),root=byName.get('Root'),hips=root.getWorldPosition(new T.Vector3());
  const armY=(byName.get('Arm_-1').getWorldPosition(new T.Vector3()).y+byName.get('Arm_1').getWorldPosition(new T.Vector3()).y)/2;
  const height=armY-hips.y;
  const add=(name,parent,position)=>{
   const bone=new T.Bone();bone.name=name;bone.position.copy(parent.worldToLocal(position.clone()));parent.add(bone);bone.updateMatrixWorld(true);bones.push(bone);byName.set(name,bone);return bone;
  };
  const spine=add('Spine',root,new T.Vector3(hips.x,hips.y+height*.36,hips.z));
  const chest=add('Chest',spine,new T.Vector3(hips.x,armY-height*.18,hips.z));
  const neck=add('Neck',chest,new T.Vector3(hips.x,armY+height*.12,hips.z));
  const head=add('Head',neck,new T.Vector3(hips.x,armY+height*.27,hips.z));
  const handPositions=new Map();
  for(const side of [-1,1]){
   const arm=byName.get('Arm_'+side),p=arm.getWorldPosition(new T.Vector3());
   const shoulder=add('Shoulder_'+side,chest,p.clone().lerp(chest.getWorldPosition(new T.Vector3()),.25));shoulder.attach(arm);
   const elbow=byName.get('Elbow_'+side),armMesh=meshes.find(m=>m.name.replace(/\s+/g,'_')==='Arm_'+side+'_mesh');
   const bounds=new T.Box3().setFromObject(armMesh),elbowPos=elbow.getWorldPosition(new T.Vector3());
   const wristY=bounds.min.y+(elbowPos.y-bounds.min.y)*.20;
   const wrist=new T.Vector3(side<0?bounds.min.x+(bounds.max.x-bounds.min.x)*.25:bounds.max.x-(bounds.max.x-bounds.min.x)*.25,wristY,elbowPos.z);
   const hand=add('Hand_'+side,elbow,wrist);handPositions.set(side,hand.getWorldPosition(new T.Vector3()));
  }
  scene.updateMatrixWorld(true);
  const skeleton=new T.Skeleton(bones),indices=new Map(bones.map((b,i)=>[b.name,i]));
  const point=new T.Vector3();let maxInfluences=0,vertices=0;
  for(const mesh of meshes){
   const geometry=mesh.geometry,positions=geometry.attributes.position,count=positions.count;
   const oldJoints=geometry.attributes.skinIndex,oldWeights=geometry.attributes.skinWeight;
   const joints=new Uint16Array(count*4),weights=new Float32Array(count*4),body=mesh.name.replace(/\s+/g,'_')==='Body_mesh';
   const side=mesh.name.includes('Arm_-1')?-1:mesh.name.includes('Arm_1')?1:0;
   for(let v=0;v<count;v++){
    point.fromBufferAttribute(positions,v).applyMatrix4(mesh.matrixWorld);let influences=[];
    if(mesh.isSkinnedMesh){
     for(let k=0;k<4;k++){const weight=oldWeights.array[v*4+k];if(weight>1e-6)influences.push([oldJoints.array[v*4+k],weight]);}
     if(side){
      const elbow=indices.get('Elbow_'+side),amount=1-smooth(handPositions.get(side).y-height*.03,handPositions.get(side).y+height*.24,point.y);
      influences=influences.flatMap(([i,w])=>i===elbow?[[i,w*(1-amount)],[indices.get('Hand_'+side),w*amount]]:[[i,w]]);
     }
    }else if(body){
     const lower=smooth(hips.y,hips.y+height*.55,point.y),upper=smooth(hips.y+height*.55,armY,point.y);
     influences=[[indices.get('Root'),1-lower],[indices.get('Spine'),lower*(1-upper)],[indices.get('Chest'),lower*upper]];
    }else influences=[[indices.get('Head'),1]];
    influences=influences.filter(([,w])=>w>1e-6).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const sum=influences.reduce((n,[,w])=>n+w,0);
    influences.forEach(([i,w],k)=>{joints[v*4+k]=i;weights[v*4+k]=w/sum;});
    maxInfluences=Math.max(maxInfluences,influences.length);vertices++;
   }
   geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
   if(mesh.isSkinnedMesh)mesh.bind(skeleton,mesh.matrixWorld);
   else{
    const replacement=new T.SkinnedMesh(geometry,mesh.material);replacement.name=mesh.name;replacement.userData=mesh.userData;
    replacement.position.copy(mesh.position);replacement.quaternion.copy(mesh.quaternion);replacement.scale.copy(mesh.scale);
    replacement.castShadow=mesh.castShadow;replacement.receiveShadow=mesh.receiveShadow;
    const parent=mesh.parent;parent.add(replacement);replacement.updateMatrixWorld(true);replacement.bind(skeleton,replacement.matrixWorld);parent.remove(mesh);
   }
  }
  scene.userData.rigProfile={version:3,bones:bones.length,maxInfluences,vertices};
 }
 return {enhance};
})();
