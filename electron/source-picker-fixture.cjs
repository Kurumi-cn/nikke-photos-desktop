// Disposable, separate-process window for the picker -> original WGC acceptance test.
const {app,BrowserWindow}=require('electron');
app.setPath('userData',process.env.NIKKE_FIXTURE_DATA);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:720,height:480,show:false,title:'OCR 来源选择验收窗口',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.setMenu(null);
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><title>OCR 来源选择验收窗口</title><body style="margin:0;background:#eef2f6;font:24px sans-serif"><h1>截图流程验收</h1><p>这是用于验证来源选择的临时窗口。</p></body>'));
  win.showInactive();process.send?.('ready');
});
process.on('message',message=>{if(message==='close')app.exit(0)});
setTimeout(()=>app.exit(1),45000).unref();
