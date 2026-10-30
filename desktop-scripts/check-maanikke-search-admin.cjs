const path=require('node:path'),fs=require('node:fs');
const project=path.resolve(__dirname,'..');
const {createService}=require('../electron/maanikke.cjs');
const {createAdminNavigation}=require('../electron/maanikke-admin.cjs');
const cacheRoot=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/search-admin-launch-'+Date.now());
const service=createService({project,cacheRoot});
async function main(){
 try{
  await service.request('initialize');
  const targets=(await service.request('windows')).windows;
  if(targets.length!==1)throw Error('Require unique current game window');
  await service.stop();
  const result=await createAdminNavigation({project}).request(targets[0],{searchTest:true});
  const {image,...report}=result;
  fs.mkdirSync(cacheRoot,{recursive:true});fs.writeFileSync(path.join(cacheRoot,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:result.passed,stage:result.stage,inputRequests:result.inputRequests,actions:result.actions,error:result.error,evidence:result.evidence,note:result.note}));
  if(!result.passed)process.exitCode=1;
 }finally{await service.stop();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
