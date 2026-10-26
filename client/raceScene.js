window.RaceScene={create(scene,y){
 const T=THREE,root=new T.Group();root.name='OX race T corridor';root.visible=false;scene.add(root);
 function merged(boxes){const arrays=[],colors=[];for(const [w,h,d,x,py,z,color] of boxes){const indexed=new T.BoxGeometry(w,h,d),g=indexed.toNonIndexed();indexed.dispose();g.translate(x,py,z);arrays.push(g.attributes.position.array);const c=new T.Color(color).convertSRGBToLinear(),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<g.attributes.position.count;i++)c.toArray(a,i*3);colors.push(a);g.dispose();}const length=arrays.reduce((n,a)=>n+a.length,0),positions=new Float32Array(length),rgb=new Float32Array(length);let offset=0;for(let i=0;i<arrays.length;i++){positions.set(arrays[i],offset);rgb.set(colors[i],offset);offset+=arrays[i].length;}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('color',new T.BufferAttribute(rgb,3));g.computeVertexNormals();const mesh=new T.Mesh(g,new T.MeshLambertMaterial({vertexColors:true}));root.add(mesh);}
 // The straight run is 6 units longer. Camera-facing walls in the O/X arms
 // are omitted so they never hide runners or the floor signs.
 merged([[4,.4,13.6,0,y-.2,-.2,0xf3f4ee],[9.6,.4,4.6,-4.8,y-.2,-9.3,0x7ad7bc],[9.6,.4,4.6,4.8,y-.2,-9.3,0xf5a0a0],[20,.2,3,0,-.1,9.8,0xe5dcef]]);
 merged([[19.6,4,.24,0,y+2,-11.6,0xf6ecd9],[.24,4,4.6,-9.6,y+2,-9.3,0xf6ecd9],[.24,4,4.6,9.6,y+2,-9.3,0xf6ecd9],[.24,1.05,13.6,-2,y+.525,-.2,0xefe8df],[.24,1.05,13.6,2,y+.525,-.2,0xefe8df]]);
 function canvasPlane(canvas,w,h,x,py,z,floor=false){const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.01}));mesh.position.set(x,py,z);if(floor)mesh.rotation.x=-Math.PI/2;root.add(mesh);return mesh;}
 function floorLabel(text,x,z,color){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.beginPath();ctx.arc(128,128,115,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=7;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 154px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,138);canvasPlane(c,2,2,x,y+.025,z,true);}
 function portal(x,color){
  // Two static canvas planes: no particles, dynamic lights or postprocessing.
  const c=document.createElement('canvas');c.width=384;c.height=512;const ctx=c.getContext('2d');
  const arch=()=>{ctx.beginPath();ctx.moveTo(65,470);ctx.lineTo(65,175);ctx.bezierCurveTo(65,17,319,17,319,175);ctx.lineTo(319,470);ctx.closePath();};
  arch();const glow=ctx.createLinearGradient(0,40,0,470);glow.addColorStop(0,'#182b50');glow.addColorStop(.6,color);glow.addColorStop(1,'#e7fffc');ctx.fillStyle=glow;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=23;ctx.shadowColor=color;ctx.shadowBlur=27;ctx.stroke();ctx.shadowBlur=0;
  ctx.save();arch();ctx.clip();ctx.strokeStyle='rgba(237,255,255,.55)';ctx.lineWidth=3;for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(192,270,50+i*24,90+i*28,-.25,0,Math.PI*2);ctx.stroke();}ctx.restore();arch();ctx.strokeStyle='#f1fffe';ctx.lineWidth=5;ctx.stroke();
  canvasPlane(c,2.8,3.9,x,y+1.96,-11.45);
 }
 portal(-8.2,'#67efd0');portal(8.2,'#ff8eb1');floorLabel('O',-8.2,-9.65,'#338c77');floorLabel('X',8.2,-9.65,'#bf637c');
 const directions=document.createElement('canvas');directions.width=512;directions.height=128;const directionsCtx=directions.getContext('2d');directionsCtx.fillStyle='#546b66';directionsCtx.fillRect(0,0,512,128);directionsCtx.fillStyle='#fff';directionsCtx.font='bold 72px sans-serif';directionsCtx.textAlign='center';directionsCtx.textBaseline='middle';directionsCtx.fillText('O ←    → X',256,68);canvasPlane(directions,3.5,.9,0,y+.03,-8.2,true);
 const focus=new T.Vector3();let initialized=false;
 return {root,reset(){initialized=false;},camera(camera,target,dt){
  camera.clearViewOffset();
  if(target?.onStage){const next=new T.Vector3(target.x,y,target.z);if(!initialized||focus.distanceTo(next)>5){focus.copy(next);initialized=true;}else focus.lerp(next,1-Math.exp(-9*dt));camera.position.set(focus.x,y+8.2,focus.z+12);camera.lookAt(focus.x,y+1.4,focus.z-2.5);}
  else{camera.position.set(0,y+17,21);camera.lookAt(0,y,-.5);initialized=false;}
  camera.updateMatrixWorld(true);
 }};
}};
