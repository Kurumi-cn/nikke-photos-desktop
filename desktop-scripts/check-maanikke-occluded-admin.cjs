// Explicit manual UAC test entry; no game inputs until fixed helper checks pass.
const path=require('node:path'),fs=require('node:fs');
const project=path.resolve(__dirname,'..');
const {createService}=require('../electron/maanikke.cjs');
const {createAdminNavigation}=require('../electron/maanikke-admin.cjs');
const cacheRoot=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/occluded-admin-launch-'+Date.now());
const service=createService({project,cacheRoot});
const admin=createAdminNavigation({project});
async function main(){
 try{
  await service.request('initialize');
  const targets=(await service.request('windows')).windows;
  if(targets.length!==1)throw Error('Require one current game window');
  await service.stop();
  const result=await admin.request(targets[0],{occludedTest:true});
  const {image,...summary}=result;
  fs.mkdirSync(cacheRoot,{recursive:true});
  fs.writeFileSync(path.join(cacheRoot,'result.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({passed:result.passed,inputRequests:result.inputRequests,stage:result.stage,error:result.error,note:result.note,evidence:result.evidence,coverageHeld:result.coverageHeld}));
  if(!result.passed)process.exitCode=1;
 }finally{await service.stop();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
