// Reuse the unchanged OCR CLI against existing annotated samples in the original documentation.
// Only paths are redirected; no threshold, expected value, or recognizer is changed.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/neutral-qa-2026-10-30/ocr');
fs.mkdirSync(root,{recursive:true});
let source=fs.readFileSync(path.join(project,'scripts/ocr-equipment.mjs'),'utf8');
source=source.replace("const APP_DIR = path.resolve(import.meta.dirname, '..')",'const APP_DIR = '+JSON.stringify(project));
source=source.replace("const PROJECT_DIR = path.resolve(APP_DIR, '..')",'const PROJECT_DIR = '+JSON.stringify('E:/博哥/NIKKE Photos'));
source=source.replace(/from '(\.\.\/src[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve(project,'scripts',p)).href));
source=source.replace(/import\('(\.\.\/src[^']+)'\)/g,(_,p)=>'import('+JSON.stringify(pathToFileURL(path.resolve(project,'scripts',p)).href)+')');
source=source.replace("from 'pngjs'",'from '+JSON.stringify(pathToFileURL(require.resolve('pngjs')).href));
const script=path.join(root,'relocated-cli.mjs');fs.writeFileSync(script,source);
const fd=fs.openSync(path.join(root,'output.log'),'w');
const child=spawn(process.execPath,[script,'--samples','--engine','v2','--report',path.join(root,'samples.json')],{cwd:project,windowsHide:true,stdio:['ignore',fd,fd]});
child.on('error',e=>{fs.closeSync(fd);console.error(e);process.exitCode=1});
child.on('exit',code=>{fs.closeSync(fd);console.log(JSON.stringify({code,root}));process.exitCode=code??1});
