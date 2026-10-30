const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop/disabled-module-check/ui');fs.mkdirSync(cache,{recursive:true});
const env={...process.env,NIKKE_DATA_DIR:path.join(cache,'test-data'),NIKKE_CACHE_DIR:cache};delete env.ELECTRON_RUN_AS_NODE;
const fd=fs.openSync(path.join(cache,'runtime.log'),'a');
try{const r=spawnSync(require('electron'),[root,'--smoke-test'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});if(r.error)throw r.error;process.exitCode=r.status??1;if(!r.status){const report=JSON.parse(fs.readFileSync(path.join(cache,'smoke-result.json')));console.log(JSON.stringify({automationDisabled:report.automationDisabled,ocr:report.ocr,bridge:report.bridge,storage:report.storage,originalTools:!!report.tools},null,2));}}
finally{fs.closeSync(fd)}
