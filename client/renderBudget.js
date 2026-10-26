(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RenderBudget=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 // A small increase on both native-DPR and pixel-budget-limited displays.
 // Keep the extra pixel work within 8% of the performance-first baseline.
 const clarityScale=Math.sqrt(1.08),maxPixels=1728000;
 return {
  maxPixels,
  pixelRatio(width,height,dpr=1){return Math.min(2*clarityScale,Math.max(.1,dpr||1)*clarityScale,Math.sqrt(maxPixels/Math.max(1,width*height)));}
 };
});
