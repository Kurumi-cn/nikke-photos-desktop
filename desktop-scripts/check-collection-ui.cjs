// Isolated renderer fixtures; no native worker, UAC, or game inputs.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const project=path.resolve(__dirname,'..'),cache=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/collection-interface-'+Date.now());
fs.mkdirSync(cache,{recursive:true});const fd=fs.openSync(path.join(cache,'runtime.log'),'a');
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'test-data'),NIKKE_DATA_HOME:path.join(cache,'storage-home'),NIKKE_CACHE_DIR:cache};delete env.ELECTRON_RUN_AS_NODE;
try{const r=spawnSync(require('electron'),[project,'--collection-ui-check'],{cwd:project,env,windowsHide:true,stdio:['ignore',fd,fd]});if(r.error)throw r.error;process.exitCode=r.status??1;console.log(fs.readFileSync(path.join(cache,r.status?'logs/desktop.log':'collection-ui-result.json'),'utf8').slice(-7000));console.log('Evidence: '+cache)}finally{fs.closeSync(fd)}
