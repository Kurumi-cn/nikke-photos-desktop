// Offline UI regression: isolated profile, local resources, no game/automation bridge.
const {app,BrowserWindow,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{PNG}=require('pngjs');
const project=path.resolve(process.env.NIKKE_ASSET_TEST_PROJECT||path.resolve(__dirname,'..'));
const root=path.resolve(process.env.NIKKE_ASSET_TEST_CACHE||path.resolve(project,'../codex temp/nikke-desktop/workshop-update-2026-10-31/ui'));
const expectedCn=Number(process.env.NIKKE_ASSET_TEST_CN_COUNT||152);
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'data'));app.setPath('sessionData',path.join(root,'session'));
protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),report={passed:false,characters:[],skins:[],remote:[],errors:[]};
app.whenReady().then(async()=>{
 protocol.handle('nikke',req=>{const u=new URL(req.url),base=path.join(project,'dist'),file=path.resolve(base,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(u.host!=='app'||!file.startsWith(base+path.sep)||!fs.existsSync(file))return new Response('',{status:404});return net.fetch(pathToFileURL(file).href)});
 const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}}),web=win.webContents,run=s=>web.executeJavaScript(s);
 web.on('console-message',(_e,detail)=>{if(detail.level==='error')report.errors.push(detail.message)});
 web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>{report.remote.push(d.url);cb({cancel:true})});
 const until=async code=>{for(let i=0;i<180;i++){if(await run(code))return;await delay(60)}throw Error('Timeout: '+code)};
 const route=async code=>{await run(`location.hash=${JSON.stringify('/character/'+code)}`);await delay(150)};
 const shot=async name=>{await delay(150);fs.writeFileSync(path.join(root,name+'.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG())};
 await win.loadURL('nikke://app/');await until("!!document.querySelector('.topbar')");
 await run("localStorage.clear();sessionStorage.clear();localStorage.setItem('nikke-photos/update-notice/v1','1.0');location.reload()");await until("!!document.querySelector('.topbar')");
 const fixture={version:2,characters:Object.fromEntries(['5185','5186','5187'].map(c=>[c,{skills:{skill1:10,skill2:10,burst:10},cube:{resourceId:10015,nameCn:'遗迹外框魔方',level:15},equipments:[[],[],[],[]]}]))};
 await run(`localStorage.setItem('nikke-photos/profiles/v1/data/default',${JSON.stringify(JSON.stringify(fixture))});location.reload()`);await until("document.querySelectorAll('.grid .tile').length===208");
 await run("document.querySelector('.toolbar .switch').click()");await until(`document.querySelectorAll('.grid .tile').length===${expectedCn}`);
 report.cnCount=expectedCn;await run("document.querySelector('.toolbar .switch').click()");
 await until("document.querySelectorAll('.grid .tile').length===208");
 for(const [code,stem] of [['5185','c019'],['5186','c472'],['5187','c473']]){
  await run(`document.querySelector('a[href=\"#/character/${code}\"]').scrollIntoView()`);
  await until(`document.querySelector('a[href=\"#/character/${code}\"] .thumb img')?.naturalWidth>0`);
  await route(code);await until(`document.querySelector('.np-card-art')?.getAttribute('src').endsWith('${stem}.webp')&&document.querySelector('.np-card-art').naturalWidth>0`);
  await until("document.querySelectorAll('.np-skill-glyph').length===3&&[...document.querySelectorAll('.np-skill-glyph')].every(i=>i.naturalWidth>0)");
  await until("document.querySelector('.np-cube img')?.naturalWidth>0");
  assert.ok(await run("document.querySelector('.np-cube').getAttribute('title').includes('遗迹外框魔方')"));
  report.characters.push({code,avatar:true,artwork:true,skills:await run("[...document.querySelectorAll('.np-skill-glyph')].map(i=>i.getAttribute('src'))"),cube:true});await shot(stem);
  if(code!=='5187'){await run("location.hash='/'");await until("document.querySelectorAll('.grid .tile').length===208")}
 }
 for(const [code,id,file] of [['5161','skin-1','c471_01.webp'],['5170','skin-1','c018_01.webp'],['5185','skin-1','c019_01.webp'],['5155','skin-2','c223_02.webp']]){
  await route(code);await until(`!!document.querySelector('.config select option[value=\"${id}\"]')`);
  await run(`(()=>{const s=document.querySelector('.config select');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await until(`document.querySelector('.np-card-art')?.getAttribute('src').endsWith('${file}')&&document.querySelector('.np-card-art').naturalWidth>0`);
  report.skins.push({code,id,file,loaded:true});await shot(file.replace('.webp',''));
 }
 await run("location.hash='/data?code=5185'");await until("!!document.querySelector('.character-form select option[value=\"10015\"]')||!!document.querySelector('option[value=\"10015\"]')");
 report.cubeOption=await run("document.querySelector('option[value=\"10015\"]').textContent");assert.equal(report.cubeOption,'遗迹外框魔方');
 assert.equal(report.remote.length,0);assert.equal(report.errors.length,0);report.passed=true;
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));win.destroy();app.quit();
}).catch(error=>{report.error=error.stack;fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.error(error.stack);app.exit(1)});
