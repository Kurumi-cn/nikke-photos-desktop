const {app,BrowserWindow,protocol,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{PNG}=require('pngjs');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/neutral-qa-2026-10-30/exploration-'+Date.now());
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'data'));app.setPath('sessionData',path.join(root,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(project,u.host==='app'?'dist':'dist/tools'),f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(base+path.sep)||!fs.existsSync(f))return new Response('',{status:404});return net.fetch(pathToFileURL(f).href)});
 const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents,run=s=>web.executeJavaScript(s);
 const errors=[];web.on('render-process-gone',(_e,d)=>errors.push(d));
 web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
 const until=async(s)=>{for(let i=0;i<160;i++){if(await run(s))return;await delay(60)}throw Error('Timeout '+s)};
 const route=async hash=>{await run(`location.hash=${JSON.stringify(hash)}`);await delay(150)};
 const click=async(text,scope='document')=>{await run(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button '+${JSON.stringify(text)});b.click();return true})()`);await delay(100)};
 const fill=async(selector,value)=>{await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await delay(100)};
 const shot=async(name)=>{await delay(200);for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());return}catch(e){if(i===2)throw e;await delay(300)}}};
 const check=async(name,fn)=>{try{const observation=await fn();results.push({name,status:'completed',observation})}catch(e){results.push({name,status:'failed',error:e.stack});try{await shot(name+'-failed')}catch{}}fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({results,rendererCrashes:errors},null,2))};
 await win.loadURL('nikke://app/');await until("!!document.querySelector('.topbar')");await run("localStorage.clear();sessionStorage.clear();location.reload()");await until("!!document.querySelector('.topbar')");
 await check('list-filters-and-long-input',async()=>{
  await route('/');await until("document.querySelectorAll('.grid .tile').length>100");const all=await run("document.querySelectorAll('.grid .tile').length");assert.equal(all,205);
  await run("document.querySelector('.toolbar .switch').click()");await delay(100);const cn=await run("document.querySelectorAll('.grid .tile').length");assert.equal(cn,152);
  await fill('.toolbar input','无结果测试'.repeat(300));assert.equal(await run("document.querySelectorAll('.grid .tile').length"),0);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await fill('.toolbar input','');await run("document.querySelector('.toolbar .switch').click()");return {all,cn,longSearchEmpty:true,noHorizontalOverflow:true};
 });
 const indexKey='nikke-photos/profiles/v1/index',dataKey='nikke-photos/profiles/v1/data/default';
 const profileCount=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).profiles.length`);
 await check('profile-create-validation-switch-delete',async()=>{
  await route('/profiles');const before=await profileCount();await click('新建存档');await fill('.dlg input.dlg-input',' ');await click('创建');assert.equal(await profileCount(),before);assert.ok(await run("document.querySelector('.dlg-error')?.textContent.includes('不能为空')"));
  await fill('.dlg input.dlg-input','');await run("document.querySelector('.dlg input.dlg-input').focus()");await web.insertText('长'.repeat(100));const limited=await run("document.querySelector('.dlg input.dlg-input').value.length");assert.equal(limited,30);
  await fill('.dlg input[type=number]','200');await click('创建');await until("!document.querySelector('.dlg-mask')");assert.equal(await profileCount(),before+1);
  await run("[...document.querySelectorAll('.profile-row')].find(e=>e.textContent.includes('默认存档')).click()");await delay(100);assert.equal(await run(`JSON.parse(localStorage.getItem(${JSON.stringify(indexKey)})).currentId`),'default');
  const deletionDisabled=await run("[...document.querySelectorAll('.profile-row')].find(e=>e.textContent.includes('默认存档')).querySelector('[title=默认存档不可删除]').disabled");assert.equal(deletionDisabled,true);
  await run("[...document.querySelectorAll('.profile-row')].find(e=>e.textContent.includes('长长长')).querySelector('.btn:last-child').click()");await delay(100);await click('取消',"document.querySelector('.dlg')");assert.equal(await profileCount(),before+1);
  await run("[...document.querySelectorAll('.profile-row')].find(e=>e.textContent.includes('长长长')).querySelector('.btn:last-child').click()");await delay(100);await click('删除',"document.querySelector('.dlg')");assert.equal(await profileCount(),before);return {emptyNameRefused:true,maxName:limited,createdSwitchedDeleted:true,defaultDeletionDisabled:deletionDisabled,cancelRetains:true};
 });
 const roster=require('../src/data/roster.json').characters,codes=roster.slice(0,3).map(c=>String(c.nameCode));
 const line={functionType:'StatAtk',level:1,value:4.77},complete={equipments:Array.from({length:4},()=>[line,null,null])};
 await check('stats-eligibility-after-equipment-clear',async()=>{
  await run(`localStorage.setItem(${JSON.stringify(dataKey)},${JSON.stringify(JSON.stringify({version:2,characters:Object.fromEntries(codes.map(c=>[c,complete]))}))});sessionStorage.setItem('nikke-photos/stats/selection/v1',${JSON.stringify(JSON.stringify(codes))})`);await route('/stats');await until("document.querySelectorAll('.st-row').length===3");
  await route('/data?code='+codes[2]);await until("document.querySelectorAll('.equip-block').length===4");await run("[...document.querySelector('.equip-block').querySelectorAll('button')].find(b=>b.textContent==='清空本件').click()");await delay(150);await route('/stats');await delay(150);
  const observation=await run("({summary:document.querySelector('.stats-head').textContent,rows:[...document.querySelectorAll('.st-row')].map(r=>r.textContent)})");await shot('stats-ineligible-row-after-clear');return observation;
 });
 await check('stats-filter-total-export',async()=>{
  await route('/profiles');await run(`sessionStorage.setItem('nikke-photos/stats/selection/v1',${JSON.stringify(JSON.stringify(codes.slice(0,2)))})`);await route('/stats');
  await until("document.querySelectorAll('.st-row').length===2");const cells=await run("[...document.querySelector('.st-row').querySelectorAll('td')].map(e=>e.textContent)");assert.ok(cells.includes('19.08%'));assert.equal(cells.at(-1),'4');
  const file=path.join(root,'stats-export.png');const download=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),20000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});
  await click('导出图片');await download;const png=PNG.sync.read(fs.readFileSync(file));assert.ok(png.width>1000&&png.height>100);await click('导出表格码');await until("!!document.querySelector('textarea')");const code=await run("document.querySelector('textarea').value");assert.ok(code.startsWith('NKP2'));await shot('stats-share-code');await run("document.querySelector('.dlg-x').click()");return {eligibleRows:2,attackTotal:'19.08%',tiers:4,png:[png.width,png.height],tableCodeGenerated:true};
 });
 await check('character-default-3x-export',async()=>{
  await route('/character/5145');await until("document.querySelector('.np-card-art')?.naturalWidth>0");await click('导出图片',"document.querySelector('.head-actions')");await until("!!document.querySelector('.dlg[aria-label=导出设置]')");assert.equal(await run("document.querySelector('.dlg .zoom .active').textContent"),'3x');
  const file=path.join(root,'character-3x.png');const download=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),25000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});await click('导出 PNG');await download;const png=PNG.sync.read(fs.readFileSync(file));assert.deepEqual([png.width,png.height],[2208,3288]);return {defaultRatio:3,png:[png.width,png.height]};
 });
 await check('numeric-boundaries-and-ocr-known-sample',async()=>{
  await route('/profiles');await run(`(()=>{const key=${JSON.stringify(dataKey)},data=JSON.parse(localStorage.getItem(key));data.characters['5145']={equipments:[[],[],[],[]],combat:123};localStorage.setItem(key,JSON.stringify(data));return true})()`);await route('/data?code=5145');await until("document.querySelectorAll('.equip-block').length===4");
  const combatSelector='.form-row:has(.form-label)';
  await run("[...document.querySelectorAll('.form-row')].find(e=>e.querySelector('.form-label')?.textContent==='战斗力').querySelector('input').id='qa-combat'");
  await fill('#qa-combat','4000001');const numeric=await run(`({error:document.querySelector('#qa-combat').closest('label').textContent,saved:JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters['5145'].combat})`);assert.equal(numeric.saved,123);assert.ok(numeric.error.includes('越界'));
  await fill('#qa-combat','');assert.equal(await run(`JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters['5145'].combat`),null);
  await run("document.querySelector('.equip-block button').click()");await until("!!document.querySelector('.ocr-drop-text')");
  const sample=fs.readFileSync('E:/博哥/NIKKE Photos/文档/ocr_samples/equipment/装备_臂部_v金属护臂.png').toString('base64');
  await run(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(sample)}),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'已标注样本.png',{type:'image/png'}));const input=document.querySelector('.dlg input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await until("document.querySelectorAll('.ocr-row').length===3&&!document.querySelector('.ocr-status')");
  const observed=await run("[...document.querySelectorAll('.ocr-row')].map(e=>({selects:[...e.querySelectorAll('select')].map(s=>s.value),text:e.textContent}))");await shot('ocr-known-uncertain-value');
  await click('取消',"document.querySelector('.dlg')");return {outOfRangeDoesNotSave:numeric,blankStoredAsNull:true,ocrRows:observed};
 });
 const drop=async(payload)=>{await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(payload))}],'QA档案.json',{type:'application/json'}));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`);await until("!!document.querySelector('.dlg[aria-label=导入档案]')")};
 await check('xlsx-drop-confirm-and-profile-json-roundtrip',async()=>{
  await route('/profiles');const workbook=new(require('exceljs').Workbook)();const sheet=workbook.addWorksheet('角色');sheet.addRow(['标准name_code','名称','战斗力']);sheet.addRow([codes[0],'QA测试',12345]);workbook.addWorksheet('词条').addRow(['本地ID','角色名称','装备序号','词条位置','词条类型代码','档位','数值']);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());fs.writeFileSync(path.join(root,'fixture.xlsx'),bytes);
  await run(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'QA图鉴.xlsx'));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`);await until("!!document.querySelector('.dlg[aria-label=导入档案]')");
  const before=await run(`localStorage.getItem(${JSON.stringify(dataKey)})`);await click('取消',"document.querySelector('.dlg')");assert.equal(await run(`localStorage.getItem(${JSON.stringify(dataKey)})`),before);
  await run(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'QA图鉴.xlsx'));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`);await until("!!document.querySelector('.dlg[aria-label=导入档案]')");const overwrite=await run("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent.startsWith('覆盖「')).textContent");await click(overwrite);
  assert.equal(await run(`JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters[${JSON.stringify(codes[0])}].combat`),12345);
  const file=path.join(root,'profile-export.json'),download=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),10000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});await click('导出当前档案数据');await download;const exported=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(exported.format,'nikke-photos-profile');assert.equal(exported.characters[codes[0]].combat,12345);
  await drop(exported);const same=await run(`localStorage.getItem(${JSON.stringify(dataKey)})`);await click('取消',"document.querySelector('.dlg')");assert.equal(await run(`localStorage.getItem(${JSON.stringify(dataKey)})`),same);return {xlsxRecognized:true,cancelNoWrite:true,confirmedCombat:12345,jsonExportAndReimportRecognized:true};
 });
 await check('invalid-new-import-feedback',async()=>{
  await route('/profiles');const before=await profileCount();const payload={format:'nikke-photos-profile',version:2,name:'错误档案测试',synchroLevel:200,characters:{[codes[0]]:{equipments:[[line,line,null]]}}};await drop(payload);
  await click('新建存档并导入');await until("!!document.querySelector('.dlg[aria-label=新建存档]')");await click('创建');await delay(250);
  const result={countBefore:before,countAfter:await profileCount(),dialogTitle:await run("document.querySelector('.dlg h2')?.textContent"),visibleErrors:await run("[...document.querySelectorAll('.dlg-error,[role=alert]')].filter(e=>e.getClientRects().length).map(e=>e.textContent)")};
  await shot('invalid-new-import-no-feedback');await click('取消');await delay(100);
  const overwriteButton=await run("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent.startsWith('覆盖「'))?.textContent");if(overwriteButton)await click(overwriteButton);
  result.overwriteErrors=await run("[...document.querySelectorAll('.dlg-error')].map(e=>e.textContent)");await shot('invalid-overwrite-feedback');await run("document.querySelector('.dlg-x')?.click()");return result;
 });
 await check('unknown-profile-record-contract',async()=>{
  await route('/profiles');const payload={format:'nikke-photos-profile',version:2,name:'未知角色测试',synchroLevel:200,characters:{[codes[0]]:complete,'99999999':complete}};await drop(payload);const prompt=await run("document.querySelector('.dlg-text').textContent");const button=await run("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent.startsWith('覆盖「')).textContent");await click(button);await delay(120);const stored=await run(`Object.keys(JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)})).characters)`);return {prompt,stored,unknownRetained:stored.includes('99999999')};
 });
 await check('current-direct-simulator-drop',async()=>{
  await route('/tools');await click('装备洗练模拟器',"document.querySelector('.tools-switcher')");let frame;for(let i=0;i<100;i++){frame=web.mainFrame.frames.find(f=>f.url.includes('/simulator/index.html'));if(frame)break;await delay(50)}assert.ok(frame);await delay(200);
  const payload={format:'nikke-photos-profile',version:2,synchroLevel:200,characters:{[codes[0]]:complete}};await frame.executeJavaScript(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(payload))}],'QA.json'));document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`);await until("!!document.querySelector('.dlg[aria-label=导入档案]')");await run("document.querySelector('.dlg-x').click()");return {topLevelDropRelayed:true};
 });
 await check('responsive-theme-route-scan',async()=>{
  const measurements=[];
  for(const width of [1440,390]){win.setSize(width,1000);for(const theme of ['light','dark']){await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);for(const hash of ['/','/data?code='+codes[0],'/stats','/profiles','/my','/tools']){await route(hash);const measured=await run('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight})');measurements.push({hash,theme,...measured});if(measured.scrollWidth>measured.width+1)await shot('overflow-'+width+'-'+theme+'-'+measurements.length)}}}
  win.setSize(1440,1000);return {measurements,horizontalOverflow:measurements.filter(m=>m.scrollWidth>m.width+1)};
 });
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({results,rendererCrashes:errors},null,2));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(root,'fatal.txt'),e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),180000).unref();
