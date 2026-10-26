(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RenderBudget=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 // A small increase on both native-DPR and pixel-budget-limited displays.
 // Keep the extra pixel work within 8% of the performance-first baseline.
 const clarityScale=Math.sqrt(1.08),maxPixels=1728000;
 return {
  maxPixels,
  pixelRatio(width,height,dpr=1){
   const query=typeof location!=='undefined'?new URLSearchParams(location.search):null;
   const crisp=query?.get('model')==='compact'&&query.get('quality')==='crisp';
   // Separate A/B option: +20% pixel work, with no sharpening/MSAA pass.
   const gain=crisp?Math.sqrt(1.2):1;
   return Math.min(2*clarityScale*gain,Math.max(.1,dpr||1)*clarityScale*gain,Math.sqrt(maxPixels*gain*gain/Math.max(1,width*height)));
  }
 };
});
