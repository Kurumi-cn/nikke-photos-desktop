// Ordinary worker RPC stays read-only for games. One explicit UAC navigation operation is handled separately.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const COMMANDS=new Set(['initialize','windows','connect','capture','analyze','inputTest']);
function createService({project,cacheRoot,screenshotStore=null}){
 const cache=path.join(cacheRoot,'maanikke');fs.mkdirSync(cache,{recursive:true});
 const python=require('./automation-paths.cjs').pythonForProject(project);
 let child=null,pending=null,seq=0,buffer='',lines=[];
 let screenshotTask=null;
 function finishScreenshots(failed=false){if(screenshotTask){screenshotStore.endTask(screenshotTask,{failed});screenshotTask=null;}const latest=path.join(cache,'latest-game.png');if(screenshotStore&&fs.existsSync(latest)&&!fs.lstatSync(latest).isSymbolicLink())fs.unlinkSync(latest);}
 function remember(value){
  const frame=value?.capture?.image?value.capture:value;
  if(!screenshotStore||typeof frame?.image!=='string')return;
  if(!screenshotTask)screenshotTask=screenshotStore.beginTask();
  screenshotStore.add({taskId:screenshotTask,png:Buffer.from(frame.image.split(',')[1],'base64'),savedAt:frame.capturedAt*1000});
 }
 const record=text=>{const line=String(text).slice(0,2000);lines.push(line);if(lines.length>120)lines.shift();fs.appendFileSync(path.join(cache,'bridge.log'),new Date().toISOString()+' '+line+'\n');};
 function terminate(failed=true){
  const current=child;child=null;buffer='';
  if(pending){clearTimeout(pending.timer);pending.reject(Error('自动化模块已停止；需重新初始化'));pending=null;}
  if(!current){finishScreenshots(failed);return Promise.resolve();}
  current.stdin.end();
  return new Promise(resolve=>{
   if(current.exitCode!==null)return resolve();
   const timer=setTimeout(()=>{
    // Only our worker's owned process tree, including its Agent and temporary test receiver.
    const killer=spawn('taskkill.exe',['/PID',String(current.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.once('error',()=>{current.kill();resolve()});killer.once('exit',resolve);
   },1500);
   current.once('exit',()=>{clearTimeout(timer);resolve()});
  }).then(()=>finishScreenshots(failed));
 }
 function start(){
  if(child)return;
  if(!fs.existsSync(python))throw Error('装备采集运行环境缺失，请重新安装完整客户端或配置固定开发环境');
  const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',TEMP:path.join(cacheRoot,'temp'),TMP:path.join(cacheRoot,'temp')};
  delete env.MAAFW_BINARY_PATH;delete env.PYTHONPATH;delete env.PYTHONHOME;
  fs.mkdirSync(env.TEMP,{recursive:true});
  child=spawn(python,['-I','-B','-X','utf8','-u',path.join(project,'automation/maanikke/worker.py'),cache],{cwd:project,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const current=child;record('worker started pid='+current.pid);
  current.stdout.setEncoding('utf8');current.stderr.setEncoding('utf8');
  current.stdout.on('data',chunk=>{
   if(child!==current)return;
   buffer+=chunk;
   if(buffer.length>48*1024*1024){record('Worker output limit exceeded');void terminate();return;}
   let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos).trim();buffer=buffer.slice(pos+1);
    if(!line.startsWith('@@PHOTOS@@')){if(line)record(line);continue;}
    try{const response=JSON.parse(line.slice(10));
     if(pending&&response.id===pending.id){const done=pending;pending=null;clearTimeout(done.timer);
      record(done.command+(response.ok?' completed':' failed: '+response.error));
      if(response.ok){try{remember(response.result);done.resolve(response.result)}catch(error){done.reject(error)}}else{finishScreenshots(true);done.reject(Error(response.error));}}
    }catch(error){record('Malformed worker response: '+error.message);void terminate();}
   }
  });
  current.stderr.on('data',chunk=>record(chunk));
  current.stdin.on('error',error=>{record(error.message);if(child===current)void terminate();});
  current.once('error',error=>{record(error.message);if(child===current)void terminate();});
  current.once('exit',(code,signal)=>{record(`worker exit ${code}/${signal}`);if(child===current){child=null;buffer='';finishScreenshots(true);if(pending){clearTimeout(pending.timer);pending.reject(Error('自动化进程退出，查看错误日志后重新初始化'));pending=null;}}});
 }
 async function request(command,args={}){
  if(!COMMANDS.has(command))throw Error('Unsupported MaaNikke command');
  if(pending)throw Error('已有操作正在进行，请等待或停止');
  if(command==='connect'&&(!args||!/^\d{1,20}$/.test(args.hwnd)))throw Error('Invalid window identifier');
  start();
  return new Promise((resolve,reject)=>{
   const id=++seq;
   const timer=setTimeout(()=>{record(command+' timeout');void terminate();},command==='inputTest'?45000:60000);
   pending={id,command,resolve,reject,timer};
   child.stdin.write(JSON.stringify({id,command,args:command==='connect'?{hwnd:args.hwnd}:{}})+'\n');
  });
 }
 return {request,stop:()=>terminate(false),logs:()=>({running:!!child,busy:pending?.command||null,lines:[...lines],cache})};
}
function register({ipcMain,requireSender,project,cacheRoot,app}){
 const screenshots=require('./maanikke-screenshots.cjs').createScreenshotStore({cacheRoot});
 screenshots.startup();
 const service=createService({project,cacheRoot,screenshotStore:screenshots});
 const admin=require('./maanikke-admin.cjs').createAdminNavigation({project,cacheRoot,screenshotStore:screenshots});
 const collection=require('./maanikke-collection.cjs').createCollection({project,cacheRoot,screenshots,shortcuts:require('electron').globalShortcut});
 ipcMain.handle('maanikke:screenshots',async(event,command,args)=>{
  requireSender(event);
  if(command==='stats')return screenshots.stats();
  if(command==='read')return screenshots.read(args?.id);
  if(command==='settings')return screenshots.settings(args);
  if(command==='clean')return {...screenshots.clean(),...screenshots.stats()};
  if(command==='directory'){
   const {dialog,BrowserWindow}=require('electron');
   const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'选择自动化截图存放位置',properties:['openDirectory','createDirectory']});
   return result.canceled?screenshots.stats():screenshots.changeDirectory(result.filePaths[0]);
  }
  throw Error('Unsupported screenshot command');
 });
 ipcMain.handle('maanikke:request',async(event,command,args)=>{
  requireSender(event);
  if(command==='collectionStatus')return collection.status();
  if(command==='collectionPause')return collection.pause();
  if(command==='collectionCancel'){collection.cancel();return collection.status();}
  if(command==='collectionPreferences')return collection.preferences(args);
  if(command==='collectionEditRow')return collection.editRow(args);
  if(command==='collectionReviewDone')return collection.reviewDone(args);
  if(command==='collectionArchiveReceipt')return collection.archiveReceipt(args);
  if(command==='prepareGame'){
   if(collection.active()||admin.logs().active)throw Error('任务运行中，请结束后再连接');
   await service.request('initialize');const found=await service.request('windows');
   const target=args?.hwnd?found.windows.find(w=>w.hwnd===args.hwnd):found.windows.length===1?found.windows[0]:null;
   if(!target)return {connected:false,windows:found.windows,error:found.count?'检测到多个游戏窗口，请选择后连接':'没有找到国服游戏窗口，请启动游戏后重试'};
   const connected=await service.request('connect',{hwnd:target.hwnd});return {...connected,windows:found.windows};
  }
  if(command==='collectionStart'){
   if(admin.logs().active||collection.active())throw Error('已有自动化任务正在进行');
   const found=await service.request('windows');
   const target=args?.hwnd?found.windows.find(w=>w.hwnd===args.hwnd):found.windows.length===1?found.windows[0]:null;
   if(!target)throw Error('需要唯一国服窗口，请先检测并选择窗口');
   await service.stop();return collection.start({...args,target});
  }
  if(collection.active())throw Error('角色采集正在运行，请暂停或停止后操作');
  if(command==='adminEnterNikke'){
   if(admin.logs().active)throw Error('已有管理员请求正在进行');
   const found=await service.request('windows');
   const target=found.windows.find(w=>w.hwnd===args?.hwnd);
   if(!target)throw Error('请重新检测并选择国服窗口');
   await service.stop();return admin.request(target);
  }
  if(admin.logs().active)throw Error('管理员单次实验进行中，请等待或停止');
  return service.request(command,args);
 });
 ipcMain.handle('maanikke:logs',event=>{requireSender(event);const normal=service.logs(),elevated=admin.logs();return {...normal,adminActive:elevated.active,collectionActive:collection.active(),lines:[...normal.lines,...elevated.lines,...(collection.status().logs||[])]}});
 ipcMain.handle('maanikke:stop',event=>{requireSender(event);admin.cancel();collection.cancel();return service.stop()});
 let quitting=false;
 app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;admin.cancel();collection.cancel();Promise.all([service.stop(),Promise.race([collection.wait(),new Promise(resolve=>setTimeout(resolve,2500))])]).finally(()=>{try{if(!collection.active())collection.clearSession()}finally{app.quit()}});});
 return service;
}
module.exports={createService,register,COMMANDS};
