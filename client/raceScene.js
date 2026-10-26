window.RaceScene={create(scene,y){
 const T=THREE,root=new T.Group();root.name='OX race T corridor';root.visible=false;scene.add(root);
 function merged(boxes){const arrays=[],colors=[];for(const [w,h,d,x,py,z,color] of boxes){const indexed=new T.BoxGeometry(w,h,d),g=indexed.toNonIndexed();indexed.dispose();g.translate(x,py,z);arrays.push(g.attributes.position.array);const c=new T.Color(color).convertSRGBToLinear(),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<g.attributes.position.count;i++)c.toArray(a,i*3);colors.push(a);g.dispose();}const length=arrays.reduce((n,a)=>n+a.length,0),positions=new Float32Array(length),rgb=new Float32Array(length);let offset=0;for(let i=0;i<arrays.length;i++){positions.set(arrays[i],offset);rgb.set(colors[i],offset);offset+=arrays[i].length;}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('color',new T.BufferAttribute(rgb,3));g.computeVertexNormals();const mesh=new T.Mesh(g,new T.MeshLambertMaterial({vertexColors:true}));root.add(mesh);}
 merged([[4,.4,7.6,0,y-.2,2.8,0xf3f4ee],[9.6,.4,4.6,-4.8,y-.2,-3.3,0x7ad7bc],[9.6,.4,4.6,4.8,y-.2,-3.3,0xf5a0a0],[20,.2,3,0,-.1,9.8,0xe5dcef]]);
 merged([[19.6,2.5,.24,0,y+1.25,-5.6,0xf6ecd9],[.24,2.5,4.6,-9.6,y+1.25,-3.3,0xf6ecd9],[.24,2.5,4.6,9.6,y+1.25,-3.3,0xf6ecd9],[7.6,1.05,.24,-5.8,y+.525,-1,0xefe8df],[7.6,1.05,.24,5.8,y+.525,-1,0xefe8df],[.24,1.05,7.6,-2,y+.525,2.8,0xefe8df],[.24,1.05,7.6,2,y+.525,2.8,0xefe8df]]);
 function label(text,x,py,z,color,w,h){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff';ctx.font='bold 72px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,68);const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true}));sprite.position.set(x,py,z);sprite.scale.set(w,h,1);root.add(sprite);}
 label('← O     X →',0,y+3.2,-5.4,'#546b66',4.2,1.05);label('O',-8.6,y+2.6,-3.3,'#399c80',2.1,.9);label('X',8.6,y+2.6,-3.3,'#d4787c',2.1,.9);label('START',0,y+.1,5.5,'#798d9b',1.9,.48);
 const focus=new T.Vector3();let initialized=false;
 return {root,reset(){initialized=false;},camera(camera,target,dt){
  camera.clearViewOffset();
  if(target?.onStage){const next=new T.Vector3(target.x,y,target.z);if(!initialized||focus.distanceTo(next)>5){focus.copy(next);initialized=true;}else focus.lerp(next,1-Math.exp(-9*dt));camera.position.set(focus.x,y+6.1,focus.z+8.3);camera.lookAt(focus.x,y+1.4,focus.z-3.5);}
  else{camera.position.set(0,y+17,21);camera.lookAt(0,y,-.5);initialized=false;}
  camera.updateMatrixWorld(true);
 }};
}};
