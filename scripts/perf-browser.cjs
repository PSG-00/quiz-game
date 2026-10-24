const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/psg00/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu']}),reports=[];try{
 for(const mode of (process.env.PERF_DEVICES||'laptop,mobile-layout').split(','))for(const variant of (process.env.PERF_VARIANTS||'baseline,lod,webgpu').split(',')){
  const mobile=mode==='mobile-layout',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],warnings=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});
  await page.goto('http://localhost:3105/perf/'+variant+'/?benchmark=100');
  await page.waitForFunction(()=>window.PerfCompare?.ready,{},{timeout:120000});
  const report=await page.evaluate(()=>PerfCompare.measure(8000));report.mode=mode;report.errors=errors;report.warnings=warnings;reports.push(report);
  await page.screenshot({path:'artifacts/perf-'+variant+'-'+mode+'.png'});fs.writeFileSync(process.env.PERF_REPORT||'artifacts/perf-comparison.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(report));await context.close();if(errors.length)throw Error('Browser errors in '+variant);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
