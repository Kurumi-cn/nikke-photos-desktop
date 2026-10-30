const fs=require('node:fs'),path=require('node:path');
module.exports=async({appOutDir,packager})=>{
 const archive=path.join(appOutDir,'resources/app.asar'),asar=require('@electron/asar');
 const entries=asar.listPackage(archive).map(s=>s.replaceAll('\\','/').replace(/^\//,''));
 for(const file of entries)if(/^(data|node_modules)(\/|$)|(^|\/)(experiments|devtools|@maaxyz)(\/|$)|(^|\/)electron\/maa-lab\.cjs$/.test(file))throw Error('Unexpected private/legacy file in release: '+file);
 for(const file of ['electron/maanikke.cjs','dist/about/project-GPL-3.0.txt','dist/about/NIKKE-Photos-v1.0-source.zip'])if(!entries.includes(file))throw Error('Required full-release resource missing: '+file);
 const resources=path.join(appOutDir,'resources/automation-app');
 for(const file of ['runtime/python.exe','runtime/python312._pth','automation/maanikke/worker.py','automation/maanikke/collection_worker.py','src/data/cn-roster.json','ocr-deps/pngjs/package.json'])if(!fs.existsSync(path.join(resources,file)))throw Error('Missing automation resource '+file);
 const files=[],dirs=[];
 function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isDirectory()){walk(file);dirs.push(path.relative(appOutDir,file))}else files.push(path.relative(appOutDir,file))}}
 walk(appOutDir);
 const quote=s=>s.replaceAll('$','$$').replaceAll('"','$\\"').replaceAll('/','\\');
 fs.writeFileSync(path.join(packager.buildResourcesDir,'installed-files.nsh'),['; Full v1.0 exact ownership list. Keep unknown/user files.','!macro RemoveOwnedFiles',...files.sort().map(f=>`  Delete "$INSTDIR\\${quote(f)}"`),...dirs.sort((a,b)=>b.length-a.length).map(d=>`  RMDir "$INSTDIR\\${quote(d)}"`),'!macroend',''].join('\n'));
 fs.writeFileSync(path.join(path.dirname(appOutDir),'installed-files.json'),JSON.stringify({files,dirs},null,2));
};
