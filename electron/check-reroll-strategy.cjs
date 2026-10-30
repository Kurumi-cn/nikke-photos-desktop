const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,cacheRoot})=>{
 const web=win.webContents,host=s=>web.executeJavaScript(s),remote=[];
 const until=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await delay(100)}throw Error('reroll strategy setup timeout')};
 web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,callback)=>{remote.push(d.url);callback({cancel:true})});
 try {
  await until(()=>host("!!document.querySelector('.topbar')"));
  const title='NIKKE Photos ——作者：小云雀来海，目前为测试版本，不代表最终品质。';
  assert.equal(win.getTitle(),title);assert.equal(await host('document.title'),title);
  const displayVersion='v'+(await import('../src/data/changelog.js')).CURRENT_VERSION;
  assert.equal(await host("document.querySelector('.version').textContent"),displayVersion);
  assert.equal(await host("!!document.querySelector('[aria-label=\"版本更新\"]')"),false);
  await host("location.hash='/changelog'");await until(()=>host("!!document.querySelector('.cl-list')"));
  assert.equal(await host("document.querySelectorAll('.cl-entry').length"),0);
  assert.ok(await host("document.querySelector('.cl-list').textContent.includes('暂无更新记录')"));
  win.show();await delay(150);fs.writeFileSync(path.join(cacheRoot,'app-version-changelog.png'),(await web.capturePage()).toPNG());win.hide();
  await until(()=>host("!!document.querySelector('.topbar')"));await host("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click();location.hash='/tools'");
  await until(()=>host("!!document.querySelector('#tab-equipment-reroll')"));await host("document.querySelector('#tab-equipment-reroll').click()");
  let frame;await until(async()=>{frame=web.mainFrame.frames.find(f=>f.url.includes('/equipment-reroll/index.html'));return frame&&await frame.executeJavaScript("!!document.querySelector('#resource-strategy')")});
  const boundary=await frame.executeJavaScript("(()=>{let isolated=false;try{void parent.localStorage.length}catch{isolated=true}return {isolated,bridge:typeof window.nikkeDesktop}})()");
  assert.deepEqual(boundary,{isolated:true,bridge:'undefined'});
  const hostBefore=await host('JSON.stringify({...localStorage})');
  const navigation=await require('./check-reroll-navigation.cjs')({window:win,frame,cacheRoot});
  const strategy=await require('./check-strategy.cjs')(win,cacheRoot,{enhancements:true});
  const simulator=await require('./check-simulator.cjs')(win,cacheRoot);
  assert.equal(await host('JSON.stringify({...localStorage})'),hostBefore);assert.equal(remote.length,0);
  return {appIdentity:{windowTitle:true,version:displayVersion,emptyChangelog:true,noEmptyUpdatePopup:true},navigation,strategy,simulator,boundary,offline:true,hostStorageUnchanged:true};
 } catch(e) {fs.writeFileSync(path.join(cacheRoot,'failure.png'),(await web.capturePage()).toPNG());throw e}
 finally{web.session.webRequest.onBeforeRequest(null)}
};
