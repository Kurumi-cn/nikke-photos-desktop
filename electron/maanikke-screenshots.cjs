const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DAY=86400000,RETENTION=new Set([0,1,3,7]);
function createScreenshotStore({cacheRoot,now=Date.now}){
 const manifest=path.join(cacheRoot,'maanikke-screenshots.json');
 fs.mkdirSync(cacheRoot,{recursive:true});
 let state=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):{version:1,storeId:crypto.randomUUID(),settings:{directory:path.join(cacheRoot,'maanikke-screenshots'),equipmentCleanup:'task',exceptionDays:3,maxMiB:1024},tasks:{},entries:[]};
 if(state.version!==1)throw Error('不支持的截图索引版本');
 const persist=()=>{const p=manifest+'.next';fs.writeFileSync(p,JSON.stringify(state,null,2));fs.renameSync(p,manifest)};
 function directory(root){
  root=path.resolve(root);fs.mkdirSync(root,{recursive:true});
  const stat=fs.lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(root).toLowerCase()!==root.toLowerCase())throw Error('截图目录不能为链接或重定向目录');
  const marker=path.join(root,'.nikke-screenshots-owner.json');
  if(fs.existsSync(marker)){if(JSON.parse(fs.readFileSync(marker,'utf8')).storeId!==state.storeId)throw Error('该截图目录属于其他实例');}
  else{
   if(fs.readdirSync(root).length)throw Error('请选择空目录或本软件已管理的截图目录');
   fs.writeFileSync(marker,JSON.stringify({storeId:state.storeId}),{flag:'wx'});
  }
  return root;
 }
 directory(state.settings.directory);
 function file(entry){
  const root=path.resolve(entry.directory);
  if(!/^[0-9a-f-]{36}\.png$/.test(entry.filename))throw Error('截图索引文件名无效');
  const resolved=path.join(root,entry.filename);
  if(fs.realpathSync(root).toLowerCase()!==root.toLowerCase()||fs.lstatSync(root).isSymbolicLink())throw Error('截图目录已变为链接');
  const owner=JSON.parse(fs.readFileSync(path.join(root,'.nikke-screenshots-owner.json'),'utf8'));
  if(owner.storeId!==state.storeId)throw Error('截图目录身份不符');
  if(fs.existsSync(resolved)&&(!fs.lstatSync(resolved).isFile()||fs.lstatSync(resolved).isSymbolicLink()))throw Error('拒绝操作非普通截图文件');
  return resolved;
 }
 const protectedEntry=e=>{const t=state.tasks[e.taskId];return e.reviewProtected===true||t?.status==='active'||t?.resumeProtected===true};
 function remove(predicate){
  let deleted=0,freedBytes=0;const errors=[];
  state.entries=state.entries.filter(e=>{
   if(!predicate(e)||protectedEntry(e))return true;
   try{const p=file(e);if(fs.existsSync(p)){freedBytes+=fs.statSync(p).size;fs.unlinkSync(p);}deleted++;return false;}
   catch(error){errors.push(error.message);return true;}
  });state.lastCleanupErrors=errors;persist();return {deleted,freedBytes,errors};
 }
 function sweep(){return remove(e=>{
  const t=state.tasks[e.taskId];
  if(e.kind==='exception')return state.settings.exceptionDays===0||now()-e.savedAt>=state.settings.exceptionDays*DAY;
  if(e.kind==='equipment'&&state.settings.equipmentCleanup==='character'&&t?.completedCharacters?.includes(e.character))return true;
  return t?.status!=='active';
 });}
 function stats(){
  let bytes=0,protectedBytes=0,count=0;const errors=[...(state.lastCleanupErrors||[])],locations=new Map();
  for(const e of state.entries){try{const p=file(e);if(!fs.existsSync(p))continue;const size=fs.statSync(p).size;count++;bytes+=size;if(protectedEntry(e))protectedBytes+=size;locations.set(e.directory,(locations.get(e.directory)||0)+size);}catch(error){errors.push(error.message);}}
  return {settings:{...state.settings},count,bytes,protectedBytes,activeTasks:Object.values(state.tasks).filter(t=>t.status==='active').length,locations:[...locations].map(([directory,bytes])=>({directory,bytes})),errors};
 }
 function beginTask(){const id=crypto.randomUUID();state.tasks[id]={status:'active',createdAt:now(),completedCharacters:[]};persist();return id;}
 function add({taskId,kind='process',character=null,png,savedAt=now()}){
  if(state.tasks[taskId]?.status!=='active'||!['process','equipment','exception'].includes(kind))throw Error('截图任务或类别无效');
  if(kind==='equipment'&&(!character||typeof character!=='string'))throw Error('装备截图需要角色标识');
  if(!Buffer.isBuffer(png)||png.length<8||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('不是有效PNG截图');
  if(!Number.isFinite(savedAt)||savedAt<=0||savedAt>now()+1000)throw Error('截图保存时间无效');
  sweep();const usage=stats();
  if(usage.bytes+png.length>state.settings.maxMiB*1024*1024)throw Error('截图空间达到上限，请清理或提高容量上限；未删除运行中或保留期内的截图');
  const root=directory(state.settings.directory),id=crypto.randomUUID(),filename=id+'.png';
  fs.writeFileSync(path.join(root,filename),png,{flag:'wx'});
  state.entries.push({id,filename,directory:root,taskId,kind,character,savedAt});persist();return id;
 }
 function characterDone(taskId,character){const t=state.tasks[taskId];if(!t||t.status!=='active')throw Error('没有运行中的任务');t.completedCharacters=[...new Set([...t.completedCharacters,character])];persist();
  // Explicit character boundary may release only this character's equipment,
  // after its extracted result has been durably saved by the caller.
  if(state.settings.equipmentCleanup==='character'){
   const candidates=state.entries.filter(e=>e.taskId===taskId&&e.kind==='equipment'&&e.character===character&&!e.reviewProtected);
   for(const e of candidates){const p=file(e);if(fs.existsSync(p))fs.unlinkSync(p);state.entries=state.entries.filter(v=>v.id!==e.id);}persist();
  }
 }
 function endTask(taskId,{failed=false,resumeProtected=false}={}){
  const t=state.tasks[taskId];if(!t)return;
  if(failed){const latest=state.entries.filter(e=>e.taskId===taskId).at(-1);if(latest)latest.kind='exception';}
  t.status=failed?'failed':'completed';t.finishedAt=now();t.resumeProtected=resumeProtected;persist();return sweep();
 }
 function markException(id){const entry=state.entries.find(e=>e.id===id);if(entry){entry.kind='exception';persist();}}
 function holdReview(id){const entry=state.entries.find(e=>e.id===id);if(!entry||entry.kind!=='equipment')throw Error('装备截图不存在');entry.reviewProtected=true;persist();}
 function releaseReview(ids){if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('无效截图标识');for(const e of state.entries)if(ids.includes(e.id))delete e.reviewProtected;persist();return sweep();}
 function read(id){const entry=state.entries.find(e=>e.id===id);if(!entry)return {available:false};const p=file(entry);if(!fs.existsSync(p))return {available:false};return {available:true,image:'data:image/png;base64,'+fs.readFileSync(p).toString('base64'),savedAt:entry.savedAt};}
 function settings(patch){
  if(Object.values(state.tasks).some(t=>t.status==='active'))throw Error('任务运行中不能更改截图设置');
  if(!patch||Object.keys(patch).some(k=>!['equipmentCleanup','exceptionDays','maxMiB'].includes(k)))throw Error('无效截图设置');
  const next={...state.settings,...patch};
  if(!['task','character'].includes(next.equipmentCleanup)||!RETENTION.has(next.exceptionDays)||!Number.isInteger(next.maxMiB)||next.maxMiB<16||next.maxMiB>102400)throw Error('截图设置数值无效');
  state.settings=next;persist();sweep();return stats();
 }
 function changeDirectory(parent){
  if(Object.values(state.tasks).some(t=>t.status==='active'))throw Error('任务运行中不能更改截图位置');
  if(!path.isAbsolute(parent))throw Error('截图位置必须为绝对路径');
  state.settings.directory=directory(path.join(parent,'NIKKE-Photos-Screenshots'));persist();return stats();
 }
 function startup(){
  for(const t of Object.values(state.tasks))if(t.status==='active'){t.status='interrupted';t.resumeProtected=true;}
  persist();return sweep();
 }
 return {stats,beginTask,add,characterDone,endTask,markException,holdReview,releaseReview,read,settings,changeDirectory,startup,clean:()=>remove(()=>true)};
}
module.exports={createScreenshotStore,DAY};
