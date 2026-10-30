const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..'),base=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy');
const {createAdminNavigation}=require('../electron/maanikke-admin.cjs');
async function mocked(){
 let release,requestFile;
 const navigation=createAdminNavigation({project,run:async(_file,args)=>{
  requestFile=args[args.indexOf('-RequestFile')+1];
  return new Promise(resolve=>{release=resolve});
 }});
 await assert.rejects(navigation.request({hwnd:'arbitrary.exe',pid:1}),/Invalid/);
 const pending=navigation.request({hwnd:'123',pid:123});
 await assert.rejects(navigation.request({hwnd:'123',pid:123}),/已有管理员/);
 navigation.cancel();assert.ok(fs.existsSync(path.join(path.dirname(requestFile),'cancel')));
 release({stdout:JSON.stringify({started:false,canceled:true})});
 const result=await pending;assert.equal(result.inputRequests,0);assert.equal(navigation.logs().active,false);
 const report={passed:true,mocked:true,invalidTargetRejected:true,concurrentUACRejected:true,cancelRecorded:true,uacCancelNoInput:true};
 fs.writeFileSync(path.join(base,'admin-policy-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
async function real(){
 const {createService}=require('../electron/maanikke.cjs');
 const cacheRoot=path.join(base,'admin-preview-'+Date.now()),service=createService({project,cacheRoot});
 let target;
 try{
  await service.request('initialize');
  const windows=await service.request('windows');
  if(windows.count!==1)throw Error('需要唯一国服窗口，请在界面选择后触发');
  target=windows.windows[0];await service.request('connect',{hwnd:target.hwnd});
  const preview=await service.request('analyze');
  fs.writeFileSync(path.join(cacheRoot,'preflight.json'),JSON.stringify({...preview,capture:{...preview.capture,image:undefined}},null,2));
  if(preview.listPage.verified)throw Error('游戏已在妮姬列表，没有发送重复点击；请手动回大厅后重新触发');
  if(!preview.lobby||!preview.nikkeLocated)throw Error('大厅/妮姬定位未通过，未请求提权');
 }finally{await service.stop()}
 const result=await createAdminNavigation({project}).request(target);
 fs.writeFileSync(path.join(base,'latest-admin-attempt.json'),JSON.stringify({evidence:result.evidence,runId:result.runId,passed:result.passed,inputRequests:result.inputRequests,error:result.error,canceled:result.canceled},null,2));
 console.log(JSON.stringify({evidence:result.evidence,runId:result.runId,passed:result.passed,elevated:result.elevated,inputRequests:result.inputRequests,
  point:result.point,apiSucceeded:result.apiSucceeded,error:result.error,note:result.note,canceled:result.canceled,
  frames:result.after?.map(frame=>frame.listPage)},null,2));
 if(!result.passed)process.exitCode=1;
}
(process.argv.includes('--run')?real():mocked()).catch(error=>{console.error(error.stack);process.exitCode=1});
