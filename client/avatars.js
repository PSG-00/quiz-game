/* Approved member GLBs only. No procedural clay or legacy body geometry. */
window.AvatarActors=(()=>{
 function model(id){return window.AvatarModels?.[id]||window.AvatarModels?.woni;}
 function pending(avatarId){const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData={avatarId,pendingModel:true,body,visualHeight:3.16};return root;}
 function create(seed=0,avatarId='woni'){
  const selected=model(avatarId);selected?.load();return selected?.loaded?selected.create():pending(avatarId);
 }
 function update(root,ghost,moving,time,seed,motion){
  const d=root.userData;d.isGhost=ghost;d.body.visible=!ghost;
  if(ghost&&!d.ghostSprite){const material=new THREE.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false,alphaTest:.01});const sprite=new THREE.Sprite(material);sprite.scale.set(3,3,1);sprite.renderOrder=10;root.add(sprite);d.ghostSprite=sprite;}
  if(d.ghostSprite){d.ghostSprite.visible=ghost;if(ghost){d.ghostSprite.material.map=PixelSprites.createPixelCharTexture(seed%12,Math.floor(time/380)%2,true,THREE);d.ghostSprite.position.set(0,1.28+Math.sin(time*.003+seed)*.12,0);}}
  d.displayHeight=ghost?2.65:(d.visualHeight||2.95);
  if(d.instancedAvatar){InstancedAvatars.update(root,ghost,moving,time,seed,motion);return;}
  if(!ghost&&d.importedGLB)model(d.avatarId).update(root,false,moving,time,seed,motion);
 }
 function dispose(root){root.userData.ghostSprite?.material.dispose();if(root.userData.instancedAvatar)InstancedAvatars.dispose(root);else if(root.userData.importedGLB)model(root.userData.avatarId).dispose(root);}
 return {model,pending,create,update,dispose};
})();
