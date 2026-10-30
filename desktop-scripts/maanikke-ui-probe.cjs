const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window,cacheRoot})=>{
 const web=window.webContents;
 async function until(expression,label){for(let i=0;i<180;i++){const result=await web.executeJavaScript(expression);if(result)return result;await delay(200)}throw Error('UI timeout: '+label)}
 async function click(text){await until(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});return b&&!b.disabled})()`,text+' enabled');await web.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)throw Error('Unavailable button: '+${JSON.stringify(text)});button.click()})()`)}
 const storeSnapshot='JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))';
 const report={gameInputs:0};
 await web.executeJavaScript("location.hash='/automation-diagnostics'");
 await until("document.body.innerText.includes('MaaNikke 集成测试模式')",'route');
 await delay(300); // Allow the existing application's first-launch profile initialization to settle.
 const before=await web.executeJavaScript(storeSnapshot);
 const screenshotBaseline=await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('stats').then(v=>v.count)");
 report.initiallyIdle=await web.executeJavaScript("document.body.innerText.includes('尚未初始化')");
 assert.equal(report.initiallyIdle,true);
 report.rosterCount=await web.executeJavaScript("document.querySelectorAll('[aria-label=\"采集角色列表\"] input[type=checkbox]').length");
 assert.equal(report.rosterCount,205);
 await web.executeJavaScript("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='清空选择');if(b&&!b.disabled)b.click()})()");await delay(80);
 await web.executeJavaScript("document.querySelector('[aria-label=\"采集 桃乐丝\"]').click()");await delay(80);
 report.rosterSelection=await web.executeJavaScript("document.querySelector('[aria-label=\"角色装备采集\"]').innerText.includes('已选 1 / 205')");assert.equal(report.rosterSelection,true);
 await click('清空选择');
 await click('初始化 MaaNikke');
 await until("document.body.innerText.includes('Agent 已连接')",'Agent initialization');
 report.realAgentConnected=true;
 const runtime=await web.executeJavaScript("window.nikkeDesktop.maanikke.request('initialize')");
 report.runtime={binding:runtime.binding,native:runtime.native,workerElevated:runtime.workerElevated};
 await click('检测国服窗口');
 await until("!document.querySelector('div.maa-card[role=status]').textContent.includes('运行中')",'window detection');
 report.windowCount=await web.executeJavaScript("document.querySelector('select[aria-label=\"国服窗口\"]').options.length-1");
 report.adminButtonPresent=await web.executeJavaScript("!![...document.querySelectorAll('button')].find(b=>b.textContent==='请求提权并单次进入妮姬')");
 assert.equal(report.adminButtonPresent,true);
 report.detectedWindows=await web.executeJavaScript("window.nikkeDesktop.maanikke.request('windows').then(v=>v.windows)");
 if(report.windowCount===1){
  await click('连接所选窗口');await until("document.body.innerText.includes('已连接：')",'connection');
  await click('新截图并识别大厅 / 妮姬');
  await until("document.querySelector('[aria-label=\"MaaNikke识别结果\"]')!==null",'recognition');
  report.recognitionText=await web.executeJavaScript("document.querySelector('[aria-label=\"MaaNikke识别结果\"]').innerText.split('节点结果')[0]");
  report.listPageDisplayed=report.recognitionText.includes('妮姬列表：已确认');
  report.screenshotLoaded=await web.executeJavaScript("(()=>{const i=document.querySelector('img[alt=\"MaaNikke实时游戏截图\"]');return i?.complete&&i.naturalWidth===1920})()");
  assert.equal(report.screenshotLoaded,true);
  const duringCapture=await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('stats')");
  assert.ok(duringCapture.count>0);assert.equal(duringCapture.activeTasks,1);
  report.marker=await web.executeJavaScript("!!document.querySelector('[aria-label=\"妮姬按钮命中框\"]')");
 }
 fs.writeFileSync(path.join(cacheRoot,'maanikke-lab-light.png'),(await web.capturePage()).toPNG());
 await web.executeJavaScript("document.documentElement.setAttribute('data-theme','dark');document.querySelector('[aria-label=\"MaaNikke识别结果\"]')?.scrollIntoView({block:'center'})");await delay(150);
 fs.writeFileSync(path.join(cacheRoot,'maanikke-lab-dark.png'),(await web.capturePage()).toPNG());
 report.storeUnchanged=before===await web.executeJavaScript(storeSnapshot);
 assert.equal(report.storeUnchanged,true);
 await click('停止并断开');await until("document.body.innerText.includes('尚未初始化')",'stop');
 report.workerStopped=await web.executeJavaScript('window.nikkeDesktop.maanikke.logs().then(v=>!v.running&&!v.busy&&!v.adminActive)');
 assert.equal(report.workerStopped,true);
 const screenshotDefaults=await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('stats')");
 assert.equal(screenshotDefaults.settings.exceptionDays,3);assert.equal(screenshotDefaults.settings.equipmentCleanup,'task');
 assert.equal(screenshotDefaults.count,screenshotBaseline);
 await web.executeJavaScript("(()=>{const el=document.querySelector('select[aria-label=\"装备结果图清理\"]');el.value='character';el.dispatchEvent(new Event('change',{bubbles:true}));const ex=document.querySelector('select[aria-label=\"异常截图保留\"]');ex.value='1';ex.dispatchEvent(new Event('change',{bubbles:true}))})()");
 await delay(100);await click('保存截图设置');await until("document.body.innerText.includes('截图设置已保存')",'screenshot settings saved');
 const screenshotChanged=await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('stats')");
 assert.equal(screenshotChanged.settings.exceptionDays,1);assert.equal(screenshotChanged.settings.equipmentCleanup,'character');
 await click('一键清理截图');await until("document.body.innerText.includes('已清理')",'screenshot cleanup');
 await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('settings',{equipmentCleanup:'task',exceptionDays:3,maxMiB:1024})");
 await click('刷新截图占用');
 await web.executeJavaScript("document.querySelector('[aria-label=\"截图管理\"]').scrollIntoView({block:'center'})");await delay(150);
 fs.writeFileSync(path.join(cacheRoot,'screenshot-settings.png'),(await web.capturePage()).toPNG());
 report.screenshotManagement={defaults:true,taskEndCleanup:true,settingsSaved:true,oneClickCleanup:true};
 report.legacyIsolated=await require('./check-lab-isolation.cjs')({window,ipcMain:require('electron').ipcMain});
 if(process.argv.includes('--collection-live-check')){report.collection=await require('./collection-live-probe.cjs')({window,cacheRoot});report.preCollectionChecksGameInputs=0;report.gameInputs=report.collection.inputRequests;}
 report.passed=true;return report;
};
