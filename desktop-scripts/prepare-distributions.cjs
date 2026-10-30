const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),archiver=require('archiver');
const root=path.resolve(__dirname,'..'),release=path.join(root,'release/v1.0'),app=path.join(release,'win-unpacked'),dest=path.join(release,'发布文件');
const prefix='NIKKE-Photos-v1.0-Windows-x64',installer=prefix+'-Setup.exe';
async function archive(file,type,options){
 return new Promise((resolve,reject)=>{
  const output=fs.createWriteStream(path.join(dest,file)),writer=archiver(type,options);
  output.on('close',resolve);output.on('error',reject);writer.on('error',reject);writer.on('warning',reject);
  writer.pipe(output);writer.directory(app,'NIKKE Photos');
  for(const name of ['README.md','LICENSE','LICENSING.md'].filter(name=>fs.existsSync(path.join(root,name))))writer.file(path.join(root,name),{name:'NIKKE Photos/'+name});
  writer.finalize().catch(reject);
 });
}
async function main(){
 if(path.dirname(release)!==path.join(root,'release')||!fs.existsSync(path.join(app,'NIKKE Photos.exe'))||!fs.existsSync(path.join(release,installer)))throw Error('Expected v1.0 executable outputs are missing');
 fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(release,installer),path.join(dest,installer));
 await archive(prefix+'.zip','zip',{zlib:{level:6}});
 await archive(prefix+'.tar.gz','tar',{gzip:true,gzipOptions:{level:6}});
 for(const name of ['README.md','LICENSE','LICENSING.md'].filter(name=>fs.existsSync(path.join(root,name))))fs.copyFileSync(path.join(root,name),path.join(dest,name));
 const files=[installer,prefix+'.zip',prefix+'.tar.gz'];
 const hashes=[];for(const name of files){const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(path.join(dest,name)))hash.update(bytes);hashes.push(hash.digest('hex')+'  '+name);}
 fs.writeFileSync(path.join(dest,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
 console.log(JSON.stringify({directory:dest,files:files.map(name=>({name,bytes:fs.statSync(path.join(dest,name)).size}))}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
