const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..'),cacheRoot=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/check-'+Date.now());
const {createService}=require('../electron/maanikke.cjs');
const service=createService({project,cacheRoot});
async function main(){
 const report={cacheRoot,gameInputs:0};
 try{
  await assert.rejects(service.request('post_task'),/Unsupported/);
  await assert.rejects(service.request('click',{hwnd:'123'}),/Unsupported/);
  await assert.rejects(service.request('connect',{hwnd:'bad'}),/Invalid/);
  report.commandBoundary=true;
  if(process.argv.includes('--lifecycle')){
   const pending=service.request('initialize').then(()=>false,()=>true);
   await assert.rejects(service.request('windows'),/已有操作/);
   await service.stop();assert.equal(await pending,true);assert.equal(service.logs().running,false);
   await assert.rejects(service.request('capture'),/请先连接/);
   report.stopWhileBusyAndStaleConnectionRejected=true;
  }
  report.initialization=await service.request('initialize');
  assert.equal(report.initialization.native,'v5.12.2');assert.equal(report.initialization.agentConnected,true);
  report.windows=await service.request('windows');
  if(process.argv.includes('--live')&&report.windows.count===1){
   report.connection=await service.request('connect',{hwnd:report.windows.windows[0].hwnd});
   const capture=await service.request('capture');report.capture={...capture,image:undefined};
   const result=await service.request('analyze');report.recognition={...result,capture:{...result.capture,image:undefined}};
  }
  if(process.argv.includes('--input-test')){report.inputTest=await service.request('inputTest');assert.equal(report.inputTest.passed,true);}
  report.passed=true;
 }catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
 finally{await service.stop();report.logs=service.logs();fs.mkdirSync(cacheRoot,{recursive:true});fs.writeFileSync(path.join(cacheRoot,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
}
main();
