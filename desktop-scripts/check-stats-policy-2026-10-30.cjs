const {app,BrowserWindow,protocol,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{PNG}=require('pngjs');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/stats-policy-2026-10-30/ui-'+Date.now());
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'data'));app.setPath('sessionData',path.join(root,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(project,u.host==='app'?'dist':'dist/tools'),f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(base+path.sep)||!fs.existsSync(f))return new Response('',{status:404});return net.fetch(pathToFileURL(f).href)});
 const win=new BrowserWindow({width:1280,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents,run=s=>web.executeJavaScript(s);
 const crashes=[];web.on('render-process-gone',(_e,d)=>crashes.push(d));web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
 const until=async s=>{for(let i=0;i<180;i++){if(await run(s))return;await delay(60)}throw Error('Timeout '+s)};
 const route=async hash=>{await run(`location.hash=${JSON.stringify(hash)}`);await delay(180)};
 const click=async(text,scope='document')=>{await run(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button '+${JSON.stringify(text)});b.click();return true})()`);await delay(100)};
 const select=async(selector,value)=>{await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await delay(120)};
 const shot=async name=>{await delay(150);fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG())};
 const check=async(name,fn)=>{try{results.push({name,passed:true,observation:await fn()})}catch(e){results.push({name,passed:false,error:e.stack});try{await shot(name+'-failed')}catch{}}fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({results,crashes},null,2))};
 const {decodeShareCode}=await import(pathToFileURL(path.join(project,'src/lib/shareCode.js')).href);
 await win.loadURL('nikke://app/');await until("!!document.querySelector('.topbar')");
 const roster=require('../src/data/roster.json').characters,codes=roster.slice(0,3).map(c=>String(c.nameCode)),order=[codes[2],codes[0],codes[1]],names=order.map(c=>roster.find(r=>r.nameCode===c).name);
 const dataKey='nikke-photos/profiles/v1/data/default',selectionKey='nikke-photos/stats/selection/v1';
 const line={functionType:'StatAtk',level:1,value:4.77},complete={equipments:Array.from({length:4},()=>[line,null,null])};
 const seed=()=>run(`localStorage.setItem(${JSON.stringify(dataKey)},${JSON.stringify(JSON.stringify({version:2,characters:Object.fromEntries(codes.map(c=>[c,complete]))}))});sessionStorage.setItem(${JSON.stringify(selectionKey)},${JSON.stringify(JSON.stringify(order))})`);
 const selected=()=>run(`JSON.parse(sessionStorage.getItem(${JSON.stringify(selectionKey)}))`);
 const rowNames=()=>run("[...document.querySelectorAll('.stats-main .st-row .st-name')].map(e=>e.textContent)");
 let activeNames,fullPngHeight;
 await check('initial-and-saved-edit-recalculates',async()=>{
  await seed();await route('/stats');await until("document.querySelectorAll('.stats-main .st-row').length===3");const initial=await rowNames();assert.equal(initial.length,3);activeNames=initial;
  const download=async name=>{const file=path.join(root,name+'.png'),done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),15000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});await click('导出图片');await done;return PNG.sync.read(fs.readFileSync(file)).height};
  fullPngHeight=await download('three-rows');
  await route('/data?code='+codes[0]);await until("document.querySelectorAll('.equip-block').length===4");await select('.equip-block .affix-row select:nth-of-type(2)','2');
  await route('/stats');assert.ok(await run("document.querySelectorAll('.stats-main .st-row')[1].textContent.includes('19.78%')"));
  return {initialNames:initial,newAttack:'19.78%',selection:await selected(),fullPngHeight};
 });
 await check('clear-suspends-without-losing-order-and-excludes-exports',async()=>{
  await route('/data?code='+codes[0]);await until("document.querySelectorAll('.equip-block').length===4");await click('清空本件',"document.querySelector('.equip-block')");await route('/stats');
  assert.deepEqual(await rowNames(),[activeNames[0],activeNames[2]]);assert.deepEqual(await selected(),order);assert.ok(await run("document.querySelector('.stats-paused').textContent.includes('补齐后自动恢复')"));
  await click('导出表格码');const decoded=decodeShareCode(await run("document.querySelector('.dlg textarea').value"));assert.deepEqual(decoded.nameCodes,[order[0],order[2]]);await run("document.querySelector('.dlg-x').click()");
  await click('放大预览');assert.equal(await run("document.querySelectorAll('.st-row').length"),4);await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await delay(100);
  const file=path.join(root,'two-rows.png'),done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),15000);web.session.once('will-download',(_e,item)=>{item.setSavePath(file);item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});await click('导出图片');await done;const height=PNG.sync.read(fs.readFileSync(file)).height;assert.ok(height<fullPngHeight);await shot('suspended-main');
  await click('编辑表格角色');assert.equal(await run("document.querySelectorAll('.et-body .stats-paused .et-tile').length"),1);await click('完成');
  await route('/bot-share');if(await run("!!document.querySelector('.dlg-mask')"))await click('知道了');const bot=decodeShareCode(await run("document.querySelector('.bs-section[aria-label=表格设置] textarea').value"));assert.deepEqual(bot.nameCodes,[order[0],order[2]]);return {selectionRetained:true,code:decoded.nameCodes,botCode:bot.nameCodes,pngHeight:height};
 });
 await check('repair-restores-original-order',async()=>{
  await route('/data?code='+codes[0]);await until("document.querySelectorAll('.equip-block').length===4");await select('.equip-block .affix-row select:nth-of-type(1)','StatAtk');await select('.equip-block .affix-row select:nth-of-type(2)','3');await route('/stats');
  assert.deepEqual(await rowNames(),activeNames);assert.deepEqual(await selected(),order);assert.equal(await run("!!document.querySelector('.stats-main .stats-paused')"),false);assert.ok(await run("document.querySelectorAll('.stats-main .st-row')[1].textContent.includes('20.49%')"));return {restored:true,attack:'20.49%'};
 });
 await check('open-page-storage-refresh-and-all-suspended',async()=>{
  await run(`(()=>{const d=JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)}));d.characters[${JSON.stringify(codes[0])}].equipments[0][0]={functionType:'StatAtk',level:4,value:6.88};localStorage.setItem(${JSON.stringify(dataKey)},JSON.stringify(d));window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(dataKey)}}));return true})()`);await until("document.querySelectorAll('.stats-main .st-row')[1].textContent.includes('21.19%')");
  await run(`(()=>{const d=JSON.parse(localStorage.getItem(${JSON.stringify(dataKey)}));for(const c of Object.values(d.characters))c.equipments[0]=[null,null,null];d.characters[${JSON.stringify(String(roster[3].nameCode))}]=${JSON.stringify(complete)};localStorage.setItem(${JSON.stringify(dataKey)},JSON.stringify(d));window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(dataKey)}}));return true})()`);await until("document.querySelectorAll('.stats-main .st-row').length===0");assert.deepEqual(await selected(),order);
  assert.equal(await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='导出图片').disabled"),true);assert.equal(await run("document.querySelectorAll('.stats-paused li').length"),3);
  for(const theme of ['light','dark'])for(const width of [1280,390]){win.setSize(width,960);await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await delay(100);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await shot('all-suspended-'+theme+'-'+width)}
  await route('/bot-share');assert.equal(await run("document.querySelector('.bs-section[aria-label=表格设置] textarea').value"),'');await route('/stats');await click('移出名单',"document.querySelector('.stats-paused li')");assert.deepEqual(await selected(),order.slice(1));await click('清空',"document.querySelector('.stats-head')");assert.deepEqual(await selected(),[]);return {liveAttack:'21.19%',allSuspendedExcluded:true,botNoDefaultFallback:true,narrowThemes:true,removeAndClear:true};
 });
 assert.equal(crashes.length,0);console.log(JSON.stringify({root,results}));win.destroy();app.exit(results.every(r=>r.passed)?0:1);
}).catch(e=>{console.error(e);fs.writeFileSync(path.join(root,'fatal.txt'),e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),120000).unref();
