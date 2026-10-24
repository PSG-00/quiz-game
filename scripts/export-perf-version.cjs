const fs=require('node:fs'),path=require('node:path');
const variant=process.argv[2];if(!['baseline','lod','webgpu'].includes(variant))throw Error('Expected baseline, lod or webgpu');
const dest=path.resolve('artifacts/perf-versions',variant,'client');fs.mkdirSync(dest,{recursive:true});fs.cpSync('client',dest,{recursive:true});
const file=path.join(dest,'index.html');let html=fs.readFileSync(file,'utf8');
html=html.replace('</head>',`<script>window.PERF_VARIANT=${JSON.stringify(variant)}</script></head>`).replace('</body>','<script src="./performanceHarness.js"></script></body>').replace("if ('serviceWorker' in navigator)","if (false && 'serviceWorker' in navigator)");
fs.writeFileSync(file,html);console.log(dest);
