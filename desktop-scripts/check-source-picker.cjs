const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop');
const temp=path.join(cache,'temp');fs.mkdirSync(temp,{recursive:true});
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'source-picker-data'),NIKKE_CACHE_DIR:path.join(cache,'source-picker-run'),TEMP:temp,TMP:temp};delete env.ELECTRON_RUN_AS_NODE;
const fd=fs.openSync(path.join(cache,'source-picker-runtime.log'),'a');
try {const r=spawnSync(require('electron'),[root,'--source-picker-check'],{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});if(r.error)throw r.error;process.exitCode=r.status??1}finally{fs.closeSync(fd)}
