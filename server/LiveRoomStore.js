// Running games survive a process restart (deploy, crash, PM2 memory restart):
// rooms are written atomically and restored with every seat held for resume.
const fs=require('node:fs'),path=require('node:path');
class LiveRoomStore{
 constructor(file){this.file=file;this.lastRooms=null;}
 load(){
  if(!this.file||!fs.existsSync(this.file))return null;
  try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}
  catch(error){console.error('LIVE_ROOMS_LOAD_FAILED',error.message);return null;}
 }
 save(snapshot){
  if(!this.file)return false;
  const rooms=JSON.stringify(snapshot.rooms);
  // Idle servers do not rewrite an unchanged empty list every interval.
  if(!snapshot.rooms.length&&rooms===this.lastRooms)return false;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  const tmp=this.file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(snapshot),'utf8');fs.renameSync(tmp,this.file);
  this.lastRooms=rooms;return true;
 }
}
module.exports={LiveRoomStore};
