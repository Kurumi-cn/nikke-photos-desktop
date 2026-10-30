const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function checkBelorta(window,cacheRoot){
 const web=window.webContents,remote=[];web.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>{remote.push(d.url);cb({cancel:true})});
 const js=code=>web.executeJavaScript(code);async function until(read,label){for(let i=0;i<140;i++){if(await read())return;await delay(70)}throw Error('Belorta timeout: '+label)}
 const profileBefore=await js("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([k])=>k.startsWith('nikke-photos/profile')||k.startsWith('nikke-photos/profiles'))))");
 try{
  const state={search:'Belorta',selected:{original_rare:['SSR'],class:['Supporter'],corporation:['TETRA'],element:['Water'],weapon_type:['RL'],use_burst_skill:['Step2']},toggles:{cnPublished:false,collectible:false,overSpec:false}};
  await js(`sessionStorage.setItem('nikke-photos:list-filters',${JSON.stringify(JSON.stringify(state))});location.hash='/'`);
  await until(()=>js("document.querySelectorAll('.grid a.tile').length===1 && !!document.querySelector('a[href=\"#/character/5184\"]')"),'filtered selector');
  await until(()=>js("document.querySelector('a[href=\"#/character/5184\"] .thumb img').naturalWidth===128"),'local avatar');
  await js("document.querySelector('a[href=\"#/character/5184\"] .thumb img').dispatchEvent(new Event('error'))");
  await until(()=>js("!!document.querySelector('a[href=\"#/character/5184\"] .ph')"),'avatar fallback');
  await js("document.querySelector('a[href=\"#/character/5184\"]').click()");
  await until(()=>js("document.querySelector('.np-card-art')?.naturalWidth===2048"),'static portrait');
  assert.match(await js("document.querySelector('.char-head').textContent"),/5184/);
  await js("(()=>{const e=document.querySelector('.config-block input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'120');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until(()=>js("document.querySelector('.np-card-art').style.transform.includes('1.2')"),'artwork editing');
  const exportFile=path.join(cacheRoot,'belorta-pumpkin-card.png');
  const download=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('PNG download timeout')),18000);web.session.once('will-download',(_e,item)=>{item.setSavePath(exportFile);item.once('done',(_event,state)=>{clearTimeout(timeout);state==='completed'?resolve():reject(Error('Download '+state))})});});
  await js("[...document.querySelectorAll('.head-actions button')].find(b=>b.textContent.trim()==='导出图片').click()");
  await until(()=>js("!!document.querySelector('.dlg[aria-label=\"导出设置\"]')"),'export settings');
  await js("[...document.querySelectorAll('.dlg .zoom button')].find(b=>b.textContent.trim()==='1x').click()");await delay(40);
  await js("[...document.querySelectorAll('.dlg-foot button')].find(b=>b.textContent.trim()==='导出 PNG').click()");await download;
  const png=PNG.sync.read(fs.readFileSync(exportFile));assert.equal(png.width,736);assert.equal(png.height,1096);assert.ok(fs.statSync(exportFile).size>50000);
  await delay(400);fs.writeFileSync(path.join(cacheRoot,'belorta-pumpkin-card-ui.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await js("document.querySelector('.np-card-art').dispatchEvent(new Event('error'))");await until(()=>js("!!document.querySelector('.np-card-art-placeholder')"),'portrait fallback');
  await js("location.hash='/character/3007'");await until(()=>js("document.querySelector('.np-card-art')?.getAttribute('src').includes('c060.webp')"),'base variant remains');
  assert.equal(await js("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([k])=>k.startsWith('nikke-photos/profile')||k.startsWith('nikke-photos/profiles'))))"),profileBefore);
  assert.equal(remote.length,0);return {sixGroupFilter:true,avatar:true,avatarFallback:true,staticArtwork:true,artworkEditing:true,pngExport:{width:png.width,height:png.height},artworkFallback:true,baseVariantRetained:true,profileUnchanged:true,offline:true};
 }finally{web.session.webRequest.onBeforeRequest(null)}
}
