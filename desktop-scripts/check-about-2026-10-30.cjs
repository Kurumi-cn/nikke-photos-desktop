// Hidden, offline UI verification with isolated storage. No game/native capture inputs.
const {app,BrowserWindow,protocol,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/about-2026-10-30/ui-'+Date.now());
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'data'));app.setPath('sessionData',path.join(root,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];let broken=false;
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(project,u.host==='app'?'dist':'dist/tools'),f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(broken&&u.pathname.endsWith('/zbx-MIT.txt'))return new Response('',{status:503});if(!f.startsWith(base+path.sep)||!fs.existsSync(f))return new Response('',{status:404});return net.fetch(pathToFileURL(f).href)});
 const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents,run=s=>web.executeJavaScript(s);
 const crashes=[];web.on('render-process-gone',(_e,d)=>crashes.push(d));web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
 const until=async s=>{for(let i=0;i<220;i++){if(await run(s))return;await delay(60)}throw Error('Timeout '+s)};
 const route=async hash=>{await run(`location.hash=${JSON.stringify(hash)}`);await delay(180)};
 const click=async(text,scope='document')=>{await run(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button '+${JSON.stringify(text)});b.click();return true})()`);await delay(100)};
 const shot=async name=>{await delay(150);fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG())};
 const check=async(name,fn)=>{try{results.push({name,passed:true,observation:await fn()})}catch(e){results.push({name,passed:false,error:e.stack});try{await shot(name+'-failed')}catch{}}fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({results,crashes},null,2))};
 const download=async suffix=>{const file=path.join(root,path.basename(suffix)),done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout '+suffix)),15000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});await run(`document.querySelector('a[download][href$=${JSON.stringify(suffix)}]').click()`);await done;assert.ok(fs.statSync(file).size>100);return file};
 await win.loadURL('nikke://app/');await until("!!document.querySelector('.topbar')");
 await check('more-entry-local-documents-and-downloads',async()=>{
  await route('/my');await run("document.querySelector('a[href=\"#/about\"]').click()");await until("!!document.querySelector('.about-page')");assert.equal(await run("document.querySelector('.tab.active').textContent"),'更多');
  const count=await run("document.querySelectorAll('.about-document').length");assert.ok(count>=10);
  for(let i=0;i<count;i++){await run(`document.querySelectorAll('.about-document summary')[${i}].click()`);await until(`document.querySelectorAll('.about-document')[${i}].querySelector('pre')?.textContent.length>100`);}
  assert.equal(await run("document.querySelectorAll('.about-document [role=alert]').length"),0);
  const zip=await download('equipment-reroll-source.zip'),chromium=await download('chromium-licenses.html');
  assert.ok(fs.readFileSync(chromium,'utf8').includes('Chromium'));
  const archive=await require('unzipper').Open.file(zip),entries=archive.files.map(file=>file.path);
  for(const f of ['source/BUILDING.txt','source/tools/equipment-reroll/LICENSE','source/tools/equipment-reroll/vendor/zbx/LICENSE'])assert.ok(entries.includes(f),f);
  assert.ok((await archive.files.find(file=>file.path==='source/BUILDING.txt').buffer()).toString('utf8').includes('npm ci'));
  assert.equal(entries.some(f=>/\/(node_modules|data|release)\//.test(f)),false);return {documentCount:count,sourceArchiveEntries:entries.length,chromiumBytes:fs.statSync(chromium).size,offline:true};
 });
 await check('read-error-and-retry',async()=>{
  await route('/my');broken=true;await route('/about');await run("(()=>{const section=[...document.querySelectorAll('.about-document')].find(d=>d.querySelector('summary').textContent==='MIT 许可全文');section.id='qa-mit';section.querySelector('summary').click();return true})()");await until("!!document.querySelector('#qa-mit [role=alert]')");broken=false;await click('重试',"document.querySelector('#qa-mit')");await until("document.querySelector('#qa-mit pre')?.textContent.includes('MIT License')");return {visibleError:true,retryRecovered:true};
 });
 await check('themes-widths-and-back-navigation',async()=>{
  await route('/my');await route('/about');for(const theme of ['light','dark'])for(const width of [1440,390]){win.setSize(width,1000);await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await delay(120);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await shot('about-'+theme+'-'+width)}
  await run("document.querySelector('.about-page .back').click()");await until("!!document.querySelector('.my-grid')");win.setSize(1440,1000);await run("document.documentElement.dataset.theme='light'");return {fourLayouts:true,backToMore:true};
 });
 await check('tool-notices-moved-and-functional-limits-retained',async()=>{
  await route('/tools');await until("!document.querySelector('#panel-core-dust .tools-status')");let frame=web.mainFrame.frames.find(f=>f.url.includes('/core-dust/'));
  assert.ok(frame);const dust=await frame.executeJavaScript("({text:document.querySelector('footer').textContent,details:document.querySelectorAll('footer details').length})");assert.ok(dust.text.includes('本地数据版本'));assert.equal(dust.details,0);assert.equal(dust.text.includes('zbxzbx98'),false);
  await click('洗词条计算器',"document.querySelector('.tools-switcher')");await until("!document.querySelector('#panel-equipment-reroll .tools-status')");frame=web.mainFrame.frames.find(f=>f.url.includes('/equipment-reroll/index.html'));assert.ok(frame);
  const reroll=await frame.executeJavaScript("({text:document.querySelector('.desktop-notice').textContent,license:!!document.querySelector('#desktop-license'),help:!!document.querySelector('#calculation-rule-help')})");assert.ok(reroll.text.includes('24,000'));assert.ok(reroll.text.includes('计算边界'));assert.equal(/GPL|MIT|ChrisLu|许可证|秘钥策略来源/.test(reroll.text),false);assert.equal(reroll.license,false);assert.equal(reroll.help,true);
  await shot('calculator-after-migration');return {dust,reroll,readyWithoutErrors:true};
 });
 assert.equal(crashes.length,0);console.log(JSON.stringify({root,results}));win.destroy();app.exit(results.every(r=>r.passed)?0:1);
}).catch(e=>{console.error(e);fs.writeFileSync(path.join(root,'fatal.txt'),e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),120000).unref();
