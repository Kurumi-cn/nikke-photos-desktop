const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const cache=process.env.NIKKE_CACHE_DIR || path.resolve(root,'..','codex temp','nikke-desktop');
const temp=path.join(cache,'temp'); fs.mkdirSync(temp,{recursive:true});
const env={...process.env,TEMP:temp,TMP:temp,ELECTRON_CACHE:path.join(cache,'electron'),ELECTRON_BUILDER_CACHE:path.join(cache,'electron-builder'),npm_config_cache:path.join(cache,'npm')};
delete env.ELECTRON_RUN_AS_NODE;
function run(file,args){const r=spawnSync(process.execPath,[file,...args],{cwd:root,env,stdio:'inherit'}); if(r.error) throw r.error; if(r.status!==0) process.exit(r.status || 1);}
run(path.join(root,'desktop-scripts/build-tools.cjs'),[]);
run(path.join(root,'node_modules/vite/bin/vite.js'),['build','--configLoader','native']);
const mode=process.argv[2] || 'start';
if(mode==='smoke') env.NIKKE_DATA_DIR=path.join(cache,'smoke-data');
if(mode==='capture-check') env.NIKKE_DATA_DIR=path.join(cache,'capture-check-data');
if(['pack','build'].includes(mode)) run(path.join(root,'node_modules/electron-builder/cli.js'),mode==='pack'?['--win','--x64','--dir']:['--win','--x64']);
else {
  Object.assign(process.env,env); process.env.electron_config_cache=env.ELECTRON_CACHE;
  const electron=require('electron');
  // GUI lifetime may outlive a terminal/tool output pipe. Use a real file descriptor
  // so Electron's internal console.error cannot raise EPIPE on a disconnected pipe.
  const fd=fs.openSync(path.join(cache,'electron-runtime.log'),'a');
  const r=spawnSync(electron,[root,...(mode==='smoke'?['--smoke-test']:mode==='capture-check'?['--capture-check']:[])],{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:mode==='smoke'||mode==='capture-check'});
  fs.closeSync(fd);
  if(r.error) throw r.error;
  process.exit(r.status ?? 1);
}
