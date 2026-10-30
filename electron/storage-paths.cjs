const fs=require('node:fs'),path=require('node:path');
const DURABLE=['Local Storage','IndexedDB','WebStorage','tools','Preferences'];
function hasData(folder){return fs.existsSync(folder)&&DURABLE.some(name=>fs.existsSync(path.join(folder,name)))}
function writeLocation(storageHome,dataRoot){
  if(!path.isAbsolute(dataRoot)||!hasData(dataRoot))throw Error('请选择包含原角色档案或资源记录的旧版 data 目录');
  fs.mkdirSync(storageHome,{recursive:true});
  const file=path.join(storageHome,'storage-location.json'),next=file+'.next';
  fs.writeFileSync(next,JSON.stringify({version:1,dataRoot:path.resolve(dataRoot)},null,2),'utf8');
  fs.renameSync(next,file);
}
function resolveStoragePaths({packaged,project,executable,localAppData,env=process.env}){
  const storageHome=path.resolve(env.NIKKE_DATA_HOME||path.join(localAppData,'NIKKE Photos Data'));
  const home=path.dirname(env.PORTABLE_EXECUTABLE_FILE||executable);
  const cacheRoot=path.resolve(env.NIKKE_CACHE_DIR||(packaged?path.join(localAppData,'NIKKE Photos Cache'):path.resolve(project,'..','codex temp','nikke-desktop')));
  if(env.NIKKE_DATA_DIR)return {storageHome,dataRoot:path.resolve(env.NIKKE_DATA_DIR),cacheRoot,storageMode:'override'};
  if(!packaged)return {storageHome,dataRoot:path.join(project,'data'),cacheRoot,storageMode:'development'};
  const location=path.join(storageHome,'storage-location.json'),standard=path.join(storageHome,'userdata');
  if(fs.existsSync(location)){
    let saved;try{saved=JSON.parse(fs.readFileSync(location,'utf8'))}catch{throw Error('旧数据目录配置损坏，已停止启动以避免创建空档案。请保留数据并检查 storage-location.json。')}
    if(saved.version!==1||typeof saved.dataRoot!=='string'||!path.isAbsolute(saved.dataRoot)||!hasData(saved.dataRoot))throw Error('旧数据目录不可用，已停止启动以保护原档案。请接回原目录后重试。');
    return {storageHome,dataRoot:path.resolve(saved.dataRoot),cacheRoot,storageMode:'legacy-in-place'};
  }
  // Adopt an adjacent legacy data directory in place. Never copy live LevelDB,
  // merge profiles, or delete the old folder. The stable pointer survives reinstall.
  const legacy=path.join(home,'data');
  if(!hasData(standard)&&hasData(legacy)){
    writeLocation(storageHome,legacy);
    return {storageHome,dataRoot:legacy,cacheRoot,storageMode:'legacy-in-place'};
  }
  return {storageHome,dataRoot:standard,cacheRoot,storageMode:'per-user'};
}
module.exports={resolveStoragePaths,writeLocation,hasData};
