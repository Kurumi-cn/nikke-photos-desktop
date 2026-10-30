const { app, BrowserWindow, protocol, net, ipcMain, Menu, dialog, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const project = path.resolve(__dirname, '..');
// Experimental launchers are suspended; reject them before touching any data directory.
if(process.argv.some(arg=>arg.startsWith('--maa-')))throw Error('自动化实验室已屏蔽，实验启动参数不可使用');
const {resolveStoragePaths,writeLocation}=require('./storage-paths.cjs');
const {storageHome,dataRoot,cacheRoot,storageMode}=resolveStoragePaths({packaged:app.isPackaged,project,executable:process.execPath,localAppData:process.env.LOCALAPPDATA||path.join(app.getPath('home'),'AppData','Local')});
for (const dir of [cacheRoot, dataRoot, path.join(cacheRoot,'temp'), path.join(cacheRoot,'logs')]) fs.mkdirSync(dir, {recursive:true});
process.env.TEMP = process.env.TMP = path.join(cacheRoot,'temp');
app.setPath('userData', dataRoot);
app.setPath('sessionData', dataRoot);
app.setPath('temp', path.join(cacheRoot,'temp'));
app.setAppLogsPath(path.join(cacheRoot,'logs'));
app.setPath('crashDumps', path.join(cacheRoot,'crashes'));
// Chromium storage stays durable; its disposable directories are redirected to the shared cache.
for (const name of ['GPUPersistentCache','Shared Dictionary','Cache','Code Cache','GPUCache','DawnCache','DawnGraphiteCache','DawnWebGPUCache','ShaderCache','GrShaderCache','GraphiteDawnCache']) {
  const target = path.join(cacheRoot,'chromium',name);
  fs.mkdirSync(target,{recursive:true});
  const link = path.join(dataRoot,name);
  if (!fs.existsSync(link)) fs.symlinkSync(target,link,process.platform === 'win32' ? 'junction' : 'dir');
}
app.commandLine.appendSwitch('disk-cache-dir', path.join(cacheRoot,'chromium','Cache'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
protocol.registerSchemesAsPrivileged([{scheme:'nikke', privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const captureCheck = !app.isPackaged && process.argv.includes('--capture-check');
const sourcePickerCheck = !app.isPackaged && process.argv.includes('--source-picker-check');
const customNikkeCheck = !app.isPackaged && process.argv.includes('--custom-nikke-check');
const rerollImportCheck = !app.isPackaged && process.argv.includes('--reroll-import-check');
const workspaceUiCheck = !app.isPackaged && process.argv.includes('--workspace-ui-check');
const rerollStrategyCheck = !app.isPackaged && process.argv.includes('--reroll-strategy-check');
const maanikkeUiCheck = !app.isPackaged && process.argv.includes('--maanikke-ui-check');
const collectionUiCheck = !app.isPackaged && process.argv.includes('--collection-ui-check');
const smoke = !app.isPackaged && (collectionUiCheck || maanikkeUiCheck || rerollStrategyCheck || workspaceUiCheck || rerollImportCheck || customNikkeCheck || sourcePickerCheck || captureCheck || process.argv.includes('--smoke-test'));
let mainWindow;
if(smoke) setTimeout(()=>app.exit(1),process.argv.includes('--collection-live-check')?900000:90000).unref();
const log = message => fs.appendFileSync(path.join(cacheRoot,'logs','desktop.log'), new Date().toISOString()+' '+message+'\n');
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
app.on('second-instance', () => { if (mainWindow) { if(mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.whenReady().then(async () => {
  protocol.handle('nikke', request => {
    const url = new URL(request.url);
    if(!['app','tools','reroll'].includes(url.host)) return new Response('Forbidden',{status:403});
    let filename;
    try { filename = decodeURIComponent(url.pathname); } catch { return new Response('Bad path',{status:400}); }
    const base = url.host === 'app' ? path.join(project,'dist') : path.join(project,'dist','tools');
    const file = path.resolve(base,'.'+(filename === '/' ? '/index.html' : filename));
    if(!file.startsWith(base+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_web, permission, callback) => callback(permission === 'display-capture'));
  session.defaultSession.setPermissionCheckHandler((_web, permission) => permission === 'display-capture');
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const {desktopCapturer} = require('electron');
      if(!mainWindow || request.frame !== mainWindow.webContents.mainFrame || !request.frame.url.startsWith('nikke://app/')) return callback({});
      const source = await require('./capture-source.cjs').chooseCaptureSource({desktopCapturer,dialog,window:mainWindow,presentSources,manual:manualCapture,log});
      manualCapture=false;
      callback(source ? {video:source} : {});
    } catch(error) { log(String(error)); callback({}); }
    finally { manualCapture=false; }
  });
  let manualCapture=false;
  ipcMain.handle('desktop:capture-mode',(event,manual)=>{
    if(event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith('nikke://app/')) throw new Error('Invalid sender');
    manualCapture=manual===true;
  });
  ipcMain.handle('desktop:info', event => {
    if(event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith('nikke://app/')) throw new Error('Invalid sender');
    return {version:app.getVersion(),cacheRoot,dataRoot,storageMode,capabilities:{screenCapture:true,automation:true,applicationSource:app.isPackaged}};
  });
  const {createResourceIncomeStore} = await import('./resource-income-store.mjs');
  const resourceIncomeStore = createResourceIncomeStore(dataRoot);
  function requireResourceSender(event) {
    if(event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith('nikke://app/')) throw new Error('Invalid sender');
  }
  let nativeCaptureBusy=false;
  let presentSources;
  ipcMain.handle('desktop:capture-frame',async(event,options)=>{
    requireResourceSender(event);
    if(nativeCaptureBusy)throw Error('截图正在进行，请稍候');
    nativeCaptureBusy=true;
    try {
      const {chooseCaptureSource,windowProcesses}=require('./capture-source.cjs');
      const source=await chooseCaptureSource({desktopCapturer:require('electron').desktopCapturer,dialog,window:mainWindow,presentSources,manual:options?.manual===true,windowsOnly:true,log});
      if(!source)return {canceled:true};
      const handle=/^window:(\d+):/.exec(source.id)?.[1];
      const owner=(await windowProcesses()).find(p=>p.handle===handle);
      const result=await require('./windows-capture.cjs').captureNativeWindow({source,pid:owner?.pid,cacheRoot});
      log('Native capture: '+JSON.stringify({backend:result.backend,cursor:result.cursor,width:result.width,height:result.height,contentWidth:result.contentWidth,contentHeight:result.contentHeight}));
      return result;
    }finally{nativeCaptureBusy=false;}
  });
  for(const [name,operation] of Object.entries({read:()=>resourceIncomeStore.read(),save:input=>resourceIncomeStore.upsert(input),remove:date=>resourceIncomeStore.remove(date)})) {
    ipcMain.handle('resource-income:'+name,(event,input)=>{requireResourceSender(event);return operation(input)});
  }
  ipcMain.handle('resource-income:export',async event=>{
    requireResourceSender(event);
    const content=resourceIncomeStore.backupJSON();
    const {canceled,filePath}=await dialog.showSaveDialog(mainWindow,{title:'导出订制模组记录备份',defaultPath:path.join(dataRoot,'resource-income-backup.json'),filters:[{name:'JSON 备份',extensions:['json']}]});
    if(canceled || !filePath)return {canceled:true};
    if([resourceIncomeStore.file,resourceIncomeStore.file+'.bak',resourceIncomeStore.file+'.next'].some(file=>path.resolve(file).toLowerCase()===path.resolve(filePath).toLowerCase()))throw Error('请选择独立备份文件，不能覆盖工作数据');
    fs.writeFileSync(filePath,content,'utf8');return {canceled:false};
  });
  mainWindow = new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:700,show:!smoke&&process.env.NIKKE_QA_HIDDEN!=='1',title:'NIKKE Photos',icon:path.join(project,'dist','favicon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:!smoke,offscreen:smoke && !rerollStrategyCheck && !workspaceUiCheck && !sourcePickerCheck && !customNikkeCheck && !rerollImportCheck}});
  presentSources=require('./source-picker.cjs').createSourcePicker({ipcMain,web:mainWindow.webContents,requireSender:requireResourceSender});
  require('./maanikke.cjs').register({ipcMain,requireSender:requireResourceSender,project:app.isPackaged?path.join(process.resourcesPath,'automation-app'):project,cacheRoot,app});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(url==='https://space.bilibili.com/1753455535')require('electron').shell.openExternal(url).catch(error=>log('Author link: '+error.message));return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('nikke://app/')) event.preventDefault();});
  mainWindow.webContents.on('render-process-gone',(_event,details)=>log(JSON.stringify(details)));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'客户端',submenu:[{label:'重新加载',role:'reload'},{label:'打开数据目录',click:()=>require('electron').shell.openPath(dataRoot)},{label:'打开缓存目录',click:()=>require('electron').shell.openPath(cacheRoot)},...(app.isPackaged?[{label:'接续旧版 data 目录…',click:async()=>{
    const picked=await dialog.showOpenDialog(mainWindow,{title:'选择原桌面版的 data 文件夹',properties:['openDirectory']});
    if(picked.canceled)return;
    const result=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','使用旧目录并重启'],defaultId:0,cancelId:0,message:'请先关闭使用该目录的旧版程序。',detail:'将直接使用你选择的旧目录，不复制或合并数据库；当前数据目录会原样保留。卸载也会保留这些数据。'});
    if(result.response!==1)return;
    try{writeLocation(storageHome,picked.filePaths[0]);app.relaunch();app.quit()}catch(error){dialog.showErrorBox('未切换数据目录',error.message)}
  }}]:[]),{type:'separator'},{role:'quit',label:'退出'}]},{label:'视图',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},{role:'toggleDevTools'}]}]));
  await mainWindow.loadURL('nikke://app/');
  if(collectionUiCheck) {
    const result=await require('../desktop-scripts/collection-ui-probe.cjs')({window:mainWindow,cacheRoot,ipcMain});
    fs.writeFileSync(path.join(cacheRoot,'collection-ui-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(maanikkeUiCheck) {
    const result=await require('../desktop-scripts/maanikke-ui-probe.cjs')({window:mainWindow,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'maanikke-ui-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(rerollStrategyCheck) {
    const result=await require('./check-reroll-strategy.cjs')({window:mainWindow,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'reroll-strategy-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(workspaceUiCheck) {
    const result=await require('./check-workspace-ui.cjs')({window:mainWindow,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'workspace-ui-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(rerollImportCheck) {
    const result=await require('./check-reroll-import.cjs')({window:mainWindow,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'reroll-import-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(customNikkeCheck) {
    const result=await require('./check-custom-nikke.cjs')({window:mainWindow,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'custom-nikke-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(sourcePickerCheck) {
    const result=await require('./check-source-picker.cjs')({window:mainWindow,presentSources,cacheRoot});
    fs.writeFileSync(path.join(cacheRoot,'source-picker-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(captureCheck) {
    const result=await require('./check-capture.cjs')(mainWindow,cacheRoot);
    fs.writeFileSync(path.join(cacheRoot,'capture-quality','desktop-result.json'),JSON.stringify(result,null,2));
    app.exit(0);return;
  }
  if(smoke) {
    const automationIsolation=await require('../desktop-scripts/check-lab-isolation.cjs')({window:mainWindow,ipcMain});
    const result = await mainWindow.webContents.executeJavaScript(`(async()=>{await new Promise(r=>setTimeout(r,1800)); const response=await fetch('./ocr/font-templates/Azonix-game/manifest.json'); const info=await window.nikkeDesktop.getInfo(); localStorage.setItem('desktop-smoke','ok'); return {text:document.body.innerText.length,ocr:response.ok,bridge:!!info.cacheRoot,storage:localStorage.getItem('desktop-smoke')==='ok'};})()`);
    result.automationIsolation=automationIsolation;
    try { result.tools = await require('./check-tools.cjs')(mainWindow, cacheRoot); result.resourceIncome = await require('./check-resource-income.cjs')(mainWindow, cacheRoot); result.belorta = await require('./check-belorta.cjs')(mainWindow, cacheRoot); }
    catch(error) {
      fs.writeFileSync(path.join(cacheRoot,'tools-smoke-failed.png'),(await mainWindow.webContents.capturePage()).toPNG());
      throw error;
    }
    fs.writeFileSync(path.join(cacheRoot,'smoke-result.json'),JSON.stringify(result,null,2));
    app.exit(result.text > 100 && result.ocr && result.bridge && result.storage ? 0 : 1);
  }
}).catch(error=>{log(error.stack || String(error)); if(!smoke) dialog.showErrorBox('NIKKE Photos 启动失败',String(error)); app.exit(1);});
app.on('window-all-closed',()=>app.quit());
}


