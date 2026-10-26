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
  // Paint once. All six box faces share one opaque atlas and one draw call.
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,1024,448);
  gradient.addColorStop(0,'#fff5e4');gradient.addColorStop(.5,'#f8faf1');gradient.addColorStop(1,'#f7e7f0');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,448);
  ctx.strokeStyle='#dfd0b9';ctx.lineWidth=3;ctx.strokeRect(16,16,992,416);
  ctx.fillStyle='#d5ede2';ctx.beginPath();ctx.roundRect(393,56,238,420,[119,119,0,0]);ctx.fill();
  ctx.strokeStyle='#fffaf0';ctx.lineWidth=9;ctx.beginPath();ctx.roundRect(414,78,196,402,[98,98,0,0]);ctx.stroke();
  ctx.textAlign='center';ctx.fillStyle='#65586b';ctx.font='600 45px Georgia,serif';ctx.fillText('RESCENE',209,154);
  ctx.font='600 14px sans-serif';ctx.fillStyle='#9d8b8e';ctx.fillText('OUR LITTLE QUIZ GARDEN',209,186);
  ctx.font='600 28px Georgia,serif';ctx.fillStyle='#76627d';ctx.fillText('WITH RE:MINE',815,270);
  ctx.font='13px sans-serif';ctx.fillStyle='#9c8b98';ctx.fillText('A LITTLE MOMENT TOGETHER',815,299);
  function flower(x,y,r,color){
   ctx.fillStyle=color;
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r*.57,y+Math.sin(a)*r*.57,r*.43,r*.43,0,0,Math.PI*2);ctx.fill();}
   ctx.fillStyle='#f5cf80';ctx.beginPath();ctx.arc(x,y,r*.21,0,Math.PI*2);ctx.fill();
  }
  flower(810,140,67,'#e2cde9');flower(122,294,31,'#c9e5d9');flower(286,326,43,'#ebcbd4');
  ctx.fillStyle='#e6d6ef';ctx.fillRect(0,414,1024,14);
  ctx.fillStyle='#dac6b4';ctx.fillRect(0,428,1024,20);
  ctx.fillStyle='#ded3c5';ctx.fillRect(0,448,1024,64);
  const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;
  const geometry=new T.BoxGeometry(12,3.8,.22),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++){
   if(Math.floor(i/4)===4)uv.setXY(i,uv.getX(i),.125+uv.getY(i)*.875);
   else uv.setXY(i,.02,.06);
  }
  geometry.clearGroups();
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture}));
  mesh.name='RESCENE garden backdrop';mesh.position.set(0,2.5,-1.5);
  mesh.userData={triangles:12,drawCalls:1,textureBytes:1024*512*4,staticBackdrop:true};
  return mesh;
 }
 return {create,update,createBackdrop};
})();
