(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceRules=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const START={x:0,z:5.5},MAX_QUESTIONS=10,JUNCTION_Z=-9.3,FRONT_Z=-7.4,MIN_Z=-11.2,PORTAL_Z=-10.6;
 function inside(x,z){return x>=-1.65&&x<=1.65&&z>=-8.4&&z<=6.2||x>=-9.2&&x<=9.2&&z>=MIN_Z&&z<=FRONT_Z;}
 function move(from,to){
  let x=from.x,z=from.z;if(!inside(x,z)){x=START.x;z=START.z;}
  const dx=to.x-x,dz=to.z-z,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  for(let i=0;i<n;i++){const nx=x+dx/n,nz=z+dz/n;if(inside(nx,nz)){x=nx;z=nz;}else if(inside(nx,z))x=nx;else if(inside(x,nz))z=nz;}
  return {x:Number(x.toFixed(2)),z:Number(z.toFixed(2))};
 }
 function gate(x,z){return z<=-10.2&&z>=MIN_Z?(x<=-7.2?'O':x>=7.2?'X':''):'';}
 const quota=count=>count>0?Math.max(1,Math.floor(count/2)):0;
 return {START,MAX_QUESTIONS,JUNCTION_Z,FRONT_Z,MIN_Z,PORTAL_Z,inside,move,gate,quota};
});
