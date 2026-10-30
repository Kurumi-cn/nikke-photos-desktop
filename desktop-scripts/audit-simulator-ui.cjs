// Isolated visual audit; no preload, player files, or game input.
const {app,BrowserWindow,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const cache=path.join('E:/博哥/codex temp/nikke-desktop/automation-dev-copy','equipment-rules-ui-'+Date.now());
fs.mkdirSync(cache,{recursive:true});
app.setPath('userData',path.join(cache,'userData'));app.setPath('sessionData',path.join(cache,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(root,u.host==='app'?'dist':'dist/tools');const f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(base+path.sep)||!fs.existsSync(f))return new Response('',{status:404});return net.fetch(pathToFileURL(f).href)});
 const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents;
 const until=async(fn,name)=>{for(let i=0;i<160;i++){if(await fn())return;await delay(100)}throw Error(name)};
 const shot=async(name)=>{for(let i=0;i<3;i++){await delay(500);try{fs.writeFileSync(path.join(cache,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());return}catch(e){if(i===2)throw e}}};
 await win.loadURL('nikke://app/');await until(()=>web.executeJavaScript("!!document.querySelector('.topbar')"),'host');await shot('host');
 const equipmentEntry=await require('../electron/check-equipment-rules.cjs')(win,cache);
 if(process.env.NIKKE_EQUIPMENT_ENTRY_ONLY){fs.writeFileSync(path.join(cache,'metrics.json'),JSON.stringify({equipmentEntry},null,2));app.exit(0);return}
 await web.executeJavaScript("location.hash='/tools'");await until(()=>web.executeJavaScript("!!document.querySelector('#tab-equipment-reroll')"),'tab');await web.executeJavaScript("document.querySelector('#tab-equipment-reroll').click()");
 let outer;await until(async()=>{outer=web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/')&&!f.url.includes('/simulator/'));return !!outer},'outer');
 await until(()=>outer.executeJavaScript("!!document.querySelector('.expectation-outline')"),'calculator ready');
 const assert=require('node:assert/strict');
 assert.deepEqual(await web.executeJavaScript("[...document.querySelectorAll('.tools-switcher button')].map(b=>b.textContent)"),['红球计算器','洗词条计算器','装备洗练模拟器','订制模组记录']);
 assert.equal(await outer.executeJavaScript("!!document.querySelector('.reroll-tabs') || !!document.querySelector('#simulator-frame')"),false);
 await web.executeJavaScript("document.querySelector('#tab-equipment-simulator').click()");
 let inner;await until(async()=>{inner=web.mainFrame.frames.find(f=>f.url.includes('/simulator/index.html'));return !!inner},'inner');const run=s=>inner.executeJavaScript(s);
 await until(()=>run("!!document.querySelector('.sim-controls')"),'sim');await shot('single-light');
 const metrics=async()=>run(`(()=>{const sel=['body','h1','.panel-title','.gear-title','.panel-note','.slot-affix','.el-button','.wash-hint'];return {viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],styles:sel.map(s=>{const e=document.querySelector(s);if(!e)return {s};const c=getComputedStyle(e);return {s,size:c.fontSize,font:c.fontFamily,color:c.color,background:c.backgroundColor}}),selectNames:[...document.querySelectorAll('.el-select [role=combobox]')].map(e=>({label:e.getAttribute('aria-label'),labelledby:e.getAttribute('aria-labelledby')}))}})()`);
 const report={single:await metrics(),equipmentEntry};
 assert.equal(await run('parent===top'),true);
 await until(()=>web.executeJavaScript("!document.querySelector('#panel-equipment-simulator .tools-status')"),'simulator ready handshake');
 assert.ok(report.single.selectNames.every(e=>e.label));
 assert.equal(await run("document.querySelector('.compare-actions button').getBoundingClientRect().bottom<=innerHeight"),true);
 report.singleStartVisible=true;
 report.hostScroll=await web.executeJavaScript('({height:innerHeight,scroll:document.documentElement.scrollHeight})');
 assert.ok(report.hostScroll.scroll<=report.hostScroll.height+1);
 await web.executeJavaScript("document.querySelector('#tab-resource-income').click()");
 assert.equal(await web.executeJavaScript("document.querySelector('.resource-income h1').textContent"),'订制模组记录');
 await web.executeJavaScript("document.querySelector('#tab-equipment-simulator').click()");
 report.independentTabs=true;
 for(const width of [1280,1000,650,390]){win.setSize(width,900);await delay(120);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);await shot('single-'+width)}
 win.setSize(1440,1000);web.setZoomFactor(2);await delay(200);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);await shot('single-zoom-200');web.setZoomFactor(1);await delay(150);
 await run("document.querySelector('.compare-actions button').click()");await delay(100);assert.equal(await run("document.activeElement.id==='custom-error'"),true);report.validationFocus=true;
 await run("document.querySelector('.sim-controls input[value=character]').click()");await shot('four-light');report.four=await metrics();
 win.setSize(1000,900);await shot('four-1000');report.compact=await metrics();
 assert.equal(await run("getComputedStyle(document.querySelector('.gear-grid')).gridTemplateColumns.split(' ').length"),1);
 for(const width of [650,390]){win.setSize(width,900);await delay(150);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);await shot('four-'+width)}
 win.setSize(1000,900);
 await run("document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')");await shot('four-dark');
 assert.equal(await run("getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim()"),'#f2702a');report.darkAccent=true;
 win.setSize(1440,1000);await run("document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark');document.querySelector('.sim-controls input[value=single]').click()");await delay(150);
 await run("document.querySelector('.sim-controls input[value=random]').click()");await delay(150);
 await run("Math.random=(()=>{const q=[.31,0,.9,.9,0,0,.9,0];return()=>q.length?q.shift():.99})();[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='开始随机模拟').click()");
 await until(()=>run("!!document.querySelector('.slot-affix')&&!document.querySelector('.sim-controls button.is-loading')"),'started');await shot('active-light');report.active=await metrics();
 await run("Math.random=(()=>{const q=[0,0,.99,.99,.99];return()=>q.length?q.shift():.99})();document.querySelector('.gear-card button.el-button--primary').click()");await until(()=>run("!!document.querySelector('.el-dialog')&&document.querySelector('.el-dialog').getBoundingClientRect().height>0"),'dialog');await shot('wash-light');
 await run("document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')");await shot('wash-dark');
 await web.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').src='nikke://reroll/equipment-reroll/simulator/index.html?theme=light';document.querySelector('#tab-equipment-reroll').click()");await delay(200);
 if(!process.env.NIKKE_UI_VISUAL_ONLY){
 report.behavior=await require('../electron/check-simulator.cjs')(win,cache);
 report.import=await require('../electron/check-reroll-import.cjs')({window:win,cacheRoot:cache});
 }
 fs.writeFileSync(path.join(cache,'metrics.json'),JSON.stringify(report,null,2));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(cache,'error.txt'),e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),180000).unref();

