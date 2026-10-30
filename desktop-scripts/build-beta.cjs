const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.resolve(root,'../codex temp/nikke-desktop');
const stage=path.join(cache,'beta-stage-v0.1-beta-1-'+Date.now());
const stageOnly=process.argv.includes('--stage-only');
const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false',CSC_LINK:'',WIN_CSC_LINK:'',ELECTRON_BUILDER_CACHE:path.join(cache,'electron-builder'),TEMP:path.join(cache,'temp'),TMP:path.join(cache,'temp')};
function run(file,args){const r=spawnSync(process.execPath,[file,...args],{cwd:root,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1)}
for(const d of [stage,env.TEMP,env.ELECTRON_BUILDER_CACHE])fs.mkdirSync(d,{recursive:true});
run(path.join(root,'desktop-scripts/build-tools.cjs'),[]);
run(path.join(root,'node_modules/vite/bin/vite.js'),['build','--configLoader','native']);
// Only known public assets and production main-process modules enter the app.
// Staging is reusable; reject unexpected files instead of cleaning any user folder.
const allowedTop=new Set(['dist','electron','package.json']);
if(fs.readdirSync(stage).some(n=>!allowedTop.has(n)))throw Error('Unexpected file in Beta staging; stop for inspection');
fs.cpSync(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
fs.mkdirSync(path.join(stage,'electron'),{recursive:true});
const runtime=['main.cjs','preload.cjs','storage-paths.cjs','capture-source.cjs','source-picker.cjs','windows-capture.cjs','windows-capture.ps1','windows-capture.cs','resource-income-model.mjs','resource-income-store.mjs'];
for(const file of runtime)fs.copyFileSync(path.join(root,'electron',file),path.join(stage,'electron',file));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:pkg.author,main:'electron/main.cjs'},null,2));
// Remove local provenance paths from the distributable, retaining attribution and hashes.
const notice=path.join(stage,'dist/asset-notices/belorta-pumpkin-witch.json');
if(fs.existsSync(notice)){const doc=JSON.parse(fs.readFileSync(notice));delete doc.localSearch;for(const r of doc.resources||[])delete r.sourceLocalPath;fs.writeFileSync(notice,JSON.stringify(doc,null,2))}
const localPaths=Object.values(JSON.parse(fs.readFileSync(path.join(root,'src/data/roster.json'))).sources).filter(v=>typeof v==='string'&&/^[A-Z]:[\\/]/.test(v));
const audit=[];
function sanitize(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory()){sanitize(file);continue}if(!/\.(js|mjs|cjs|json|md|txt|html|css|yml)$/i.test(file))continue;
 let text=fs.readFileSync(file,'utf8');const old=text;
 for(const p of localPaths)text=text.split(p).join('bundled-source/'+path.basename(p));
 text=text.replace(/[A-Z]:\/(?:博哥|桌面|Edge Download|codeart工作空间)[^\s`"'<>]*/g,'[local-development-path]');
 if(text!==old){fs.writeFileSync(file,text);audit.push(path.relative(stage,file))}
 if(/(?:[A-Z]:[\\/](?:博哥|桌面|Edge Download|codeart工作空间)|[A-Z]:[\\/]+Users[\\/]+xby)/i.test(text))throw Error('Personal development path remains: '+path.relative(stage,file));
}}
sanitize(stage);
const distributionAudit=require('./distribution-audit.cjs').auditDirectory(stage);
fs.writeFileSync(path.join(cache,'beta-privacy-audit.json'),JSON.stringify({stageRelativeEntries:fs.readdirSync(stage),sanitized:audit,runtimeModules:runtime,noUserDataIncluded:true,distributionAudit},null,2));
if(stageOnly){fs.writeFileSync(path.join(cache,'latest-stage-only.json'),JSON.stringify({stage,distributionAudit},null,2));console.log('Staging audit passed (no EXE built): '+stage);}
else run(path.join(root,'node_modules/electron-builder/cli.js'),['--win','nsis','--x64','--publish','never','--config.directories.app='+stage]);
