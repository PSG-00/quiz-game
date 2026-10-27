window.AvatarPicker=(()=>{
 let selectedId='woni',previewRenderer,previewScene,previewCamera,previewModel,frame;
 function init(){
  try{selectedId=AvatarCatalog.normalize(localStorage.getItem('ox-avatar-v1'));}catch{}
  const cards=document.getElementById('avatar-options');
  if(AvatarCatalog.get(selectedId).hidden)selectedId='woni';
  if(new URLSearchParams(location.search).get('test')==='plana')selectedId='plana-original';
  try{localStorage.setItem('ox-avatar-v1',selectedId);}catch{}
  for(const profile of AvatarCatalog.profiles.filter(p=>!p.hidden))cards.append(makeOption(profile,profile.name));
  document.getElementById('avatar-dialog').addEventListener('close',()=>{cancelAnimationFrame(frame);frame=null;});
  window.addEventListener('avatar-model-ready',event=>{if(selectedId===event.detail.avatarId&&document.getElementById('avatar-dialog').open)updateModel();});
  sync();
 }
 function makeOption(profile,label){
   const button=document.createElement('button');button.type='button';button.className='avatar-option';button.dataset.avatarId=profile.id;button.setAttribute('aria-label',label+' 아바타');button.title=profile.description;button.onclick=()=>choose(profile.id);
   const img=document.createElement('img');img.src=profile.preview||'./assets/avatars/'+profile.id+'_focus.png';img.alt='';img.loading='lazy';button.append(img);
   const name=document.createElement('span');name.className='avatar-option-name';name.textContent=label;button.append(name);
   return button;
 }
 function sync(){
  const profile=AvatarCatalog.get(selectedId);
  document.getElementById('selected-avatar-name').textContent=profile.name;
  document.getElementById('avatar-preview-name').textContent=profile.name;
  document.getElementById('avatar-preview-description').textContent=profile.description;
  for(const button of document.querySelectorAll('.avatar-option')){const chosen=button.dataset.avatarId===selectedId;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));}
 }
 function choose(id){
  selectedId=AvatarCatalog.normalize(id);
  try{localStorage.setItem('ox-avatar-v1',selectedId);}catch{}
  sync();updateModel();
 }
 function updateModel(){
  if(!previewScene)return;
  if(previewModel){previewScene.remove(previewModel);AvatarActors.dispose(previewModel);}
  previewModel=AvatarActors.create(0,selectedId);previewScene.add(previewModel);
  document.getElementById('avatar-preview-description').textContent=previewModel.userData.pendingModel?'캐릭터 불러오는 중…':AvatarCatalog.get(selectedId).description;
 }
 function open(){
  const dialog=document.getElementById('avatar-dialog');dialog.showModal();
  const canvas=document.getElementById('avatar-preview-canvas');
  if(!previewRenderer){
   previewRenderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,2));previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
   previewScene=new THREE.Scene();previewScene.add(new THREE.AmbientLight(0xffffff,.55*Math.PI));const key=new THREE.DirectionalLight(0xfff9f4,.75*Math.PI);key.position.set(-3,6,7);previewScene.add(key);
   previewCamera=new THREE.OrthographicCamera(-2,2,1.85,-1.85,.1,100);previewCamera.position.set(0,2.6,7);previewCamera.lookAt(0,1.5,0);
   const floor=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,.12,36),new THREE.MeshStandardMaterial({color:new THREE.Color(0xe2d6c1).convertSRGBToLinear()}));floor.position.y=-.05;previewScene.add(floor);
  }
  updateModel();
  document.querySelector('.avatar-option.selected')?.scrollIntoView({block:'nearest',inline:'nearest'});
  function animate(time){
   if(!dialog.open)return;
   const width=canvas.clientWidth,height=canvas.clientHeight;
   if(canvas.width!==Math.round(width*previewRenderer.getPixelRatio())||canvas.height!==Math.round(height*previewRenderer.getPixelRatio()))previewRenderer.setSize(width,height,false);
   const halfW=1.8*width/height;previewCamera.left=-halfW;previewCamera.right=halfW;previewCamera.updateProjectionMatrix();
   previewModel.rotation.y=Math.sin(time*.0006)*.28;
   AvatarActors.update(previewModel,false,false,time,0);previewRenderer.render(previewScene,previewCamera);frame=requestAnimationFrame(animate);
  }
  cancelAnimationFrame(frame);frame=requestAnimationFrame(animate);
 }
 return {init,open,selected:()=>selectedId};
})();
