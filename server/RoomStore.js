const fs = require('fs');
const path = require('path');
class RoomStore {
  constructor(file) { this.file=file; }
  load() {
    if(!this.file||!fs.existsSync(this.file))return [];
    let document;
    try{document=JSON.parse(fs.readFileSync(this.file,'utf8'));}
    catch(error){if(fs.existsSync(this.file+'.bak'))document=JSON.parse(fs.readFileSync(this.file+'.bak','utf8'));else throw new Error('저장된 방 파일을 읽을 수 없습니다. 원본 파일을 보존했습니다.',{cause:error});}
    if(document.version!==1||!Array.isArray(document.rooms))throw new Error('지원하지 않는 방 저장 형식입니다.');
    return document.rooms;
  }
  save(rooms) {
    if(!this.file)return;
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temporary=this.file+'.tmp';
    const payload=JSON.stringify({version:1,savedAt:new Date().toISOString(),rooms},null,2);
    fs.writeFileSync(temporary,payload,'utf8');
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(temporary,this.file);
  }
}
module.exports={RoomStore};
