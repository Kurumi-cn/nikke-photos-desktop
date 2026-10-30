// Runs only against the explicitly named generated QA installation and data homes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),qa=path.resolve(root,'../codex temp/nikke-desktop/release-v1.0/lifecycle-'+Date.now());
fs.mkdirSync(qa,{recursive:true});
const report={qaRoot:qa,checks:{},runs:[]};
let activeQuit=null;
const setup=path.join(root,'release/v1.0/NIKKE-Photos-v1.0-Windows-x64-Setup.exe');
const install=path.join(qa,'Custom 安装目录','NIKKE Photos');
const userLocal=path.join(qa,'UserLocal');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const note=s=>{console.log(s);fs.appendFileSync(path.join(qa,'progress.log'),new Date().toISOString()+' '+s+'\n')};
function allowed(folder){assert.ok(path.resolve(folder).startsWith(qa+path.sep),'QA operation escaped its directory')}
async function until(fn,label){for(let i=0;i<250;i++){if(await fn())return;await delay(100)}throw Error('Timeout: '+label)}
async function installPackage(installer,folder){allowed(folder);note('Install: '+path.basename(installer));const r=spawnSync(installer,['/S','/currentuser','/D='+folder],{argv0:'"'+installer+'"',windowsHide:true,windowsVerbatimArguments:true,timeout:180000,stdio:'pipe'});if(r.error)throw r.error;assert.equal(r.status,0,'installer exit');assert.ok(fs.existsSync(path.join(folder,'NIKKE Photos.exe')))}
async function uninstall(folder){allowed(folder);note('Uninstall owned application files');const file=path.join(folder,'Uninstall NIKKE Photos.exe');assert.ok(fs.existsSync(file));const r=spawnSync(file,['/S'],{windowsHide:true,timeout:180000,stdio:'pipe'});if(r.error)throw r.error;assert.equal(r.status,0);await until(()=>!fs.existsSync(path.join(folder,'resources','app.asar')),'uninstall removal')}
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p}
async function connect(url){const ws=new WebSocket(url),pending=new Map();let sequence=0;await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(!d.id)return;const cb=pending.get(d.id);if(!cb)return;pending.delete(d.id);d.error?cb.reject(Error(d.error.message)):cb.resolve(d.result)});
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('CDP closed'));pending.clear()});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method+' '+JSON.stringify(params)))},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
 return {call,close:()=>ws.close()};
}
async function launch(folder,local,stage){
 allowed(folder);allowed(local);note('Launch installed v1.0: '+stage);
 const debugPort=await port(),env={...process.env,LOCALAPPDATA:local,NIKKE_QA_HIDDEN:'1',HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9'};
 for(const key of ['ELECTRON_RUN_AS_NODE','NIKKE_DATA_DIR','NIKKE_DATA_HOME','NIKKE_CACHE_DIR'])delete env[key];
 const fd=fs.openSync(path.join(qa,stage+'-runtime.log'),'a');
 const proc=spawn(path.join(folder,'NIKKE Photos.exe'),['--remote-debugging-port='+debugPort,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:['ignore',fd,fd]});
 let exit=false;proc.on('exit',()=>{exit=true;fs.closeSync(fd)});
 let targets;await until(async()=>{try{targets=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();return targets.some(t=>t.type==='page'&&t.url.startsWith('nikke://app'))}catch{return false}},'installed main page');
 const cdp=await connect(targets.find(t=>t.type==='page'&&t.url.startsWith('nikke://app')).webSocketDebuggerUrl);
 const sessions=new Map();
 function context(sessionId,contextId){return {sessionId,eval:async expression=>{
   const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,...(contextId?{contextId}:{})},sessionId);
   if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;
 }}}
 const main=context();
 activeQuit=async()=>{try{await main.eval('window.close()')}catch{}await until(()=>exit,'graceful cleanup');cdp.close();activeQuit=null};
 await cdp.call('Network.enable');await cdp.call('Network.setBlockedURLs',{urls:['http://*','https://*']});
 async function tool(fragment){
  const {targetInfos}=await cdp.call('Target.getTargets');
  for(const t of targetInfos.filter(t=>t.type==='iframe'))if(!sessions.has(t.targetId)){
   const {sessionId}=await cdp.call('Target.attachToTarget',{targetId:t.targetId,flatten:true});sessions.set(t.targetId,sessionId);
   await cdp.call('Network.enable',{},sessionId);await cdp.call('Network.setBlockedURLs',{urls:['http://*','https://*']},sessionId);
  }
  // OOP iframe contexts belong to their attached session, not the parent page.
  for(const sid of [...sessions.values(),undefined]){
   let tree;try{tree=(await cdp.call('Page.getFrameTree',{},sid)).frameTree}catch{continue}
   function find(n){if(n.frame.url.includes(fragment))return n.frame;for(const child of n.childFrames||[]){const hit=find(child);if(hit)return hit}}
   const frame=find(tree);if(frame){const {executionContextId}=await cdp.call('Page.createIsolatedWorld',{frameId:frame.id,worldName:'beta-qa'},sid);return context(sid,executionContextId)}
  }
 }
 async function readyTool(fragment,selector){let result;await until(async()=>{try{result=await tool(fragment);return result&&await result.eval('!!document.querySelector('+JSON.stringify(selector)+')')}catch{return false}},fragment);return result}
 await until(()=>main.eval("!!document.querySelector('.topbar')"),'app mounted');
 await main.eval("(()=>{const d=document.querySelector('.dlg[aria-label=版本更新]');if(d){d.querySelector('input[type=checkbox]').click();d.querySelector('.dlg-x').click()}return true})()");
 const info=await main.eval('window.nikkeDesktop.getInfo()');assert.ok(info.cacheRoot.startsWith(local));
 assert.equal(await main.eval('document.title'),'NIKKE Photos');
 assert.equal(info.version,'1.0.0');assert.equal(info.capabilities.automation,true);
 if(info.storageMode==='legacy-in-place')allowed(info.dataRoot);else {assert.ok(info.dataRoot.startsWith(local));assert.ok(!info.dataRoot.startsWith(folder+path.sep))}
 if(stage==='seed'){
  const pages=[];
  for(const route of ['/','/data','/stats','/my-nikke','/profiles','/schemes','/custom-nikke/new','/changelog','/equipment-collection','/about']){
   await main.eval('location.hash='+JSON.stringify(route));await delay(200);
   const rendered=await main.eval("({main:!!document.querySelector('main'),text:document.querySelector('main')?.innerText.length||0,heading:document.querySelector('main h1,main h2')?.textContent||''})");
   assert.ok(rendered.main&&rendered.text>0,'page '+route);pages.push({route,heading:rendered.heading});
  }
  report.pages=pages;report.checks.mainPagesRender=true;
  await main.eval("location.hash='/my'");await delay(200);
  const contact=await main.eval("({text:document.querySelector('.my-contact')?.innerText,href:document.querySelector('.my-contact a')?.href})");
  assert.ok(contact.text?.includes('BUG反馈和意见：QQ 2096317545')&&contact.text.includes('交流群：1126223078')&&contact.text.includes('-小云雀来海-'));
  assert.equal(contact.href,'https://space.bilibili.com/1753455535');report.checks.releaseNameAndContact=true;
  await main.eval("location.hash='/about'");await delay(200);
  const initialized=await main.eval("window.nikkeDesktop.maanikke.request('initialize')");assert.equal(initialized.native,'v5.12.2');assert.equal(initialized.agentConnected,true);assert.equal(initialized.gameInputEnabled,false);await main.eval('window.nikkeDesktop.maanikke.stop()');report.checks.installedOfflineAutomation=true;
  const library=await main.eval("(async()=>{const a=await fetch('./about/project-GPL-3.0.txt'),b=await fetch('./about/NIKKE-Photos-v1.0-source.zip');return {gpl:(await a.text()).includes('Version 3, 29 June 2007'),source:b.ok,size:(await b.arrayBuffer()).byteLength,download:!!document.querySelector('a[href*=NIKKE-Photos-v1]')}})()");assert.ok(library.gpl&&library.source&&library.download&&library.size>1000);report.checks.installedGPLAndSource=true;
  const automation=path.join(folder,'resources/automation-app'),input=path.join(qa,'ocr-sample.png'),out=path.join(qa,'installed-ocr.json');fs.copyFileSync('E:/博哥/NIKKE Photos/文档/ocr_samples/equipment/装备_臂部_v金属护臂.png',input);
  const ocr=spawnSync(path.join(folder,'NIKKE Photos.exe'),[path.join(automation,'scripts/ocr-equipment.mjs'),'--image',input,'--engine','v2','--report',out],{cwd:automation,env:{...env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(ocr.status,0,ocr.stderr);assert.equal(JSON.parse(fs.readFileSync(out)).rows[2].value,2.98);report.checks.installedOCR=true;
 }
 await main.eval("location.hash='/tools'");await until(()=>main.eval("!!document.querySelector('#tab-equipment-reroll')"),'tools');
 const red=await readyTool('/core-dust/','#chipMulValue');assert.ok(await red.eval("document.querySelector('#chipMulValue').textContent.length>0"));
 await main.eval("document.querySelector('#tab-equipment-reroll').click()");const reroll=await readyTool('/equipment-reroll/index.html','#resource-strategy');
 if(stage==='seed'){
  await reroll.eval("const select=document.querySelector('#collection-select');select.value='manual-four-equipment';select.dispatchEvent(new Event('change',{bubbles:true}))");await delay(100);
  await reroll.eval("(()=>{const r=document.querySelector('.equipment-current-rows .form-row'),s=r.querySelector('.stat-select');s.value='攻击力增加';s.dispatchEvent(new Event('change',{bubbles:true}));const t=r.querySelector('.tier-select');t.value='6';t.dispatchEvent(new Event('change',{bubbles:true}))})()");await delay(100);
 }
 const toolState=await reroll.eval("localStorage.getItem('nikke-tools:workshop:draft:v1')");assert.ok(toolState);
 await main.eval("document.querySelector('#tab-equipment-simulator').click()");const simulator=await readyTool('/simulator/index.html','.sim-controls');
 assert.ok(await simulator.eval("!!document.querySelector('.sim-controls')"));
 const profile=await main.eval("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([k])=>k.startsWith('nikke-photos/profiles/'))))");
 const income=await main.eval('window.nikkeDesktop.resourceIncome.read()');
 const database=await main.eval(`new Promise((resolve,reject)=>{const r=indexedDB.open('nikke-beta-lifecycle-probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('state','readonly'),g=t.objectStore('state').get('marker');g.onsuccess=()=>{resolve(g.result??null);db.close()};g.onerror=()=>reject(g.error)}})`);
 const resources=await main.eval("(async()=>{const r=await fetch('./ocr/font-templates/Azonix-game/manifest.json');return {ocr:r.ok,version:document.querySelector('.version').textContent}})()");assert.ok(resources.ocr);assert.equal(resources.version,'v1.0');
 const result={info,profile,income,database,toolState,resources};
 async function screenshot(name){const {data}=await cdp.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(qa,name+'.png'),Buffer.from(data,'base64'))}
 async function quit(){await activeQuit()}
 return {main,reroll,simulator,result,quit,screenshot};
}
async function initialize(folder,local){
 const app=await launch(folder,local,'seed');
 const roster=require('../src/data/roster.json'),code=roster.characters[0].nameCode,stamp='2026-10-26T00:00:00.000Z';
 const index={version:2,currentId:'default',profiles:[{id:'default',name:'Beta 生命周期验收',synchroLevel:200,createdAt:stamp,updatedAt:stamp,schemes:[]}]};
 const doc={version:2,characters:{[code]:{core:1,equipments:Array.from({length:4},()=>[{functionType:'StatAtk',level:6,value:8.29}]),updatedAt:stamp}},updatedAt:stamp};
 await app.main.eval(`localStorage.setItem('nikke-photos/profiles/v1/index',${JSON.stringify(JSON.stringify(index))});localStorage.setItem('nikke-photos/profiles/v1/data/default',${JSON.stringify(JSON.stringify(doc))});`);
 await app.main.eval(`window.nikkeDesktop.resourceIncome.save({date:'2026-10-26',stones:17,keys:23})`);
 await app.main.eval(`new Promise((resolve,reject)=>{const r=indexedDB.open('nikke-beta-lifecycle-probe',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,t=d.transaction('state','readwrite');t.objectStore('state').put({marker:'beta-only',version:1},'marker');t.oncomplete=()=>{d.close();resolve(true)};t.onerror=()=>reject(t.error)}})`);
 // Hidden windows do not guarantee screenshot compositor frames; UI is inspected through DOM.
 await app.quit();
}
function same(actual,expected){for(const k of ['profile','income','database','toolState'])assert.deepEqual(actual[k],expected[k],k+' persisted')}
async function inspect(folder,local,stage,expected){const app=await launch(folder,local,stage);if(expected)same(app.result,expected);report.runs.push({stage,version:app.result.info.version,storageMode:app.result.info.storageMode});await app.quit();return app.result}
async function main(){
 assert.ok(fs.existsSync(setup));
 const check=spawnSync('powershell.exe',['-NoProfile','-Command',"@(Get-ChildItem HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall | Get-ItemProperty | Where-Object {$_.DisplayName -eq 'NIKKE Photos'} | Select-Object -ExpandProperty InstallLocation) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true});
 assert.equal(check.status,0);assert.ok(!check.stdout.trim()||check.stdout.trim()==='[]','Existing NIKKE Photos installation detected; refusing to overwrite it');
 await installPackage(setup,install);report.checks.nonDefaultInstall=true;
 await initialize(install,userLocal);
 const baseline=await inspect(install,userLocal,'restart');assert.equal(baseline.info.version,'1.0.0');assert.equal(baseline.info.storageMode,'per-user');assert.equal(baseline.income.records[0].stones,17);assert.equal(baseline.database.marker,'beta-only');report.checks.restartPersistence=true;
 // Full offline package/file tree and native capture helpers must be present.
 assert.ok(fs.existsSync(path.join(install,'resources/app.asar')));assert.ok(fs.existsSync(path.join(install,'resources/app.asar.unpacked/electron/windows-capture.ps1')));assert.ok(fs.existsSync(path.join(install,'resources/app.asar.unpacked/electron/windows-capture.cs')));report.checks.nativeHelpersUnpacked=true;
 const keep=path.join(install,'data');fs.mkdirSync(keep,{recursive:true});fs.writeFileSync(path.join(keep,'keep-on-uninstall.txt'),'legacy user data');fs.writeFileSync(path.join(install,'user-backup.txt'),'user backup');
 await installPackage(setup,install);await inspect(install,userLocal,'overwrite',baseline);report.checks.overwritePersistence=true;
 await uninstall(install);assert.equal(fs.readFileSync(path.join(keep,'keep-on-uninstall.txt'),'utf8'),'legacy user data');assert.equal(fs.readFileSync(path.join(install,'user-backup.txt'),'utf8'),'user backup');assert.ok(fs.existsSync(path.join(baseline.info.dataRoot,'tools/resource-income.json')));report.checks.uninstallPreservesExternalAndAdjacentData=true;
 const second=path.join(qa,'重新安装目录','NIKKE Photos');
 const previous=path.join(root,'release/NIKKE-Photos-v0.1-beta-1-Windows-x64-Setup.exe');
 if(fs.existsSync(previous)){await installPackage(previous,second);assert.ok(fs.existsSync(path.join(second,'resources/app.asar')));report.checks.previousInstallerPreparedWithoutLaunching=true;}
 await installPackage(setup,second);await inspect(second,userLocal,'reinstall',baseline);report.checks.reinstallPersistence=true;report.checks.betaInstallerToV1PreservesTestData=fs.existsSync(previous);
 // Copy closed TEST databases to simulate an old adjacent data/ installation.
 const legacy=path.join(second,'data');fs.mkdirSync(legacy,{recursive:true});
 for(const name of ['Local Storage','IndexedDB','WebStorage','blob_storage','tools','Preferences','Local State']){const source=path.join(baseline.info.dataRoot,name);if(fs.existsSync(source))fs.cpSync(source,path.join(legacy,name),{recursive:true,filter:f=>!fs.lstatSync(f).isSymbolicLink()})}
 const legacyLocal=path.join(qa,'LegacyUserLocal');const adopted=await inspect(second,legacyLocal,'legacy-adoption',baseline);assert.equal(adopted.info.storageMode,'legacy-in-place');assert.equal(adopted.info.dataRoot,legacy);report.checks.legacyInPlaceCompatibility=true;
 await uninstall(second);assert.ok(fs.existsSync(path.join(legacy,'Local Storage')));assert.ok(fs.existsSync(path.join(legacy,'tools/resource-income.json')));
 const third=path.join(qa,'另一安装位置','NIKKE Photos');await installPackage(setup,third);await inspect(third,legacyLocal,'legacy-reinstall',baseline);await uninstall(third);report.checks.legacyPointerSurvivesUninstallAndDirectoryChange=true;
 report.status='passed';report.installer=setup;report.preservedTestData=[baseline.info.dataRoot,legacy];
 fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'release/v1.0/validation-result.json'),JSON.stringify(report,null,2));note('PASSED: install, persistence, upgrade, uninstall, legacy compatibility');
}
main().catch(async error=>{report.status='failed';report.error=error.stack;fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify(report,null,2));console.error(error);if(activeQuit)await activeQuit().catch(console.error);process.exitCode=1});
