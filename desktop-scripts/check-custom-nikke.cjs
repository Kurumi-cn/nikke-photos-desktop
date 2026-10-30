const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop/custom-nikke-check');
fs.mkdirSync(cache,{recursive:true});
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'data'),NIKKE_CACHE_DIR:cache};delete env.ELECTRON_RUN_AS_NODE;
const fd=fs.openSync(path.join(cache,'runtime.log'),'a');
try {
  for(const restart of [false,true]) {
    const r=spawnSync(require('electron'),[root,'--custom-nikke-check'],{cwd:root,env:{...env,NIKKE_CUSTOM_RESTART_ONLY:restart?'1':'0'},stdio:['ignore',fd,fd],windowsHide:true});
    if(r.error)throw r.error;
    if(r.status!==0){process.exitCode=r.status??1;break}
  }
}finally{fs.closeSync(fd)}
