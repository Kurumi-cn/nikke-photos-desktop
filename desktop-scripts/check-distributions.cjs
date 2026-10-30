const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),release=path.join(root,'release/v1.0'),app=path.join(release,'win-unpacked'),folder=path.join(release,'发布文件'),prefix='NIKKE-Photos-v1.0-Windows-x64',expected=new Map();
async function hashStream(stream){const h=crypto.createHash('sha256');for await(const data of stream)h.update(data);return h.digest('hex')}
async function walk(dir,base=''){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name),key=path.posix.join(base,item.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);if(item.isDirectory())await walk(file,key);else expected.set('NIKKE Photos/'+key,await hashStream(fs.createReadStream(file)));
}}
async function main(){
 await walk(app);for(const file of ['README.md','LICENSE','LICENSING.md'].filter(name=>fs.existsSync(path.join(root,name))))expected.set('NIKKE Photos/'+file,await hashStream(fs.createReadStream(path.join(root,file))));
 const zip=await require('unzipper').Open.file(path.join(folder,prefix+'.zip')),zipSeen=new Set();
 for(const entry of zip.files){if(entry.type==='Directory')continue;assert.ok(expected.has(entry.path),'unexpected ZIP file '+entry.path);assert.equal(await hashStream(entry.stream()),expected.get(entry.path),'ZIP '+entry.path);zipSeen.add(entry.path)}assert.equal(zipSeen.size,expected.size);
 const tarSeen=new Set(),extract=require('tar-stream').extract();
 await new Promise((resolve,reject)=>{
  extract.on('entry',(header,stream,next)=>{if(header.type==='directory'){stream.resume();stream.on('end',next);return;}
   hashStream(stream).then(hash=>{assert.ok(expected.has(header.name),'unexpected TAR file '+header.name);assert.equal(hash,expected.get(header.name),'TAR '+header.name);tarSeen.add(header.name);next()}).catch(reject);
  });extract.on('finish',resolve);extract.on('error',reject);
  fs.createReadStream(path.join(folder,prefix+'.tar.gz')).on('error',reject).pipe(zlib.createGunzip().on('error',reject)).pipe(extract);
 });assert.equal(tarSeen.size,expected.size);
 const sums=fs.readFileSync(path.join(folder,'SHA256SUMS.txt'),'utf8').trim().split('\n');for(const line of sums){const [hash,file]=line.split('  ');assert.equal(await hashStream(fs.createReadStream(path.join(folder,file))),hash);}
 assert.equal(await hashStream(fs.createReadStream(path.join(folder,prefix+'-Setup.exe'))),await hashStream(fs.createReadStream(path.join(release,prefix+'-Setup.exe'))));
 const report={passed:true,folder,zipFiles:zipSeen.size,tarFiles:tarSeen.size,identicalApplicationFiles:true,sha256Verified:true};fs.writeFileSync(path.join(release,'archive-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
