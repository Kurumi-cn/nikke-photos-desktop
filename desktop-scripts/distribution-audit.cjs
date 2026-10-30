// Fail closed if suspended automation code or native Maa dependencies enter a distribution.
const fs=require('node:fs'),path=require('node:path');
const forbiddenPath=/(?:^|\/)(?:experiments|@maaxyz)(?:\/|$)|(?:^|\/)maa-node(?:[-/]|$)|(?:^|\/)electron\/maa-lab\.cjs$|(?:^|\/)(?:maa[^/]*\.(?:dll|node)|onnxruntime_maa\.dll|fastdeploy_ppocr_maa\.dll|opencv_world[^/]*\.dll)$/i;
const forbiddenRuntime=/maa-(?:lab|live):|@maaxyz\/maa-node|AutomationLabPage|LiveLabPanel|\/automation-lab/;
function assertPaths(entries){for(const entry of entries){if(forbiddenPath.test(entry.replaceAll('\\','/')))throw Error('Suspended automation asset in distribution: '+entry);}}
function assertText(name,text){if(/\.(?:cjs|mjs|js|html|css|json)$/i.test(name)&&forbiddenRuntime.test(text))throw Error('Suspended automation runtime in distribution: '+name);}
function auditDirectory(root){let count=0;function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=path.relative(root,file).replaceAll('\\','/');assertPaths([rel]);if(e.isDirectory())walk(file);else{count++;if(/\.(?:cjs|mjs|js|html|css|json)$/i.test(e.name))assertText(rel,fs.readFileSync(file,'utf8'));}}}walk(root);return {files:count,noAutomationRuntime:true,noMaaDependencies:true};}
function auditAsar(file){const asar=require('@electron/asar'),entries=asar.listPackage(file);assertPaths(entries.map(e=>e.replaceAll('\\','/').replace(/^\//,'')));let files=0;for(const name of entries){const normalized=name.replaceAll('\\','/').replace(/^\//,'');if(/\.(?:cjs|mjs|js|html|css|json)$/i.test(normalized)){assertText(normalized,asar.extractFile(file,normalized.split('/').join(path.sep)).toString('utf8'));files++;}}return {entries:entries.length,textFilesChecked:files,noAutomationRuntime:true,noMaaDependencies:true};}
function auditPackagedApp(root){const directory=auditDirectory(root),archive=path.join(root,'resources','app.asar');return {...directory,...(fs.existsSync(archive)?{asar:auditAsar(archive)}:{})};}
module.exports={assertPaths,assertText,auditDirectory,auditAsar,auditPackagedApp};


