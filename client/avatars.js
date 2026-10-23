/* Rounded clay characters. Geometry is shared; each avatar owns its materials. */
window.ClayAvatars = (() => {
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const toonGradient=new THREE.DataTexture(new Uint8Array([95,95,95,160,160,160,218,218,218,255,255,255]),4,1,THREE.RGBFormat);toonGradient.minFilter=THREE.NearestFilter;toonGradient.magFilter=THREE.NearestFilter;toonGradient.generateMipmaps=false;toonGradient.needsUpdate=true;
  const palette = [0xf5c85e, 0x4cba90, 0x6dafe4, 0xef93a9, 0x9c85d7, 0xed8e77];
  function create(seed = 0, host = false, avatarId = 'default') {
    if(!host&&window.AvatarModels?.[avatarId]?.loaded)return AvatarModels[avatarId].create();
    const profile=AvatarCatalog.get(avatarId),member=!host&&profile.id!=='default';
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const materials = [];
    const mat = color => {
      const material = member?new THREE.MeshToonMaterial({color:new THREE.Color(color).convertSRGBToLinear(),gradientMap:toonGradient}):new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: .78 });
      material.userData.original = color;
      materials.push(material);
      return material;
    };
    const skin = mat(0xffd9b9), hair = mat(member?profile.hair:seed % 3 === 0 ? 0x694b3d : seed % 3 === 1 ? 0x4e3d39 : 0xdbc08c);
    const clothes = mat(host ? 0x39465f : member?profile.clothes:palette[seed % palette.length]);
    const dark = mat(0x303347), white = mat(0xfffaf0), blush = mat(0xf3a7a2);
    function ball(material, x, y, z, sx, sy, sz, parent = body) {
      const mesh = new THREE.Mesh(sphere, material);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh); return mesh;
    }
    const legs = new THREE.Group(); body.add(legs);
    [-.31, .31].forEach(x => {
      ball(dark, x, .38, 0, .23, .42, .25, legs);
      ball(white, x, .15, .15, .29, .17, .4, legs);
      ball(dark, x, .2, .18, .26, .13, .34, legs);
    });
    ball(clothes, 0, 1.02, 0, member?.49:.65, .65, member?.35:.43);
    [-1, 1].forEach(side => {
      const arm = ball(member&&profile.id==='liv'?white:clothes, side * (member?.53:.65), 1.05, .03, member?.17:.23, .43, member?.2:.25);
      arm.rotation.z = side * .25;
      ball(skin, side * (member?.57:.72), .79, .09, member?.14:.2, member?.16:.2, member?.14:.2);
      ball(skin, side * (member?.71:.77), 1.94, .03, member?.14:.2, .2, .14);
    });
    ball(skin, 0, 1.96, .04, member?.72:.79, member?.75:.78, .66);
    ball(hair, 0, 2.29, -.09, .83, .57, .65);
    for (let i = 0; i < (member?7:5); i++) {
      const x = (i - (member?3:2)) * (member?.19:.28);
      if(!member)ball(hair,x,2.39-Math.abs(x)*.25,.45,.28,.32,.22);
      else{
        const shape=new THREE.Shape(),sweep=profile.id==='zena'?-.12:(x<0?-.04:.04),bottom=2.19+Math.abs(x)*.14;
        shape.moveTo(x-.105,2.65);shape.quadraticCurveTo(x-.14,2.41,x+sweep-.05,bottom+.04);shape.lineTo(x+sweep,bottom);shape.quadraticCurveTo(x+.11,2.39,x+.105,2.65);shape.closePath();
        const strand=new THREE.Mesh(new THREE.ShapeGeometry(shape),hair);strand.position.z=.625-Math.abs(x)*.13;body.add(strand);
      }
    }
    [-.27, .27].forEach(x => {
      if(member){
        ball(white,x,1.98,.63,.17,.135,.05);
        const iris=mat(profile.id==='may'?0x745957:profile.id==='liv'?0x66536c:0x684238);
        ball(iris,x,1.98,.679,.094,.115,.018);ball(dark,x,1.99,.695,.045,.078,.012);
        ball(white,x-.026,2.027,.712,.029,.032,.009);ball(white,x+.035,1.95,.708,.014,.016,.007);
        const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(x-.17,2.025,.67),new THREE.Vector3(x,2.17,.7),new THREE.Vector3(x+.17,2.025,.67));
        body.add(new THREE.Mesh(new THREE.TubeGeometry(curve,10,.018,5,false),dark));
        const brow=ball(hair,x,2.2,.62,.14,.017,.016);brow.rotation.z=x<0?.07:-.07;
      }else{
        ball(dark, x, 1.97, .648, .065, .105, .038);
        ball(white, x - .014, 2.007, .682, .022, .028, .01);
      }
      ball(blush, x * 1.65, 1.76, .58, .11, .055, .025);
    });
    ball(member?mat(0xbc6477):dark, 0, 1.72, .666, .09, .04, .025);
    ball(skin, 0, 1.86, .69, .065, .07, .05);
    if (seed % 6 === 0 && !host && !member) {
      ball(hair, -.67, 2.5, -.25, .33, .34, .33);
      ball(clothes, -.66, 2.5, -.02, .21, .08, .12);
    }
    if (seed % 6 === 1 && !host && !member) {
      ball(clothes, 0, 2.54, -.03, .85, .32, .65);
      ball(clothes, -.18, 2.39, .58, .85, .07, .38);
    }
    if (seed % 6 === 4 && !host && !member) {
      [-.28, .28].forEach(x => {
        const glasses = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 8, 24), dark);
        glasses.position.set(x, 1.99, .71); body.add(glasses);
      });
    }
    if (host) {
      ball(white, 0, 1.16, .41, .18, .4, .04);
      ball(dark, .62, 1.43, .43, .12, .32, .12);
      ball(dark, .62, 1.7, .43, .19, .2, .19);
    } else if(!member) {
      [-.16, .16].forEach(x => ball(white, x, 1.25, .43, .025, .2, .025));
    }
    if(member){
      const style=profile.hairStyle;
      if(style==='long'||style==='headband'){
        ball(hair,0,1.72,-.35,.78,1.02,.34);
        for(const side of [-1,1]){
          ball(hair,side*.67,1.62,.04,.22,.88,.22);
          ball(hair,side*.6,.93,.08,.24,.4,.18);
        }
      }
      if(style==='bob'){
        ball(hair,0,1.99,-.38,.78,.71,.31);
        for(const side of [-1,1]){
          ball(hair,side*.68,2.02,-.04,.27,.64,.26);
          const tip=ball(hair,side*.77,1.51,.06,.27,.16,.25);tip.rotation.z=side*.3;
        }
        ball(hair,.5,2.61,-.34,.32,.36,.29);
      }
      if(style==='high-buns'||style==='low-buns'){
        for(const side of [-1,1]){
          const high=style==='high-buns';
          ball(hair,side*(high?.64:.78),high?2.7:1.87,-.2,high?.35:.34,high?.35:.38,.32);
          ball(hair,side*(high?.66:.8),high?2.84:1.78,-.04,.23,.2,.18);
          const strand=ball(hair,side*.64,1.91,.4,.065,.53,.055);strand.rotation.z=side*.11;
        }
      }
      if(style==='headband'){
        const bandMat=mat(0xc9c5c3),points=[];
        for(let i=0;i<=16;i++){const angle=Math.PI*i/16;points.push(new THREE.Vector3(Math.cos(angle)*.8,2.18+Math.sin(angle)*.7,.08+Math.sin(angle)*.18));}
        const band=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.085,6,false),bandMat);body.add(band);
        ball(bandMat,.19,2.84,.29,.23,.1,.1).rotation.z=.25;
      }
      if(profile.tie){
        for(const side of [-1,1]){const collar=ball(white,side*.18,1.43,.37,.19,.23,.06);collar.rotation.z=side*.45;}
        const tieMat=mat(profile.tie),shape=new THREE.Shape();
        shape.moveTo(0,1.26);shape.lineTo(-.12,1.1);shape.lineTo(-.08,.75);shape.lineTo(0,.65);shape.lineTo(.08,.75);shape.lineTo(.12,1.1);shape.closePath();
        const tie=new THREE.Mesh(new THREE.ShapeGeometry(shape),tieMat);tie.position.z=.47;body.add(tie);
        if(profile.id==='minami')for(const y of [.78,1.05])ball(mat(0xb2adb8),.29,y,.43,.035,.035,.025);
      }else{
        const cuff=mat(0x803b56),stripe=mat(0xc9c6cc);
        for(const side of [-1,1]){ball(cuff,side*.7,.8,.04,.23,.17,.25);ball(stripe,side*.66,1.13,.12,.24,.12,.24);}
        ball(cuff,0,1.51,.06,.32,.11,.31);
      }
      if(profile.id==='woni')for(const x of [-.36,-.12,.12,.36])ball(mat(0xc8dffa),x,1.02,.426,.012,.35,.012);
      if(profile.id==='liv'||profile.id==='may'){
        const silver=mat(0xd9dce5);
        for(const side of [-1,1]){const hoop=new THREE.Mesh(new THREE.TorusGeometry(.09,.018,6,12),silver);hoop.position.set(side*.79,1.73,.24);body.add(hoop);}
      }
    }
    const ghostMat = mat(0xc6b6f2);
    const tail = new THREE.Group(); body.add(tail); tail.visible = false;
    ball(ghostMat, 0, .85, 0, .66, .77, .45, tail);
    for (let i = 0; i < 5; i++) ball(ghostMat, (i - 2) * .24, .34 + (i % 2) * .08, .02, .2, .26, .37, tail);
    root.userData = { body, legs, tail, materials, ghost: null,avatarId:member?profile.id:'default' };
    return root;
  }
  // Reuse the original lavender ghost artwork; hide the entire avatar rather
  // than blending transparent skin, clothing and overlapping hair meshes.
  function updateGhostView(root,ghost,time,seed){
    const data=root.userData;data.isGhost=ghost;
    if(ghost&&!data.ghostSprite){
      const material=new THREE.SpriteMaterial({map:PixelSprites.createPixelCharTexture(seed%12,0,true,THREE),transparent:true,depthWrite:false,depthTest:false,alphaTest:.01});
      const sprite=new THREE.Sprite(material);sprite.scale.set(3,3,1);sprite.renderOrder=10;root.add(sprite);data.ghostSprite=sprite;
    }
    data.body.visible=!ghost;
    if(data.ghostSprite){
      data.ghostSprite.visible=ghost;
      if(ghost){data.ghostSprite.material.map=PixelSprites.createPixelCharTexture(seed%12,Math.floor(time/380)%2,true,THREE);data.ghostSprite.position.set(0,1.28+Math.sin(time*.003+seed)*.12,0);}
    }
    data.displayHeight=ghost?2.65:(data.visualHeight||2.95);
    return ghost;
  }
  function update(root, ghost, moving, time, seed,motion) {
    if(updateGhostView(root,ghost,time,seed))return;
    if(root.userData.importedGLB){AvatarModels[root.userData.avatarId].update(root,ghost,moving,time,seed,motion);return;}
    const data = root.userData;
    if (data.ghost !== ghost) {
      data.ghost = ghost; data.legs.visible = !ghost; data.tail.visible = ghost;
      for (const m of data.materials) {
        m.color.setHex(ghost ? 0xc0adea : m.userData.original).convertSRGBToLinear();
        m.transparent = ghost; m.opacity = ghost ? .64 : 1;
        m.depthWrite = !ghost; m.needsUpdate = true;
      }
    }
    const blend=motion?motion.blend:moving?1:0,phase=motion?motion.phase:time*.01;
    data.body.position.y = ghost ? .26 + Math.sin(time * .003 + seed) * .16 : (1-Math.cos(phase*2))*.035*blend;
    data.legs.rotation.x = ghost?0:Math.sin(phase)*.15*blend;
    data.body.rotation.z=ghost?0:Math.sin(phase)*.025*blend;
  }
  function dispose(root){root.userData.ghostSprite?.material.dispose();if(root.userData.importedGLB){AvatarModels[root.userData.avatarId].dispose(root);return;}const geometry=new Set();root.traverse(item=>{if(item.isMesh&&item.geometry!==sphere)geometry.add(item.geometry);});for(const g of geometry)g.dispose();for(const m of root.userData.materials||[])m.dispose();}
  return { create, update, dispose };
})();
