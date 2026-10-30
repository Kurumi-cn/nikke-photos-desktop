// One-time, explicitly authorized source synchronization. Data/releases/dependencies are never copied.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=path.resolve(__dirname,'..'),target=path.resolve(source,'../NIKKE桌面端项目');
const base=path.resolve(source,'../codex temp/nikke-desktop/production-sync-2026-10-30');
const folders=['src','electron','tools','public','scripts','desktop-scripts','automation','docs','build'];
const roots=['.gitignore','.npmrc','icon.jpg','index.html','install-desktop.ps1','package.json','package-lock.json','README.md','vite.config.js','LICENSE','LICENSING.md'];
const excluded=relative=>/^(public\/(tools|about)(\/|$)|tools\/equipment-reroll\/public\/source(\/|$)|build\/installed-files\.nsh$)/.test(relative)||/(^|\/)(__pycache__|node_modules|\.git)(\/|$)/.test(relative)||/\.(pyc|pyo)$/.test(relative);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(root,folder=''){
 const found=[];if(!fs.existsSync(path.join(root,folder)))return found;
 for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){
  const rel=path.posix.join(folder,entry.name);if(excluded(rel))continue;
  const absolute=path.join(root,rel);if(fs.lstatSync(absolute).isSymbolicLink())throw Error('Unexpected link in managed sources: '+absolute);
  if(entry.isDirectory())found.push(...files(root,rel));else if(entry.isFile())found.push(rel);
 }return found;
}
function safe(relative){
 const absolute=path.resolve(target,relative);
 if(!absolute.startsWith(target+path.sep)||!folders.some(f=>relative.startsWith(f+'/'))&&!roots.includes(relative))throw Error('Outside explicit synchronization scope: '+absolute);
 return absolute;
}
function protectedSnapshot(){
 const entries=[];
 function walk(folder,rel){if(!fs.existsSync(folder))return;for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,item.name),key=path.posix.join(rel,item.name),stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()){entries.push({path:key,link:fs.readlinkSync(file)});continue;}
  if(item.isDirectory())walk(file,key);else if(item.isFile())entries.push({path:key,size:stat.size,sha256:hash(file)});
 }}
 for(const folder of ['data','release','devtools'])walk(path.join(target,folder),folder);
 return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
if(path.basename(source)!=='NIKKE桌面端项目-自动化开发副本'||path.basename(target)!=='NIKKE桌面端项目'||path.dirname(source)!==path.dirname(target))throw Error('Unexpected project roots');
fs.mkdirSync(base,{recursive:true});
if(process.argv.includes('--plan')){
 const plan={source,target,generatedAt:new Date().toISOString(),writes:[],deletes:[],preservedExtras:[]};
 for(const folder of folders){
  const incoming=files(source,folder),old=files(target,folder),set=new Set(incoming);
  for(const rel of incoming){const to=safe(rel),sha=hash(path.join(source,rel));if(!fs.existsSync(to)||hash(to)!==sha)plan.writes.push({path:rel,sha256:sha,exists:fs.existsSync(to)});}
  // Source-managed code is mirrored. Keep target-only documentation/resource history for review.
  for(const rel of old.filter(rel=>!set.has(rel))){if(['src','electron'].includes(folder))plan.deletes.push({path:rel,sha256:hash(safe(rel))});else plan.preservedExtras.push(rel);}
 }
 for(const rel of roots){const to=safe(rel),sha=hash(path.join(source,rel));if(!fs.existsSync(to)||hash(to)!==sha)plan.writes.push({path:rel,sha256:sha,exists:fs.existsSync(to)});}
 fs.writeFileSync(path.join(base,'plan.json'),JSON.stringify(plan,null,2));
 fs.writeFileSync(path.join(base,'protected-before.json'),JSON.stringify(protectedSnapshot(),null,2));
 console.log(JSON.stringify({base,writes:plan.writes.length,deletes:plan.deletes,preservedExtras:plan.preservedExtras,bytes:plan.writes.reduce((n,f)=>n+fs.statSync(path.join(source,f.path)).size,0)}));
}else if(process.argv.includes('--apply')){
 if(fs.existsSync(path.join(base,'applied.json')))throw Error('This one-time plan was already applied');
 const plan=JSON.parse(fs.readFileSync(path.join(base,'plan.json')));
 if(plan.source!==source||plan.target!==target)throw Error('Plan identity mismatch');
 // Validate all source hashes and protected paths before any mutation.
 for(const item of [...plan.writes,...plan.deletes])safe(item.path);
 for(const item of plan.writes)if(hash(path.join(source,item.path))!==item.sha256)throw Error('Source changed after plan: '+item.path);
 const before=fs.readFileSync(path.join(base,'protected-before.json'),'utf8');
 if(JSON.stringify(JSON.parse(before))!==JSON.stringify(protectedSnapshot()))throw Error('Protected state changed; stop and replan');
 const backup=path.join(base,'backup');fs.mkdirSync(backup,{recursive:true});
 for(const rel of [...new Set([...plan.writes.filter(i=>i.exists).map(i=>i.path),...plan.deletes.map(i=>i.path),'AGENTS.md','工作日志/接续说明.md','工作日志/进展记录.md'])]){
  const file=path.join(target,rel);if(fs.existsSync(file)){const dest=path.join(backup,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}
 }
 for(const item of plan.writes){const to=safe(item.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(source,item.path),to);}
 // Only individually enumerated, backed-up stale source files; never recursively delete a directory.
 for(const item of plan.deletes)fs.unlinkSync(safe(item.path));
 const verification=plan.writes.map(item=>({path:item.path,ok:hash(safe(item.path))===item.sha256}));
 const after=protectedSnapshot();fs.writeFileSync(path.join(base,'protected-after.json'),JSON.stringify(after,null,2));
 const protectedUnchanged=JSON.stringify(after)===JSON.stringify(JSON.parse(before));
 fs.writeFileSync(path.join(base,'applied.json'),JSON.stringify({source,target,writes:verification,protectedUnchanged},null,2));
 if(!protectedUnchanged||verification.some(item=>!item.ok))throw Error('Synchronization verification failed');
 console.log(JSON.stringify({base,writes:verification.length,deletes:plan.deletes.length,protectedUnchanged}));
}else if(process.argv.includes('--verify-code')){
 const mismatches=[],verified=[];
 for(const rel of [...folders.flatMap(folder=>files(source,folder)),...roots]){
  const to=safe(rel);let ok=fs.existsSync(to)&&hash(to)===hash(path.join(source,rel));
  if(rel==='package.json'&&fs.existsSync(to)){
   const wanted=JSON.parse(fs.readFileSync(path.join(source,rel))),actual=JSON.parse(fs.readFileSync(to));
   for(const key of ['cn-roster:dev','cn-roster:apply'])delete actual.scripts[key];
   ok=JSON.stringify(wanted)===JSON.stringify(actual);
  }
  (ok?verified:mismatches).push(rel);
 }
 const result={source,target,verified:verified.length,mismatches,adaptations:['package.json preserves two formal cn-roster scripts','formal AGENTS/logs and start-desktop.cmd kept separately','generated dist/public tools/about rebuilt in each project']};
 fs.writeFileSync(path.join(base,'code-final.json'),JSON.stringify(result,null,2));if(mismatches.length)throw Error('Final code mismatch: '+mismatches.join(', '));console.log(JSON.stringify(result));
}else if(process.argv.includes('--verify-protected')){
 const before=JSON.parse(fs.readFileSync(path.join(base,'protected-before.json'))),after=protectedSnapshot(),ok=JSON.stringify(before)===JSON.stringify(after);
 fs.writeFileSync(path.join(base,'protected-final.json'),JSON.stringify({ok,entries:after},null,2));if(!ok)throw Error('Protected data/releases/devtools changed');console.log(JSON.stringify({protectedUnchanged:ok,entries:after.length}));
}else throw Error('Use --plan, inspect, then --apply; --verify-protected after final validation.');
