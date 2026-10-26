/* Dedicated low-poly MC: one merged, vertex-colored body and one face atlas.
   No skeleton, downloaded model, per-part draws or real-time shadow pass. */
window.ShowHost=(()=>{
 const T=THREE;
 function create(){
  const parts=[],matrix=new T.Matrix4(),object=new T.Object3D();
  function part(geometry,color,x,y,z,sx=1,sy=1,sz=1,rz=0){
   object.position.set(x,y,z);object.scale.set(sx,sy,sz);object.rotation.set(0,0,rz);object.updateMatrix();matrix.copy(object.matrix);
   const g=geometry.index?geometry.toNonIndexed():geometry;g.applyMatrix4(matrix);
   parts.push({geometry:g,color:new T.Color(color).convertSRGBToLinear()});if(g!==geometry)geometry.dispose();
  }
  function block(w,h,d,color,x,y,z,rz=0){
   const r=Math.min(w,h)*.15,shape=new T.Shape();
   shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.lineTo(w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.lineTo(w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.lineTo(-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.closePath();
   const geometry=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1,curveSegments:1});geometry.translate(0,0,-d/2);part(geometry,color,x,y,z,1,1,1,rz);
  }
  const cream=0xffedce,mint=0x65cdb9,dark=0x364758,gold=0xeab55c;
  block(.77,.72,.46,cream,0,1.35,0);block(.55,.12,.49,mint,0,1.05,0);
  block(.25,.25,.10,gold,0,1.40,.27,Math.PI/4);
  for(const side of [-1,1]){
   block(.19,.39,.22,dark,side*.23,.70,0);block(.36,.17,.48,mint,side*.23,.43,.08);
   block(.17,.57,.23,mint,side*.50,1.32,0,side*.16);block(.23,.23,.26,cream,side*.55,1.03,.02);
   block(.16,.30,.31,gold,side*.70,2.18,0);
  }
  part(new T.CylinderGeometry(.14,.14,.18,8),dark,0,1.83,0);
  block(1.24,.84,.64,cream,0,2.27,0);
  block(1.08,.65,.05,dark,0,2.28,.343);
  part(new T.CylinderGeometry(.035,.035,.20,6),dark,0,2.79,0);
  part(new T.OctahedronGeometry(.105,0),gold,0,2.96,0);
  // Small handheld microphone, merged into the same body draw.
  part(new T.CylinderGeometry(.037,.037,.36,6),dark,.57,1.25,.20,1,1,1,-.18);
  part(new T.IcosahedronGeometry(.095,0),dark,.60,1.46,.20);
  let count=0;for(const p of parts)count+=p.geometry.attributes.position.count;
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3);let offset=0;
  for(const p of parts){const pos=p.geometry.attributes.position,n=p.geometry.attributes.normal;positions.set(pos.array,offset*3);normals.set(n.array,offset*3);for(let i=0;i<pos.count;i++)p.color.toArray(colors,(offset+i)*3);offset+=pos.count;p.geometry.dispose();}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.computeBoundingSphere();
  const root=new T.Group(),body=new T.Group();root.add(body);
  const mesh=new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true}));mesh.name='Low-poly MC body';body.add(mesh);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
  for(let frame=0;frame<4;frame++){
   const x=frame*128;ctx.fillStyle='#243442';ctx.fillRect(x,0,128,128);ctx.strokeStyle='#8cf1d7';ctx.fillStyle='#8cf1d7';ctx.lineWidth=5;ctx.lineCap='round';
   for(const eye of [40,88]){ctx.beginPath();if(frame===1){ctx.moveTo(x+eye-8,50);ctx.lineTo(x+eye+8,50);ctx.stroke();}else{ctx.ellipse(x+eye,49,7,frame===2?11:15,0,0,Math.PI*2);ctx.fill();}}
   ctx.beginPath();if(frame===2){ctx.ellipse(x+64,83,8,12,0,0,Math.PI*2);ctx.fill();}else{ctx.arc(x+64,73,15,.15*Math.PI,.85*Math.PI);ctx.stroke();}
   ctx.fillStyle='#eab55c';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('MC',x+64,115);
  }
  const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.repeat.set(.25,1);texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;
  const face=new T.Mesh(new T.PlaneGeometry(.93,.52),new T.MeshBasicMaterial({map:texture}));face.position.set(0,2.28,.374);body.add(face);
  root.userData={showHost:true,body,face,texture,lastFrame:-1,triangles:count/3+2,drawCalls:2,visualHeight:3.065};return root;
 }
 function update(root,time,state){const d=root.userData,talking=['QUESTION','JUDGE','COUNTDOWN','ENDED'].includes(state);const blink=time%4200>4050;const frame=blink?1:talking&&Math.floor(time/240)%2?2:0;if(frame!==d.lastFrame){d.texture.offset.x=frame*.25;d.lastFrame=frame;}d.body.position.y=Math.sin(time*.0018)*.018;d.body.rotation.z=Math.sin(time*.0012)*.012;}
 function createBackdrop(){
  // One opaque atlas; the approved photograph is drawn once without stretching.
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e5d9c8';ctx.fillRect(0,0,1024,1024);
  const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;
  const image=new Image();image.decoding='async';
  image.onload=()=>{
    // Fill the entire front face. The 3:2 box restores the photo's aspect ratio.
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    texture.needsUpdate=true;mesh.userData.imageLoaded=true;
  };
  const geometry=new T.BoxGeometry(3,2,.22),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++){
    if(Math.floor(i/4)!==4)uv.setXY(i,.002,.998);
  }
  geometry.clearGroups();
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture}));
  mesh.name='RESCENE member photo backdrop';mesh.position.set(0,4.1,-1.5);
  mesh.userData={triangles:12,drawCalls:1,textureBytes:1024*1024*4,staticBackdrop:true,imageLoaded:false};
  image.src='./assets/stage/rescene-quiz-members-v2.webp';
  return mesh;
 }
 function layoutBackdrop(mesh,compact){
  const height=compact?7:6.6;
  mesh.scale.set(height/2,height/2,1);
  mesh.position.y=.6+height/2;
  mesh.userData.layout=compact?'mobile':'desktop';
 }
 return {create,update,createBackdrop,layoutBackdrop};
})();
