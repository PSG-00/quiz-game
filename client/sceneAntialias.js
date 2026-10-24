/* Full-resolution PC antialiasing in one screen pass instead of multisampling
   every triangle. The mobile render path remains a direct scene render. */
window.SceneAntialias={create(renderer,enabled){
 const T=THREE;if(!enabled)return {mode:'direct',render:(scene,camera)=>renderer.render(scene,camera)};
 const target=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false});
 target.texture.generateMipmaps=false;target.texture.encoding=T.sRGBEncoding;
 const uniforms=T.UniformsUtils.clone(T.FXAAShader.uniforms);uniforms.tDiffuse.value=target.texture;
 const fragment=T.FXAAShader.fragmentShader;
 const material=new T.ShaderMaterial({uniforms,vertexShader:T.FXAAShader.vertexShader,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false});
 const screen=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),material);quad.frustumCulled=false;screen.add(quad);
 const size=new T.Vector2();let width=0,height=0;
 return {mode:'fxaa',render(scene,viewCamera){
  renderer.getDrawingBufferSize(size);
  if(width!==size.x||height!==size.y){width=size.x;height=size.y;target.setSize(width,height);uniforms.resolution.value.set(1/width,1/height);}
  renderer.setRenderTarget(target);renderer.render(scene,viewCamera);
  // Preserve the main scene counters; renderer.info resets for each render().
  const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
  renderer.setRenderTarget(null);renderer.render(screen,camera);
  renderer.info.render.calls+=calls;renderer.info.render.triangles+=triangles;
 },dispose(){target.dispose();quad.geometry.dispose();material.dispose();}};
}};
