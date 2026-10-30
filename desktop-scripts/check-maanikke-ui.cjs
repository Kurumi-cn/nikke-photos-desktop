const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const smoke=process.argv.includes('--smoke');
const liveCollection=process.argv.includes('--collection-live');
const project=path.resolve(__dirname,'..'),cache=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/'+(liveCollection?'collection-live-ui':smoke?'regression':'ui-check'));
fs.mkdirSync(cache,{recursive:true});
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'test-data'),NIKKE_DATA_HOME:path.join(cache,'storage-home'),NIKKE_CACHE_DIR:cache};
delete env.ELECTRON_RUN_AS_NODE;
const fd=fs.openSync(path.join(cache,'runtime.log'),'a');
try{const r=spawnSync(require('electron'),[project,smoke?'--smoke-test':'--maanikke-ui-check',...(liveCollection?['--collection-live-check']:[])],{cwd:project,env,windowsHide:true,stdio:['ignore',fd,fd]});if(r.error)throw r.error;process.exitCode=r.status??1;
if(!r.status)console.log(fs.readFileSync(path.join(cache,smoke?'smoke-result.json':'maanikke-ui-result.json'),'utf8'));else console.log(fs.readFileSync(path.join(cache,'logs/desktop.log'),'utf8').slice(-6000));}
finally{fs.closeSync(fd)}
