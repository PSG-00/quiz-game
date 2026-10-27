/* Unedited user-supplied PLANA export. No LOD, decimation, atlas, re-rigging,
 * texture downsampling or invented walking clip. Only whole-model fit/placement. */
window.PlanaOriginalModel=(()=>{
 let template=null,promise=null,error=null;
 function load(){return promise||(promise=new Promise(resolve=>{
  new THREE.GLTFLoader().load('./assets/models/plana-original-test.glb',gltf=>{
   // This source carries 100+ dormant facial morphs. All exported morph weights
   // are zero: drop only the in-memory morph inputs (three.js enables morphing from
   // geometry since r129), retaining the original GLB and vertex data.
   const materials=new Map();gltf.scene.traverse(o=>{if(!o.isMesh)return;const source=o.material;
    o.geometry.morphAttributes={};o.morphTargetInfluences=undefined;o.morphTargetDictionary=undefined;
    // Blender's emission-only export drops PNG alpha on eye/line layers.
    // Read the same unchanged RGBA image as an unlit map, including its alpha.
    if(!materials.has(source)){
     const m=source.emissiveMap?new THREE.MeshBasicMaterial({map:source.emissiveMap,color:source.emissive,side:source.side}):source.clone();
     m.alphaTest=.01;m.transparent=false;m.depthWrite=true;materials.set(source,m);
    }o.material=materials.get(source);
   });
   template=gltf.scene;const box=new THREE.Box3().setFromObject(template),scale=3.16/(box.max.y-box.min.y);template.scale.setScalar(scale);template.position.y=-box.min.y*scale;
   template.updateMatrixWorld(true);resolve(true);window.dispatchEvent(new CustomEvent('avatar-model-ready',{detail:{avatarId:'plana-original'}}));
  },undefined,e=>{error=e;console.error('PLANA 원본 로딩 실패',e);resolve(false);});
 }));}
 function create(){if(!template)return null;const root=new THREE.Group(),body=THREE.SkeletonUtils.clone(template);root.add(body);root.userData={avatarId:'plana-original',body,importedGLB:true,originalPlana:true,visualHeight:3.16,displayHeight:3.16};return root;}
 function update(){} // Source contains SunAction only, no character walk clip.
 function dispose(root){const skeletons=new Set();root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const s of skeletons)s.dispose?.();}
 return {load,create,update,dispose,poseFrames:0,fullDetail:true,get loaded(){return !!template;},get ready(){return load();},get error(){return error;}};
})();
