// Fixed, user-triggered one-shot UAC experiment. Never accepts scripts, coordinates or task names.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
function createAdminNavigation({project,cacheRoot,run=execute,screenshotStore=null}){
 const base=cacheRoot?path.join(cacheRoot,'admin-nikke'):path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/admin-nikke');
 let active=null,lines=[];
 function log(text){lines.push('管理员单次测试：'+text);if(lines.length>30)lines.shift();}
 function cancel(){if(active){fs.writeFileSync(path.join(active,'cancel'),'user canceled');log('已记录停止请求，不会重新点击');}}
 async function request(target,{occludedTest=false,searchTest=false}={}){
  if(typeof occludedTest!=='boolean')throw Error('Invalid test mode');
  if(typeof searchTest!=='boolean'||(searchTest&&occludedTest))throw Error('Invalid search mode');
  if(active)throw Error('已有管理员单次请求正在进行');
  if(!target||!/^\d{1,20}$/.test(target.hwnd)||!Number.isSafeInteger(target.pid)||target.pid<=0)throw Error('Invalid admin target');
  const runId=crypto.randomUUID(),folder=path.join(base,runId);fs.mkdirSync(folder,{recursive:true});active=folder;
  const screenshotTask=screenshotStore?.beginTask();
  let taskFailed=true;
  const file=path.join(folder,'request.json');
  fs.writeFileSync(file,JSON.stringify({version:1,action:searchTest?'search-mermaid-once':occludedTest?'enter-nikke-occluded-once':'enter-nikke-once',runId,createdAt:Date.now()/1000,ownerPid:process.pid,
   target:{hwnd:target.hwnd,pid:target.pid},authorization:'User-triggered single enter-Nikke navigation experiment; human approves Windows UAC'},null,2));
  log(occludedTest?'等待本人确认UAC；通过后保持游戏未最小化，可由其他软件遮挡，15秒后检查并仅点击一次':'等待本人确认UAC；通过后请切回游戏，8秒后检查两帧并仅请求一次点击');
  try{
   const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(project,'desktop-scripts/request-maanikke-admin.ps1'),'-ProjectRoot',project,'-CacheRoot',path.dirname(base),'-RequestFile',file],
    {windowsHide:true,timeout:180000,maxBuffer:1024*1024,encoding:'utf8'});
   const launch=JSON.parse(stdout.replace(/^\uFEFF/,''));
   if(launch.canceled){log('UAC已取消，未执行输入');return {canceled:true,passed:false,inputRequests:0,evidence:folder};}
   const output=path.join(folder,'result.json');
   if(!fs.existsSync(output))throw Error('管理员模块未返回结果；未自动重试。请检查UAC与运行环境');
   const result=JSON.parse(fs.readFileSync(output,'utf8'));
   if(result.runId!==runId)throw Error('管理员结果身份校验失败');
   const last=(result.after||[]).length;
   let image;
   if(last){const png=path.join(folder,`after-${last}.png`);if(fs.existsSync(png))image='data:image/png;base64,'+fs.readFileSync(png).toString('base64');}
   taskFailed=!result.passed;
   if(screenshotStore){
    const sources=['before.png',...Array.from({length:last},(_,i)=>`after-${i+1}.png`)];
    const sourceFiles=[...sources.map(name=>path.join(folder,name)),path.join(folder,'runtime','latest-game.png')];
    for(const source of sourceFiles){
     if(!fs.existsSync(source)||fs.lstatSync(source).isSymbolicLink())continue;
     try{screenshotStore.add({taskId:screenshotTask,kind:!result.passed&&source===sourceFiles.at(-1)?'exception':'process',png:fs.readFileSync(source),savedAt:fs.statSync(source).mtimeMs})}
     catch(error){result.screenshotWarning=error.message;log(error.message)}
     finally{fs.unlinkSync(source)}
    }
   }
   log(`${result.passed?'进入妮姬列表并连续确认成功':result.error||result.note||'未通过'}；输入请求 ${result.inputRequests}`);
   return {...result,evidence:folder,image};
  }catch(error){cancel();log(error.message);throw error;}
  finally{if(screenshotTask)screenshotStore.endTask(screenshotTask,{failed:taskFailed});active=null;}
 }
 return {request,cancel,logs:()=>({active:!!active,lines:[...lines]})};
}
module.exports={createAdminNavigation};
