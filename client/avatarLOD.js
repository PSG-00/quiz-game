window.AvatarLOD={async load(asset,gltf){
 const [meta,buffer]=await Promise.all([fetch(asset+'.lod.json').then(r=>{if(!r.ok)throw Error('LOD metadata missing');return r.json();}),fetch(asset+'.lod.bin').then(r=>{if(!r.ok)throw Error('LOD indices missing');return r.arrayBuffer();})]);
 gltf.scene.traverse(o=>{if(!o.isMesh)return;const a=gltf.parser.associations.get(o),mesh=a?.type==='nodes'?gltf.parser.json.nodes[a.index].mesh:a?.meshes,entry=meta.entries.find(e=>e.mesh===mesh&&e.primitive===(a?.primitives||0));if(entry)o.geometry.userData.lodIndices=entry.levels.map(l=>new THREE.BufferAttribute(new Uint32Array(buffer,l.offset,l.count),1));});
},level(root,camera,height){
 const d=root.userData,position=root.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse),pixels=(d.visualHeight||3.16)*(root.scale?.y??1)*height/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(.1,-position.z)),previous=d.lodLevel;
 const threshold=previous===0?152:168,lowThreshold=previous===2?88:72;
 return d.lodLevel=pixels>=threshold?0:pixels>=lowThreshold?1:2;
}};
