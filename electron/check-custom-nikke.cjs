const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs'),{createHash}=require('node:crypto');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async function({window:win,cacheRoot}) {
  const web=win.webContents,js=code=>web.executeJavaScript(code),report={};
  const until=async(code)=>{for(let i=0;i<220;i++){if(await js(code))return;await delay(50)}fs.writeFileSync(path.join(cacheRoot,'failure-dom.json'),JSON.stringify(await js("({url:location.href,text:document.body.innerText.slice(0,8000)})"),null,2));throw Error('Custom Nikke timeout: '+code)};
  const reload=async()=>{await new Promise(resolve=>{web.once('did-finish-load',resolve);web.reload()});await until("!!document.querySelector('.topbar')")};
  const set=async(name,value)=>{await js(`(()=>{const e=document.querySelector('[name=${name}]');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(20)};
  const goto=async(url)=>{await js(`location.hash=${JSON.stringify(url)}`);await delay(80)};
  const click=code=>js(code);
  const submit=()=>click("document.querySelector('.custom-nikke-form [type=submit]').click()");
  const readLibrary=()=>js("new Promise((resolve,reject)=>{const r=indexedDB.open('nikke-photos-custom-nikke-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('characters').objectStore('characters').getAll();q.onsuccess=()=>{db.close();resolve(q.result.map(x=>({id:x.id,nameCn:x.nameCn,weapon_type:x.weapon_type,avatar:Boolean(x.avatarImage),artwork:Boolean(x.artworkImage),updatedAt:x.updatedAt,deletedAt:x.deletedAt||null})))}};r.onerror=reject})");
  await until("!!document.querySelector('.topbar')");
  if(process.env.NIKKE_CUSTOM_RESTART_ONLY==='1') {
    const previous=JSON.parse(fs.readFileSync(path.join(cacheRoot,'custom-nikke-result.json'),'utf8'));
    assert.ok((await readLibrary()).find(record=>record.id===previous.ids[0]).deletedAt);
    await goto('/custom-nikke/new');await until(`!!document.querySelector('[data-deleted-id="${previous.ids[0]}"]')`);
    await click("document.querySelector('.custom-deleted summary').click()");
    await click(`document.querySelector('[data-deleted-id="${previous.ids[0]}"] button').click()`);
    await until(`!!document.querySelector('[data-custom-id="${previous.ids[0]}"]')`);
    await goto('/character/'+previous.ids[1]);await until("document.querySelector('.np-card-art')?.naturalWidth===320");
    await goto('/data?code='+previous.ids[0]);await until("!!document.querySelector('.form-grid')");
    assert.equal(await js("[...document.querySelectorAll('.form-row')].find(r=>r.querySelector('.form-label')?.textContent==='战斗力').querySelector('input').value"),'12345');
    return {...previous,processRestart:true,deletionSurvivesRestart:true,restoreKeepsRecord:true};
  }
  // All test-only rows are in the dedicated custom-nikke-check/data directory.
  await js("new Promise(resolve=>{const r=indexedDB.open('nikke-photos-custom-nikke-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('characters','readwrite');tx.objectStore('characters').clear();tx.oncomplete=()=>{db.close();resolve()}}})");
  await reload();
  await click("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  win.showInactive();win.focus();
  await goto('/my');
  assert.equal(await js("!!document.querySelector('a[href=\"#/custom-nikke/new\"]')"),true);
  await click("document.querySelector('a[href=\"#/custom-nikke/new\"]').click()");
  await until("!!document.querySelector('.custom-nikke-form')");
  await submit();await delay(50);
  assert.equal(await js("document.querySelectorAll('.custom-nikke-form .custom-required').length"),6);
  assert.equal(await js("[...document.querySelectorAll('.custom-nikke-form .custom-required')].every(e=>{const rgb=getComputedStyle(e).color.match(/\\d+/g).map(Number);return rgb[0]>150&&rgb[0]>rgb[1]&&rgb[0]>rgb[2]})"),true);report.redRequiredMarks=true;
  assert.equal(await js("[...document.querySelectorAll('.custom-field-error')].filter(e=>e.textContent.trim()).length"),6);
  assert.equal(await js("document.activeElement.name"),'nameCn');report.requiredValidation=true;
  const fill=async name=>{await set('nameCn',name);for(const [key,value]of Object.entries({element:'Water',corporation:'TETRA',class:'Supporter',use_burst_skill:'Step2'}))await set(key,value);await click("document.querySelector('[name=original_rare][value=SSR]').click()")};
  await fill('本地测试妮姬无图');await submit();await until("!!document.querySelector('.custom-success')");
  let library=await readLibrary();const first=library.find(x=>x.nameCn==='本地测试妮姬无图');assert.ok(first.id.startsWith('custom-'));assert.equal(first.weapon_type,'');assert.equal(first.avatar,false);report.optionalImagesAndWeapon=true;
  const selected={element:['Water'],corporation:['TETRA'],class:['Supporter'],use_burst_skill:['Step2'],original_rare:['SSR']};
  await js(`sessionStorage.setItem('nikke-photos:list-filters',${JSON.stringify(JSON.stringify({search:'本地测试妮姬无图',selected,toggles:{}}))})`);
  await goto('/');await until(`!!document.querySelector('a[href="#/character/${first.id}"]')`);
  assert.equal(await js("document.querySelectorAll('.grid a.tile').length"),1);assert.match(await js("document.querySelector('.grid').innerText"),/自定义/);report.searchAndFiveFilters=true;
  await goto('/character/'+first.id);await until("!!document.querySelector('.np-card-art-placeholder')");
  assert.equal(await js("[...document.querySelectorAll('.head-actions button')].some(b=>b.textContent==='分享到 BOT')"),false);report.customShareHidden=true;
  await goto('/data?code='+first.id);await until("!!document.querySelector('.form-grid')");
  await js("(()=>{const e=[...document.querySelectorAll('.form-row')].find(r=>r.querySelector('.form-label')?.textContent==='战斗力').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'12345');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until(`Object.entries({...localStorage}).some(([k,v])=>k.startsWith('nikke-photos/profiles/v1/data/')&&v.includes('${first.id}')&&v.includes('12345'))`);report.dataEntry=true;
  await goto('/custom-nikke/new');await until("!!document.querySelector('.custom-nikke-form')");
  await fill('本地测试妮姬无图');await submit();await until("[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('同名'))");assert.equal((await readLibrary()).length,1);report.duplicateRejected=true;
  await set('nameCn','本地测试妮姬有图');await set('weapon_type','RL');
  const avatarPng=new PNG({width:128,height:128}),artPng=new PNG({width:320,height:480});
  for(const png of [avatarPng,artPng])for(let i=0;i<png.data.length;i+=4){png.data[i]=70;png.data[i+1]=135;png.data[i+2]=205;png.data[i+3]=(i/4)%7===0?0:255}
  const avatarBytes=PNG.sync.write(avatarPng),artBytes=PNG.sync.write(artPng);
  const upload=async(kind,bytes,type='image/png')=>{await js(`(()=>{const b=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));const f=new File([b],'test.png',{type:${JSON.stringify(type)}}),d=new DataTransfer();d.items.add(f);const e=document.querySelector('input[data-image=${kind}]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100)};
  await upload('avatar',Buffer.from('not-an-image'));
  await until("[...document.querySelectorAll('.custom-upload [role=alert]')].some(e=>e.textContent.includes('请选择'))");
  await upload('avatar',avatarBytes,'application/octet-stream');await upload('artwork',artBytes);
  await until("document.querySelector('.custom-preview-art img')?.naturalWidth===320 && document.querySelector('.custom-preview-name img')?.naturalWidth===128");
  await delay(150);fs.writeFileSync(path.join(cacheRoot,'custom-nikke-form.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await js("document.documentElement.dataset.theme='dark'");await delay(150);fs.writeFileSync(path.join(cacheRoot,'custom-nikke-dark.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await js("document.documentElement.dataset.theme='light'");
  // A synchronous quota fault must abort and retain the draft/images for retry.
  await js("(()=>{const old=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){IDBObjectStore.prototype.put=old;throw new DOMException('test quota','QuotaExceededError')}})()");
  await submit();await until("[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('保存失败'))");
  assert.equal((await readLibrary()).length,1);assert.equal(await js("document.querySelector('[name=nameCn]').value"),'本地测试妮姬有图');report.failedWriteRetainsDraft=true;
  await submit();await until("!!document.querySelector('.custom-success')");library=await readLibrary();const second=library.find(x=>x.nameCn==='本地测试妮姬有图');assert.ok(second.avatar&&second.artwork);assert.equal(second.weapon_type,'RL');
  const blobBase64=await js(`new Promise(resolve=>{const r=indexedDB.open('nikke-photos-custom-nikke-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('characters').objectStore('characters').get('${second.id}');q.onsuccess=async()=>{const image=q.result.artworkImage.blob;const reader=new FileReader();reader.onload=()=>{db.close();resolve(reader.result.split(',')[1])};reader.readAsDataURL(image)}}})`);
  assert.equal(createHash('sha256').update(Buffer.from(blobBase64,'base64')).digest('hex'),createHash('sha256').update(artBytes).digest('hex'));report.imageBytesPreserved=true;
  // Reload restores definitions and image URLs before routes resolve local IDs.
  await reload();await click("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await goto('/character/'+second.id);await until("document.querySelector('.np-card-art')?.naturalWidth===320");report.reloadWithImages=true;
  await goto('/data?code='+first.id);await until("!!document.querySelector('.form-grid')");assert.equal(await js("[...document.querySelectorAll('.form-row')].find(r=>r.querySelector('.form-label')?.textContent==='战斗力').querySelector('input').value"),'12345');report.recordSurvivesReload=true;
  await goto('/custom-nikke/new?edit='+second.id);await until("document.querySelector('[name=nameCn]')?.value==='本地测试妮姬有图'");await set('nameCn','本地测试妮姬已修改');await submit();await until("!!document.querySelector('.custom-success')");assert.equal((await readLibrary()).find(x=>x.id===second.id).nameCn,'本地测试妮姬已修改');report.editStableIdentity=true;
  // Sharing page excludes custom identities, even when a stats selection contains them.
  await js(`sessionStorage.setItem('nikke-photos/stats/selection/v1',JSON.stringify(['${first.id}','${second.id}','5005']))`);await goto('/bot-share');await until("document.body.innerText.includes('BOT 分享')");assert.equal(await js("document.body.innerText.includes('未收录的角色键') || document.body.innerText.includes('不参与分享')"),false);
  const {encodeTableShareCode}=await import('../src/lib/shareCode.js');
  assert.equal(await js(`[...document.querySelectorAll('textarea')].some(e=>e.value===${JSON.stringify(encodeTableShareCode({nameCodes:['5005']}))})`),true);report.shareSelectionExcluded=true;
  win.setMinimumSize(0,0);win.setSize(600,760);await goto('/custom-nikke/new');await until("!!document.querySelector('.custom-nikke-form')");assert.equal(await js("document.documentElement.scrollWidth<=innerWidth"),true);report.responsive=true;win.setSize(1440,960);
  // Corruption must prevent overwriting the existing library.
  await js("new Promise(resolve=>{const r=indexedDB.open('nikke-photos-custom-nikke-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('characters','readwrite');tx.objectStore('characters').put({id:'invalid-test-row'});tx.oncomplete=()=>{db.close();resolve()}}})");
  await reload();await goto('/custom-nikke/new');await until("!!document.querySelector('.custom-store-error')");assert.equal(await js("document.querySelector('.custom-nikke-form [type=submit]').disabled"),true);assert.equal((await readLibrary()).length,3);report.corruptionProtected=true;
  await js("new Promise(resolve=>{const r=indexedDB.open('nikke-photos-custom-nikke-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('characters','readwrite');tx.objectStore('characters').delete('invalid-test-row');tx.oncomplete=()=>{db.close();resolve()}}})");
  await click("document.querySelector('.custom-store-error button').click()");await until("!document.querySelector('.custom-store-error')");assert.equal((await readLibrary()).length,2);report.retryRecovery=true;
  // A second app window has no preload: storage updates still use browser APIs.
  const {BrowserWindow}=require('electron');
  const other=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  try {
    await other.loadURL('nikke://app/');
    const otherJs=code=>other.webContents.executeJavaScript(code);
    for(let i=0;i<120;i++){if(await otherJs(`document.querySelector('a[href="#/character/${second.id}"]')?.textContent.includes('已修改')`))break;await delay(50)}
    assert.equal(await otherJs('typeof window.nikkeDesktop'), 'undefined');
    await goto('/custom-nikke/new?edit='+second.id);await until("document.querySelector('[name=nameCn]')?.value==='本地测试妮姬已修改'");await set('nameCn','本地测试妮姬跨窗口');await submit();await until("!!document.querySelector('.custom-success')");
    for(let i=0;i<120;i++){if(await otherJs(`document.querySelector('a[href="#/character/${second.id}"]')?.textContent.includes('跨窗口')`))break;await delay(50)}
    assert.equal(await otherJs(`document.querySelector('a[href="#/character/${second.id}"]')?.textContent.includes('跨窗口')`),true);report.crossWindowUpdate=true;report.noBridgeStorage=true;
  }finally{other.destroy()}
  await goto('/custom-nikke/new');await until("!!document.querySelector('.custom-nikke-form')");await set('nameCn','未保存的本地草稿');
  await click("document.querySelector('.custom-nikke-page .back').click()");await until("!!document.querySelector('.dlg[aria-label=\"尚有未保存的资料\"]')");
  await click("[...document.querySelectorAll('.dlg-foot button')].find(b=>b.textContent==='离开并保留草稿').click()");await until("location.hash==='#/my'");
  await goto('/custom-nikke/new');await until("document.querySelector('[name=nameCn]')?.value==='未保存的本地草稿'");report.draftRestored=true;
  assert.equal(await js("!!document.querySelector('[data-custom-id=\"5005\"]')"),false);report.builtInNotDeletable=true;
  const profileSnapshot=await js("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([key])=>key.startsWith('nikke-photos/profiles/'))))");
  await click(`document.querySelector('[data-custom-id="${first.id}"] .custom-delete').click()`);await until("!!document.querySelector('.dlg[aria-label=\"删除自定义妮姬\"]')");
  await click("[...document.querySelectorAll('.dlg-foot button')].find(e=>e.textContent==='取消').click()");await until("!document.querySelector('.dlg[aria-label=\"删除自定义妮姬\"]')");assert.equal((await readLibrary()).find(record=>record.id===first.id).deletedAt,null);report.deleteCancel=true;
  await click(`document.querySelector('[data-custom-id="${first.id}"] .custom-delete').click()`);await until("!!document.querySelector('.dlg[aria-label=\"删除自定义妮姬\"]')");
  await click("[...document.querySelectorAll('.dlg-foot button')].find(e=>e.textContent==='删除此自定义妮姬').click()");await until(`!document.querySelector('[data-custom-id="${first.id}"]') && !!document.querySelector('[data-deleted-id="${first.id}"]')`);report.customDeletion=true;
  assert.equal(await js("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([key])=>key.startsWith('nikke-photos/profiles/'))))"),profileSnapshot);report.deleteKeepsAllProfiles=true;
  await js(`sessionStorage.setItem('nikke-photos:list-filters',${JSON.stringify(JSON.stringify({search:'本地测试妮姬无图',selected:{},toggles:{}}))})`);
  await goto('/');await until("!!document.querySelector('.toolbar .search')");assert.equal(await js(`!!document.querySelector('a[href="#/character/${first.id}"]')`),false);
  await goto('/data?code='+first.id);await until("!!document.querySelector('.data-workspace')");assert.equal(await js("!!document.querySelector('.form-grid')"),false);report.deletedHiddenFromEntry=true;
  await goto('/character/5005');await until("!!document.querySelector('.np-card')");assert.equal(await js("!!document.querySelector('.custom-delete')"),false);report.builtInStillWorks=true;
  report.ids=[first.id,second.id];report.finalCount=2;
  return report;
};
