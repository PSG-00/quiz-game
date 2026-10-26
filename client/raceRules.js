(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceRules=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const START={x:0,z:5.5},MAX_QUESTIONS=10;
 function inside(x,z){return x>=-1.65&&x<=1.65&&z>=-2.4&&z<=6.2||x>=-9.2&&x<=9.2&&z>=-5.2&&z<=-1.4;}
 function move(from,to){
  let x=from.x,z=from.z;if(!inside(x,z)){x=START.x;z=START.z;}
  const dx=to.x-x,dz=to.z-z,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  for(let i=0;i<n;i++){const nx=x+dx/n,nz=z+dz/n;if(inside(nx,nz)){x=nx;z=nz;}else if(inside(nx,z))x=nx;else if(inside(x,nz))z=nz;}
  return {x:Number(x.toFixed(2)),z:Number(z.toFixed(2))};
 }
 function gate(x,z){return z<=-1.4&&z>=-5.2?(x<=-8?'O':x>=8?'X':''):'';}
 const quota=count=>count>0?Math.max(1,Math.floor(count/2)):0;
 return {START,MAX_QUESTIONS,inside,move,gate,quota};
});
