/* Floating simple SD players on mobile. Living remotes share three instanced
   draws; the local avatar and the existing ghost appearance stay independent. */
window.MobileCrowd=(()=>{
 const T=THREE,capacity=128,palette={default:0xf3cf7c,woni:0x9eade8,liv:0xefacc3,minami:0x7bd6c5,may:0x8fb9eb,'may-school':0xc5ace7,zena:0xeb9c91};
 const free=[],live=new Set(),zero=new T.Matrix4().makeScale(0,0,0);
 const local=new T.Object3D(),matrix=new T.Matrix4(),base=new T.Matrix4();
 let batches=null,nextSlot=0,dirty=false;
 function attach(scene){
  if(batches)return;
  const headGeometry=new T.SphereGeometry(1,12,8),bodyGeometry=new T.ConeGeometry(.58,1.4,8,1),eyeGeometry=new T.SphereGeometry(1,6,4);
  bodyGeometry.rotateZ(Math.PI);
  const make=(geometry,material,count)=>{
   const mesh=new T.InstancedMesh(geometry,material,count);mesh.count=0;mesh.frustumCulled=false;
   // Allocate colors before the first shader compile (the lobby renders first).
   mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(count*3).fill(1),3);
   mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.name='Mobile simple SD crowd';scene.add(mesh);return mesh;
  };
  batches={head:make(headGeometry,new T.MeshLambertMaterial({color:0xffffff}),capacity),body:make(bodyGeometry,new T.MeshLambertMaterial({color:0xffffff}),capacity),eyes:make(eyeGeometry,new T.MeshBasicMaterial({color:0x252638}),capacity*2)};
 }
 function create(id,seed){
  if(!batches)throw new Error('Attach the mobile crowd before creating players');
  const slot=free.length?free.pop():nextSlot++;
  if(slot>=capacity)throw new Error('Mobile crowd capacity exceeded');
  const root=new T.Group(),color=new T.Color(palette[id.replace(/-(plana|chibi)$/,'')]||palette.default),hsl={};color.getHSL(hsl);
  color.setHSL(hsl.h+((seed%5)-2)*.012,hsl.s,Math.min(.84,hsl.l+((seed%3)-1)*.035));
  batches.body.setColorAt(slot,color.convertSRGBToLinear());batches.head.setColorAt(slot,new T.Color(0xffebdd).convertSRGBToLinear());
  batches.body.instanceColor.needsUpdate=true;batches.head.instanceColor.needsUpdate=true;
  batches.head.setMatrixAt(slot,zero);batches.body.setMatrixAt(slot,zero);batches.eyes.setMatrixAt(slot*2,zero);batches.eyes.setMatrixAt(slot*2+1,zero);dirty=true;
  batches.head.count=batches.body.count=nextSlot;batches.eyes.count=nextSlot*2;
  root.userData={mobileProxy:true,simpleSD:true,avatarId:id,seed,slot,visible:false,ghostSprite:null,visualHeight:3.16,displayHeight:3.16};
  live.add(root);return root;
 }
 function hide(root){
  const d=root.userData;if(!d.visible)return;
  batches.head.setMatrixAt(d.slot,zero);batches.body.setMatrixAt(d.slot,zero);batches.eyes.setMatrixAt(d.slot*2,zero);batches.eyes.setMatrixAt(d.slot*2+1,zero);d.visible=false;dirty=true;
 }
 function put(mesh,slot,x,y,z,sx,sy,sz,roll=0){
  local.position.set(x,y,z);local.scale.set(sx,sy,sz);local.rotation.set(0,0,roll);local.updateMatrix();matrix.multiplyMatrices(base,local.matrix);mesh.setMatrixAt(slot,matrix);
 }
 function update(root,ghost,heading,now,motion){
  const d=root.userData;d.displayHeight=ghost?2.65:3.16;
  if(ghost){
   hide(root);root.rotation.y=0;
   if(!d.ghostSprite){d.ghostSprite=new T.Sprite(new T.SpriteMaterial({transparent:true,alphaTest:.03,depthWrite:false}));d.ghostSprite.scale.set(3,3,1);root.add(d.ghostSprite);}
   d.ghostSprite.visible=true;d.ghostSprite.material.map=PixelSprites.createPixelCharTexture(d.seed%12,Math.floor(now/380)%2,true,T);d.ghostSprite.position.y=1.28+Math.sin(now*.003+d.seed)*.12;return;
  }
  if(d.ghostSprite)d.ghostSprite.visible=false;
  root.rotation.y=heading;root.updateWorldMatrix(true,false);base.copy(root.matrixWorld);
  const bob=Math.sin(now*.0025+d.seed)*.055,roll=motion?Math.sin(motion.phase)*.035*motion.blend:0;
  put(batches.body,d.slot,0,.93+bob,0,1,1,1,roll);put(batches.head,d.slot,0,2.47+bob,0,.62,.62,.62);
  put(batches.eyes,d.slot*2,-.20,2.51+bob,.582,.055,.075,.035);put(batches.eyes,d.slot*2+1,.20,2.51+bob,.582,.055,.075,.035);
  d.visible=true;dirty=true;
 }
 function flush(){if(!dirty||!batches)return;for(const mesh of Object.values(batches))mesh.instanceMatrix.needsUpdate=true;dirty=false;}
 function dispose(root){if(!live.delete(root))return;hide(root);free.push(root.userData.slot);root.userData.ghostSprite?.material.dispose();}
 function stats(){return {style:'floating-simple-sd',players:live.size,batches:batches?3:0,trianglesPerPlayer:batches?(batches.head.geometry.index.count+batches.body.geometry.index.count+2*batches.eyes.geometry.index.count)/3:0};}
 return {attach,create,update,hide,flush,dispose,stats};
})();
