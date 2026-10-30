const fs=require('node:fs'),path=require('node:path');
module.exports=async({appOutDir,packager})=>{
 require('./distribution-audit.cjs').auditPackagedApp(appOutDir);
 const files=[],dirs=[];
 function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isDirectory()){walk(file);dirs.push(path.relative(appOutDir,file))}else files.push(path.relative(appOutDir,file))}}
 walk(appOutDir);
 const quote=s=>s.replaceAll('$','$$').replaceAll('"','$\\"').replaceAll('/','\\');
 const lines=['; Generated exact ownership list. No recursive deletion.','!macro RemoveOwnedFiles',...files.sort().map(f=>`  Delete "$INSTDIR\\${quote(f)}"`),...dirs.sort((a,b)=>b.length-a.length).map(d=>`  RMDir "$INSTDIR\\${quote(d)}"`),'!macroend',''];
 fs.writeFileSync(path.join(packager.buildResourcesDir,'installed-files.nsh'),lines.join('\n'));
 fs.writeFileSync(path.join(path.dirname(appOutDir),'installed-files.json'),JSON.stringify({files:files.sort(),directories:dirs},null,2));
};
