/* Merge only after the 19-joint rig is prepared, retaining all skin weights,
 * source normals and each LOD's triangles. Atlas images preserve source sizes. */
window.AvatarAtlas={async merge(asset,gltf){
 const T=THREE,meta=await fetch(asset.replace(/\.glb$/,'.atlas.json')).then(r=>{if(!r.ok)throw Error('Atlas metadata unavailable');return r.json();});
 const textures=await Promise.all(meta.groups.map(g=>new Promise((resolve,reject)=>new T.TextureLoader().load(asset.slice(0,asset.lastIndexOf('/')+1)+g.image,resolve,undefined,reject))));
 const meshes=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});const replacements=[];
 for(let gi=0;gi<meta.groups.length;gi++){
  const group=meta.groups[gi],parts=meshes.filter(m=>group.slots.some(s=>s.material===m.material.name));
  if(parts.length!==group.slots.length)throw Error('Atlas part mismatch');
  const skeleton=parts[0].skeleton;if(parts.some(p=>!p.isSkinnedMesh||p.skeleton!==skeleton))throw Error('Atlas requires shared prepared rig');
  const count=parts.reduce((n,p)=>n+p.geometry.attributes.position.count,0),geometry=new T.BufferGeometry(),arrays={position:new Float32Array(count*3),normal:new Float32Array(count*3),uv:new Float32Array(count*2),skinIndex:new Uint16Array(count*4),skinWeight:new Float32Array(count*4)},indices=[[],[],[]];
  let offset=0;const point=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();
  for(const part of parts){const g=part.geometry,a=g.attributes,slot=group.slots.find(s=>s.material===part.material.name);normalMatrix.getNormalMatrix(part.bindMatrix);
   for(let i=0;i<a.position.count;i++){
    point.fromBufferAttribute(a.position,i).applyMatrix4(part.bindMatrix).toArray(arrays.position,(offset+i)*3);
    normal.fromBufferAttribute(a.normal,i).applyMatrix3(normalMatrix).normalize().toArray(arrays.normal,(offset+i)*3);
    const u=a.uv.getX(i),v=a.uv.getY(i);if(u<-.0001||u>1.0001||v<-.0001||v>1.0001)throw Error('Atlas cannot wrap UVs');
    arrays.uv[(offset+i)*2]=(slot.x+u*slot.w)/group.width;arrays.uv[(offset+i)*2+1]=(slot.y+v*slot.h)/group.height;
    for(let k=0;k<4;k++){arrays.skinIndex[(offset+i)*4+k]=a.skinIndex.array[i*4+k];arrays.skinWeight[(offset+i)*4+k]=a.skinWeight.array[i*4+k];}
   }
   for(let level=0;level<3;level++){const src=level?(g.userData.lodIndices?.[level-1]||g.index):g.index;for(const index of src.array)indices[level].push(index+offset);}offset+=a.position.count;
  }
  for(const [name,array] of Object.entries(arrays))geometry.setAttribute(name,new T.BufferAttribute(array,name==='uv'?2:name.startsWith('skin')?4:3));geometry.setIndex(new T.BufferAttribute(new Uint32Array(indices[0]),1));geometry.userData.lodIndices=indices.slice(1).map(a=>new T.BufferAttribute(new Uint32Array(a),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=parts[0].material.clone(),texture=textures[gi];texture.flipY=false;texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;
  if(group.kind==='basic')material.emissiveMap=texture;else material.map=texture;
  const merged=new T.SkinnedMesh(geometry,material);merged.name='Atlas '+group.kind;merged.bind(skeleton,new T.Matrix4());replacements.push(merged);
 }
 // Commit only after every group validates; keep the prepared original if it fails.
 for(const mesh of meshes)mesh.parent.remove(mesh);for(const mesh of replacements)gltf.scene.add(mesh);
 gltf.scene.userData.atlasProfile={meshes:replacements.length,textures:meta.groups.length,sourceHash:meta.sourceHash,groups:meta.groups};
}};
