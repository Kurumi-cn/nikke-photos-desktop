const path=require('node:path'),fs=require('node:fs');
module.exports=function register({ipcMain,requireSender,cacheRoot,packaged,confirmClick,ordinaryCompatibilityTest=false}) {
 require('../experiments/maa/lab-availability.cjs').assertLabEnabled();
 let matcher,live;
 const get=()=>{
  if(packaged)throw Error('自动化实验室仅在源码开发环境提供；当前Beta未包含实验依赖');
  if(!matcher){const cache=path.join(cacheRoot,'maa-lab');fs.mkdirSync(cache,{recursive:true});matcher=require('../experiments/maa/matcher.cjs').createMatcher(cache);}
  return matcher;
 };
 ipcMain.handle('maa-lab:info',event=>{requireSender(event);try{return {available:true,...get().info(),ordinaryCompatibilityTest}}catch(e){return {available:false,error:e.message}}});
 ipcMain.handle('maa-lab:match',(event,input)=>{requireSender(event);return get().match(input)});
 const getLive=()=>{
  if(!live){const cache=path.join(cacheRoot,'maa-live');live=require('../experiments/maa/live.cjs').createLive({cache,matcher:get(),ordinaryCompatibilityTest,templatePath:path.resolve(__dirname,'../../codex temp/nikke-desktop/maa-lab/fixtures/nikke.png')});}
  return live;
 };
 for(const [name,fn] of Object.entries({windows:()=>getLive().windows(),connect:input=>getLive().connect(input?.handle,input?.mode),preview:()=>getLive().preview(),status:()=>getLive().status(),stop:()=>getLive().stop(),verify:input=>getLive().verify(input?.id,input?.passed)}))ipcMain.handle('maa-live:'+name,(event,input)=>{requireSender(event);return fn(input)});
 let confirming=false;
 let adminRequest;
 ipcMain.handle('maa-live:request-admin',async event=>{
  requireSender(event);get();
  if(ordinaryCompatibilityTest)throw Error('本轮禁止管理员提权，不能发起UAC请求');
  if(live?.status().busy||confirming)throw Error('请先等待当前单次操作或确认结束，再请求管理员窗口');
  live?.stop();
  if(!adminRequest)adminRequest=require('../experiments/maa/request-admin.cjs').createAdminRequest({project:path.resolve(__dirname,'..'),cache:path.resolve(__dirname,'../../codex temp/nikke-desktop/maa-admin-lab')});
  return adminRequest();
 });
 ipcMain.handle('maa-live:click',async(event,input)=>{
  requireSender(event);if(confirming)throw Error('已有单击确认待处理');confirming=true;
  try{if(!await confirmClick(input))return {canceled:true};if(ordinaryCompatibilityTest)fs.appendFileSync(path.join(cacheRoot,'interface-confirmations.jsonl'),JSON.stringify({at:new Date().toISOString(),method:getLive().status().binding?.inputMethod,source:'native experiment confirmation dialog',confirmed:true})+'\n');return await getLive().click(input?.token,true)}finally{confirming=false}
 });
 return {getLive,close:()=>live?.close()};
};
