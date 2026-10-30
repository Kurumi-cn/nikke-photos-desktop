const fs=require('node:fs'),path=require('node:path');
function pythonForProject(project){
 const bundled=path.join(project,'runtime','python.exe');
 return fs.existsSync(bundled)?bundled:path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/runtime/Scripts/python.exe');
}
module.exports={pythonForProject};
