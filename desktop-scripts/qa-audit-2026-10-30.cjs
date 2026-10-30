// Neutral audit runner. Does not build, fix product code, or issue real game inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'..'),mode=process.argv[2]||'units';
const root=process.env.NIKKE_QA_ROOT||path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/neutral-qa-2026-10-30');
fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(root,'temp'),{recursive:true});
const env={...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),PYTHONDONTWRITEBYTECODE:'1'};delete env.ELECTRON_RUN_AS_NODE;
const results=[];
function save(){fs.writeFileSync(path.join(root,mode+'-results.json'),JSON.stringify({project,mode,results},null,2))}
async function run(name,file,args,timeout=120000,extra={}){
 const folder=path.join(root,mode,name);fs.mkdirSync(folder,{recursive:true});const fd=fs.openSync(path.join(folder,'output.log'),'w'),start=Date.now();
 console.log('START '+mode+'/'+name);
 const result=await new Promise(resolve=>{
  let timedOut=false,finished=false;const child=spawn(file,args,{cwd:project,env:{...env,...extra},windowsHide:true,stdio:['ignore',fd,fd]});
  const timer=setTimeout(()=>{timedOut=true;child.kill()},timeout);
  const finish=(code,error)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({name,code,error:error?.message,timedOut,durationMs:Date.now()-start,log:path.join(folder,'output.log'),args})};
  child.on('error',e=>finish(null,e));child.on('exit',code=>finish(code));
 });fs.closeSync(fd);results.push(result);save();console.log((result.code===0?'PASS ':'FAIL ')+name+' '+result.durationMs+'ms');return result;
}
const node=(name,args,timeout)=>run(name,process.execPath,args,timeout);
const files=(folder,suffix)=>fs.readdirSync(path.join(project,folder)).filter(f=>f.endsWith(suffix)).map(f=>path.join(folder,f));
async function main(){
 if(mode==='units'){
  const jobs=[
   ['affix-summary',['scripts/check-affix-summary.mjs']],['migrations',['scripts/check-migrations.mjs']],['account-import',['scripts/check-account-import.mjs']],
   ['share-code',['scripts/check-share-code.mjs']],['core-dust',['scripts/check-core-dust.mjs']],['workshop-solver',['scripts/check-workshop-solver.mjs']],
   ['custom-nikke',['scripts/check-custom-nikke.mjs']],['reroll-import',['scripts/check-reroll-import.mjs']],['equipment-rules',['scripts/check-equipment-rules.mjs']],
   ['capture-source',['scripts/check-capture-source.cjs']],['capture-frame',['scripts/check-capture-frame.cjs']],['collection-review',['desktop-scripts/check-collection-review.mjs']],
   ['simplified-only',['desktop-scripts/check-simplified-only.mjs']],['i18n',['scripts/check-i18n.mjs']],
   ['workshop-upstream',['--test',...files('tools/equipment-reroll/tests','.test.mjs')]],
   ['strategy',['--test',...files('tools/equipment-reroll/strategy-tests','.test.mjs')]],
   ['simulator',['--test',...files('tools/equipment-reroll/simulator-tests','.test.mjs')]],
   ['collection-manager',['desktop-scripts/check-maanikke-collection.cjs']],['collection-background',['desktop-scripts/check-collection-background.cjs']],
   ['screenshot-retention',['desktop-scripts/check-maanikke-screenshots.cjs']],
  ];
  // The original resource-income tests hardcode a shared cache. Only relocate their test output.
  let resource=fs.readFileSync(path.join(project,'scripts/check-resource-income.test.mjs'),'utf8');
  resource=resource.replace("const root='E:/博哥/codex temp/nikke-desktop/resource-income-tests'",'const root='+JSON.stringify(path.join(root,'resource-income-fixtures')));
  resource=resource.replace(/from '(\.\.[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve(project,'scripts',p)).href));
  const relocated=path.join(root,'resource-income.test.mjs');fs.writeFileSync(relocated,resource);jobs.push(['resource-income',['--test',relocated]]);
  let index=0;async function worker(){while(index<jobs.length){const [name,args]=jobs[index++];await node(name,args,180000)}}await Promise.all([worker(),worker()]);
 }else if(mode==='ui'){
  const electron=require('electron');
  for(const [name,flag] of [['smoke','--smoke-test'],['custom-nikke','--custom-nikke-check'],['workspace','--workspace-ui-check'],['strategy','--reroll-strategy-check'],['import','--reroll-import-check'],['collection','--collection-ui-check'],['source-picker','--source-picker-check']]){
   const cache=path.join(root,'ui',name,'cache');
   await run(name,electron,[project,flag],110000,{NIKKE_DATA_DIR:path.join(cache,'data'),NIKKE_DATA_HOME:path.join(cache,'storage-home'),NIKKE_CACHE_DIR:cache});
  }
 }else if(mode==='python'){
  const python=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/runtime/Scripts/python.exe');
  for(const name of ['roster','engine','search-input','stage-reuse','card-geometry','transition','performance','vision'])await run(name,python,['desktop-scripts/check-collection-'+name+'.py'],120000);
 }
 save();console.log(JSON.stringify({mode,passed:results.filter(r=>r.code===0).length,total:results.length,root}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
