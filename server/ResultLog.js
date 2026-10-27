// Finished games, one JSON line each, kept for prize hand-out (results.jsonl next to
// the quiz library). Without a file (tests, persistence off) only this process remembers.
const fs=require('node:fs'),path=require('node:path');
const MEMORY_LIMIT=50;
class ResultLog{
 constructor(file){this.file=file;this.memory=[];}
 append(record){
  this.memory.push(record);if(this.memory.length>MEMORY_LIMIT)this.memory.shift();
  if(!this.file)return false;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.appendFileSync(this.file,JSON.stringify(record)+'\n','utf8');return true;
 }
 // Newest first. A damaged line (e.g. power loss mid-write) is skipped, not fatal.
 recent(limit=MEMORY_LIMIT){
  if(!this.file||!fs.existsSync(this.file))return this.memory.slice(-limit).reverse();
  const lines=fs.readFileSync(this.file,'utf8').split('\n'),out=[];
  for(let i=lines.length-1;i>=0&&out.length<limit;i--){if(!lines[i])continue;try{out.push(JSON.parse(lines[i]));}catch{}}
  return out;
 }
}
module.exports={ResultLog};
