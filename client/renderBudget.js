(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RenderBudget=api;})(typeof window!=='undefined'?window:globalThis,()=>({
 pixelRatio(width,height,dpr=1){return Math.min(2,Math.max(.1,dpr||1),Math.sqrt(1600000/Math.max(1,width*height)));}
}));
