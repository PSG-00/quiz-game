(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AvatarMotion=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const tau=Math.PI*2,walkTempo=1.5;
 const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
 function create(seed=0){return {heading:0,targetHeading:0,speed:0,blend:0,phase:(seed*2.39996)%tau,teleporting:false};}
 function advance(state,dt,dx,dz,distance,paused=false){
  dt=Math.max(0,Math.min(.1,dt));
  const speed=!paused&&dt>0?Math.min(9,Math.max(0,distance)/dt):0;
  const moving=speed>.12;
  if(moving&&Math.hypot(dx,dz)>.00001)state.targetHeading=Math.atan2(dx,dz);
  state.heading=wrap(state.heading+wrap(state.targetHeading-state.heading)*(1-Math.exp(-12*dt)));
  state.speed+=(speed-state.speed)*(1-Math.exp(-16*dt));
  state.blend+=((moving?Math.min(1,speed/3):0)-state.blend)*(1-Math.exp(-13*dt));
  if(moving)state.phase=(state.phase+dt*tau*(1.05+.65*Math.min(1,speed/7))*walkTempo)%tau;
  return state;
 }
 return {create,advance,wrap};
});
