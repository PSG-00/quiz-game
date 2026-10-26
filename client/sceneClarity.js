/* Experimental CAS-derived five-tap sharpening. Not a complete AMD FSR port.
 * Fast sharpen kernel adapted from AMD FidelityFX CAS (MIT):
 * https://github.com/GPUOpen-Effects/FidelityFX-CAS/blob/master/ffx-cas/ffx_cas.h
 * Copyright (c) 2017-2019 Advanced Micro Devices, Inc. See AMD-CAS-LICENSE.txt.
 */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SceneClarity=api;})(typeof window!=='undefined'?window:globalThis,root=>{
 const modes=['off','sharpen','upscale'];
 function mode(value){return modes.includes(value)?value:'off';}
 function scale(value){return mode(value)==='upscale'?.85:1;}
 function create(renderer,initial='off'){
  const T=root.THREE,supported=Boolean(renderer.capabilities.isWebGL2&&renderer.capabilities.precision==='highp');
  let selected=supported?mode(initial):'off',strength=.65,target=null,material=null,triangle=null,screen=null,screenCamera=null;
  let width=0,height=0,failed=false;
  const size=new T.Vector2();
  function release(){if(target){target.dispose();target=null;}width=height=0;}
  function initialize(){
   if(material)return;
   material=new T.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{source:{value:null},texel:{value:new T.Vector2()},amount:{value:strength}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`
      uniform sampler2D source;
      uniform vec2 texel;
      uniform float amount;
      varying vec2 vUv;
      // CAS's documented fast gamma-2 approximation; output returns to display RGB.
      vec3 sampleLinear(vec2 at){vec3 c=texture2D(source,clamp(at,vec2(0.0),vec2(1.0))).rgb;return c*c;}
      void main(){
        vec3 c=sampleLinear(vUv);
        vec3 n=sampleLinear(vUv+vec2(0.0,texel.y));
        vec3 s=sampleLinear(vUv-vec2(0.0,texel.y));
        vec3 w=sampleLinear(vUv-vec2(texel.x,0.0));
        vec3 e=sampleLinear(vUv+vec2(texel.x,0.0));
        float low=min(c.g,min(min(n.g,s.g),min(w.g,e.g)));
        float high=max(c.g,max(max(n.g,s.g),max(w.g,e.g)));
        float adaptive=sqrt(clamp(min(low,1.0-high)/max(high,0.00001),0.0,1.0));
        float weight=-adaptive/6.8;
        vec3 enhanced=clamp((c+(n+s+w+e)*weight)/(1.0+4.0*weight),0.0,1.0);
        gl_FragColor=vec4(sqrt(clamp(mix(c,enhanced,amount),0.0,1.0)),1.0);
      }`
   });
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
   geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,2,0,0,2],2));
   triangle=new T.Mesh(geometry,material);triangle.frustumCulled=false;
   screen=new T.Scene();screen.add(triangle);screenCamera=new T.Camera();
  }
  const api={
   setMode(value){selected=supported&&!failed?mode(value):'off';if(selected==='off')release();return selected;},
   setStrength(value){strength=Math.max(0,Math.min(1,Number.isFinite(value)?value:.65));if(material)material.uniforms.amount.value=strength;},
   render(scene,camera){
    if(selected==='off'){renderer.render(scene,camera);return;}
    const previousTarget=renderer.getRenderTarget();
    try{
     initialize();renderer.getDrawingBufferSize(size);
     const nextWidth=Math.max(1,Math.floor(size.x*scale(selected))),nextHeight=Math.max(1,Math.floor(size.y*scale(selected)));
     if(!target){
      target=new T.WebGLRenderTarget(nextWidth,nextHeight,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false});
      // Preserve the game's display-space blending/background exactly. CAS reads
      // raw encoded RGBA8 rather than hardware-decoded sRGB samples.
      target.texture.encoding=T.sRGBEncoding;target.texture.internalFormat='RGBA8';target.texture.generateMipmaps=false;
      width=nextWidth;height=nextHeight;
     }else if(width!==nextWidth||height!==nextHeight){width=nextWidth;height=nextHeight;target.setSize(width,height);}
     material.uniforms.source.value=target.texture;material.uniforms.texel.value.set(1/width,1/height);
     renderer.setRenderTarget(target);renderer.render(scene,camera);
     const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles,points=renderer.info.render.points,lines=renderer.info.render.lines;
     renderer.setRenderTarget(previousTarget);renderer.render(screen,screenCamera);
     renderer.info.render.calls+=calls;renderer.info.render.triangles+=triangles;renderer.info.render.points+=points;renderer.info.render.lines+=lines;
    }catch(error){
     failed=true;selected='off';release();renderer.setRenderTarget(previousTarget);
     console.warn('선명도 실험 비활성화:',error);renderer.render(scene,camera);api.onFallback?.(error);
    }
   },
   stats(){renderer.getDrawingBufferSize(size);return {mode:selected,supported,failed,inputWidth:target?width:size.x,inputHeight:target?height:size.y,outputWidth:size.x,outputHeight:size.y,targetCount:target?1:0,extraDraws:selected==='off'?0:1,strength};},
   dispose(){selected='off';release();if(material){triangle.geometry.dispose();material.dispose();material=triangle=screen=screenCamera=null;}}
  };
  return api;
 }
 return {create,mode,scale};
});
