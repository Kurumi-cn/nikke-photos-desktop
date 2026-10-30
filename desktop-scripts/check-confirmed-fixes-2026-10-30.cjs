// Isolated hidden Electron verification; no real profile data, game input, or native capture.
const {app,BrowserWindow,protocol,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/bugfix-2026-10-30/ui-'+Date.now());
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'data'));app.setPath('sessionData',path.join(root,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(project,u.host==='app'?'dist':'dist/tools'),f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(base+path.sep)||!fs.existsSync(f))return new Response('',{status:404});return net.fetch(pathToFileURL(f).href)});
 const win=new BrowserWindow({width:1280,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents,run=s=>web.executeJavaScript(s);
 const crashes=[];web.on('render-process-gone',(_e,d)=>crashes.push(d));
 web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
 const until=async(s)=>{for(let i=0;i<200;i++){if(await run(s))return;await delay(60)}throw Error('Timeout '+s)};
 const route=async hash=>{await run(`location.hash=${JSON.stringify(hash)}`);await delay(180)};
 const click=async(text)=>{await run(`(()=>{const b=[...document.querySelectorAll('.dlg button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button '+${JSON.stringify(text)});b.click();return true})()`);await delay(100)};
 const fill=async(selector,value)=>{await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);await delay(100)};
 const shot=async(name)=>{await delay(180);fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG())};
 const check=async(name,fn)=>{try{const observation=await fn();results.push({name,passed:true,observation})}catch(e){results.push({name,passed:false,error:e.stack});try{await shot(name+'-failed')}catch{}}fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({results,crashes},null,2))};
 await win.loadURL('nikke://app/');await until("!!document.querySelector('.topbar')");await route('/profiles');
 const indexKey='nikke-photos/profiles/v1/index',dataKey='nikke-photos/profiles/v1/data/default',code=String(require('../src/data/roster.json').characters[0].nameCode);
 const line={functionType:'StatAtk',level:1,value:4.77},good={combat:12345,equipments:[[line,null,null]]},bad={equipments:[[line,line,null]]};
 const count=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).profiles.length`);
 const drop=async characters=>{await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify({format:'nikke-photos-profile',version:2,name:'修复验证',synchroLevel:200,characters}))}],'验证.json',{type:'application/json'}));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`);await until("!!document.querySelector('.dlg[aria-label=导入档案]')")};
 const close=async()=>{await run("document.querySelector('.dlg-x')?.click()");await delay(100)};
 const overwrite=async()=>{const label=await run("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent.startsWith('覆盖「')).textContent");await click(label)};
 await check('new-import-visible-reason-and-retry',async()=>{
  const before=await count(),stored=await run(`localStorage.getItem(${JSON.stringify(dataKey)})`);await drop({[code]:bad});await click('新建存档并导入');await fill('.dlg input.dlg-input','失败后保留名称');await click('创建');
  await until("document.querySelector('.dlg [role=alert]')?.textContent.includes('重复')");assert.equal(await count(),before);assert.equal(await run(`localStorage.getItem(${JSON.stringify(dataKey)})`),stored);
  assert.equal(await run("document.querySelector('.dlg input.dlg-input').value"),'失败后保留名称');await shot('new-import-visible-error');
  await click('创建');assert.equal(await count(),before);assert.ok(await run("document.querySelector('.dlg [role=alert]').textContent.includes('重复')"));
  await click('取消');await overwrite();assert.ok(await run("document.querySelector('.dlg-error').textContent.includes('重复')"));await close();return {visibleReason:true,retryNoDuplicate:true,formRetained:true,noStorageMutation:true,overwriteReason:true};
 });
 await check('mixed-unknown-overwrite-skips-before-validation',async()=>{
  await drop({[code]:good,'99999999':bad});assert.ok(await run("document.querySelector('.dlg-text').textContent.includes('1 个未识别，将被跳过')"));await overwrite();await until("!document.querySelector('.dlg-mask')");
  const keys=await run(`Object.keys(JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters)`);assert.deepEqual(keys,[code]);return {stored:keys,invalidUnknownSkipped:true};
 });
 await check('mixed-unknown-new-import',async()=>{
  const before=await count();await drop({[code]:good,'99999999':bad});await click('新建存档并导入');await click('创建');await until("!document.querySelector('.dlg-mask')");assert.equal(await count(),before+1);
  const keys=await run(`(()=>{const i=JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)}));return Object.keys(JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/data/'+i.currentId)).characters)})()`);assert.deepEqual(keys,[code]);return {stored:keys};
 });
 await check('unknown-only-refuses-with-visible-reason',async()=>{
  const before=await count(),storage=await run('JSON.stringify({...localStorage})');await drop({'99999999':bad});await overwrite();await until("document.querySelector('.dlg-error')?.textContent.includes('没有可导入')");assert.equal(await run('JSON.stringify({...localStorage})'),storage);
  await click('新建存档并导入');await click('创建');await until("document.querySelector('.dlg [role=alert]')?.textContent.includes('没有可导入')");assert.equal(await count(),before);assert.equal(await run('JSON.stringify({...localStorage})'),storage);await click('取消');await close();return {newAndOverwriteRefused:true,noMutation:true};
 });
 await check('actual-ocr-file-upload-critical-298',async()=>{
  await route('/data?code='+code);await until("document.querySelectorAll('.equip-block').length===4");await run("document.querySelector('.equip-block button').click()");await until("!!document.querySelector('.ocr-drop-text')");
  const bytes=fs.readFileSync('E:/博哥/NIKKE Photos/文档/ocr_samples/equipment/装备_臂部_v金属护臂.png').toString('base64');
  await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0))],'标注样本.png',{type:'image/png'}));const input=document.querySelector('.dlg input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await until("document.querySelectorAll('.ocr-row').length===3&&!document.querySelector('.ocr-status')");const rows=await run("[...document.querySelectorAll('.ocr-row')].map(e=>({selects:[...e.querySelectorAll('select')].map(s=>s.value),text:e.textContent}))");assert.equal(rows[2].selects[0],'StatCritical');assert.equal(rows[2].selects[1],'3');assert.ok(rows[2].text.includes('2.98'));await shot('ocr-critical-298-recognized');await click('取消');return rows;
 });
 assert.equal(crashes.length,0);console.log(JSON.stringify({root,results}));win.destroy();app.exit(results.every(r=>r.passed)?0:1);
}).catch(e=>{fs.writeFileSync(path.join(root,'fatal.txt'),e.stack);console.error(e);app.exit(1)});
setTimeout(()=>app.exit(2),90000).unref();
