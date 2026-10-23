/* Actual Blender GLB, loaded once and shared by all Liv instances. */
function createBakedAvatarModel(asset,avatarId,version){
 let template=null,error=null;
 const gradient=new THREE.DataTexture(new Uint8Array([105,105,105,175,175,175,228,228,228,255,255,255]),4,1,THREE.RGBFormat);
 gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.generateMipmaps=false;gradient.needsUpdate=true;
 const ready=new Promise(resolve=>{
  new THREE.GLTFLoader().load(asset,gltf=>{
   const bounds=new THREE.Box3().setFromObject(gltf.scene),height=bounds.max.y-bounds.min.y;
   let bodyReference=0;gltf.scene.traverse(o=>{if(o.userData.body_reference_height)bodyReference=o.userData.body_reference_height;});
   const scale=2.95/(bodyReference||height);
   gltf.scene.scale.setScalar(scale);gltf.scene.position.y=bodyReference?0:-bounds.min.y*scale;
   template=new THREE.Group();template.add(gltf.scene);template.userData.visualHeight=height*scale;template.userData.bodyReferenceHeight=bodyReference?2.95:null;template.userData.bodyProfile=bodyReference?'standard-lean-v2':null;
   // glTF meshes face +Z after Blender's Y-up conversion.
   template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
   resolve(true);window.dispatchEvent(new CustomEvent('avatar-model-ready',{detail:{avatarId}}));if(avatarId==='liv')window.dispatchEvent(new Event('liv-model-ready'));
  },undefined,e=>{error=e;console.error(avatarId+' 3D 모델을 불러오지 못했습니다.',e);resolve(false);});
 });
 function create(){
  if(!template)return null;
  const root=new THREE.Group(),body=THREE.SkeletonUtils.clone(template),materials=[],bySource=new Map();root.add(body);
  body.traverse(o=>{
   if(!o.isMesh)return;
   const source=o.material;
   if(!bySource.has(source)){
    const baked=Boolean(source.emissiveMap),options={color:baked?source.emissive.clone():source.color.clone(),map:baked?source.emissiveMap:source.map,side:source.side,skinning:Boolean(o.isSkinnedMesh)};
    const m=baked||source.isMeshBasicMaterial?new THREE.MeshBasicMaterial(options):new THREE.MeshToonMaterial({...options,gradientMap:gradient});
    m.userData.original=m.color.clone();bySource.set(source,m);materials.push(m);
   }
   o.material=bySource.get(source);
  });
  const limbs=[];body.traverse(o=>{if(!o.isMesh&&/^(Arm|Leg)_-?1$/.test(o.name))limbs.push(o);});
  root.updateMatrixWorld(true);
  const joints=new Map();body.traverse(o=>{if(o.isBone)joints.set(o.name,{bone:o,rest:o.quaternion.clone(),axis:new THREE.Vector3(1,0,0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()).invert())});});
  const contacts=[];for(const side of [-1,1]){const foot=joints.get('Foot_'+side).bone,position=foot.getWorldPosition(new THREE.Vector3());for(const z of [-.07,.17])contacts.push({bone:foot,point:foot.worldToLocal(new THREE.Vector3(position.x,0,position.z+z))});}
  root.userData={avatarId,visualHeight:template.userData.visualHeight,bodyReferenceHeight:template.userData.bodyReferenceHeight,bodyProfile:template.userData.bodyProfile,importedGLB:true,importedLiv:avatarId==='liv',modelVersion:version,rigVersion:2,body,materials,limbs,joints,contacts,animation:AvatarMotion.create(),ghost:null};return root;
 }
 const jointTurn=new THREE.Quaternion(),contactPosition=new THREE.Vector3();
 function update(root,ghost,moving,time,seed,motion){
  const d=root.userData;
  if(d.ghost!==ghost){
   d.ghost=ghost;
   for(const m of d.materials){m.color.copy(m.userData.original);if(ghost)m.color.lerp(new THREE.Color(0xc0adea).convertSRGBToLinear(),.65);m.transparent=ghost;m.opacity=ghost?.56:1;m.depthWrite=!ghost;m.needsUpdate=true;}
  }
  const dt=Math.min(.1,Math.max(0,(time-(d.lastTime??time-16))/1000));d.lastTime=time;
  const gait=motion||AvatarMotion.advance(d.animation,dt,0,1,moving?7*dt:0),blend=ghost?0:gait.blend,phase=gait.phase;
  d.walkBlend=blend;
  d.body.position.set(Math.sin(phase)*.024*blend,ghost?.25+Math.sin(time*.003+seed)*.12:(1-Math.cos(phase*2))*.018*blend+Math.sin(time*.0018+seed)*.007,0);
  d.body.rotation.set(.035*blend,Math.sin(phase)*.024*blend,-Math.sin(phase)*.018*blend);
  const pose=(name,angle)=>{const joint=d.joints.get(name);if(joint)joint.bone.quaternion.copy(joint.rest).multiply(jointTurn.setFromAxisAngle(joint.axis,angle));};
  for(const side of [-1,1]){
   const swing=Math.sin(phase)*side,lift=Math.max(0,-swing);
   pose('Leg_'+side,swing*.24*blend);
   pose('Knee_'+side,lift*.62*blend);
   pose('Foot_'+side,(-swing*.13-lift*.15)*blend);
   pose('Arm_'+side,-swing*.27*blend);
   pose('Elbow_'+side,(.07+.13*Math.max(0,swing))*blend);
  }
  if(!ghost&&blend>.02){
   root.updateMatrixWorld(true);let lowest=Infinity;
   for(const contact of d.contacts){contactPosition.copy(contact.point);contact.bone.localToWorld(contactPosition);root.worldToLocal(contactPosition);lowest=Math.min(lowest,contactPosition.y);}
   d.body.position.y-=lowest;
  }
 }
 function dispose(root){for(const m of root.userData.materials)m.dispose();const skeletons=new Set();root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose?.();}
 return {ready,create,update,dispose,get loaded(){return !!template;},get error(){return error;}};
}
window.LivModel=createBakedAvatarModel('./assets/models/liv-sd-v7-walk.glb','liv','liv-sd-v7');
window.MayModel=createBakedAvatarModel('./assets/models/may-sd-v2-walk.glb','may','may-sd-v2');
window.MaySchoolModel=createBakedAvatarModel('./assets/models/may-school-sd-v2-walk.glb','may-school','may-school-sd-v2');
window.MinamiPinkModel=createBakedAvatarModel('./assets/models/minami-pink-sd-v2-walk.glb','minami','minami-pink-sd-v2');
window.WoniModel=createBakedAvatarModel('./assets/models/woni-sd-v3-walk.glb','woni','woni-sd-v3');
window.ZenaModel=createBakedAvatarModel('./assets/models/zena-sd-v2-walk.glb','zena','zena-sd-v2');
window.AvatarModels={woni:WoniModel,liv:LivModel,minami:MinamiPinkModel,may:MayModel,'may-school':MaySchoolModel,zena:ZenaModel};
