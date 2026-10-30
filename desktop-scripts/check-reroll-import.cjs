const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop/reroll-import-check');
fs.mkdirSync(cache,{recursive:true});
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'data'),NIKKE_CACHE_DIR:cache};delete env.ELECTRON_RUN_AS_NODE;
const fd=fs.openSync(path.join(cache,'runtime.log'),'a');
try {const r=spawnSync(require('electron'),[root,'--reroll-import-check'],{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});if(r.error)throw r.error;process.exitCode=r.status??1}finally{fs.closeSync(fd)}
