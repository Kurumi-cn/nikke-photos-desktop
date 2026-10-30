const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const cache=path.resolve(root,'../codex temp/nikke-desktop/capture-quality');
fs.mkdirSync(cache,{recursive:true});
const fd=fs.openSync(path.join(cache,'probe-runtime.log'),'a');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try {
  const r=spawnSync(require('electron'),[path.join(root,'electron/probe-capture.cjs'),...process.argv.slice(2)],{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});
  if(r.error)throw r.error;
  process.exitCode=r.status ?? 1;
}finally{fs.closeSync(fd)}
