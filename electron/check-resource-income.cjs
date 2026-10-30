const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function checkResourceIncome(window,cacheRoot){
 const web=window.webContents;const before=await web.executeJavaScript('JSON.stringify({...localStorage})');
 await web.executeJavaScript("document.querySelector('#tab-resource-income').click()");
 async function js(code){return web.executeJavaScript(code)}
 async function until(read,label){for(let i=0;i<100;i++){if(await read())return;await delay(60)}throw Error('Income timeout: '+label)}
 await until(()=>js("!!document.querySelector('#income-date') && !document.querySelector('#income-date').disabled"),'ready');
 await until(()=>js("document.querySelectorAll('.income-resource-label img').length===10 && [...document.querySelectorAll('.income-resource-label img')].every(i=>i.complete&&i.naturalWidth>0)"),'local resource icons');
 assert.equal(await js("document.querySelector('.resource-income').innerText.includes('洗练石')"),false);
 assert.equal(await js("document.querySelector('#income-stones').closest('label').textContent"),'订制模组');
 assert.deepEqual(await js("[...document.querySelectorAll('.income-statistics dt')].map(e=>({text:e.textContent,alt:e.querySelector('img').alt}))"),Array.from({length:3},()=>[{text:'',alt:'订制模组'},{text:'',alt:'自订秘钥'}]).flat());
 const today=await js("document.querySelector('#income-date').value");assert.match(today,/^\d{4}-\d{2}-\d{2}$/);
 const original=await js('window.nikkeDesktop.resourceIncome.read()');
 // Only the independent smoke-data directory is used by --smoke-test.
 async function fill(id,value){await js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(40)}
 async function save(){await js("document.querySelector('#income-save').click()");await until(()=>js("!!document.querySelector('.income-notice') && !document.querySelector('#income-save').disabled"),'save')}
 await fill('income-date','2000-01-01');await fill('income-stones','5');await fill('income-keys','');await save();
 await fill('income-stones','9');await fill('income-keys','2');await save();
 let doc=await js('window.nikkeDesktop.resourceIncome.read()');assert.equal(doc.records.filter(r=>r.date==='2000-01-01').length,1);assert.deepEqual(doc.records.find(r=>r.date==='2000-01-01'),{date:'2000-01-01',stones:9,keys:2});
 await web.reload();await delay(700);await js("[...document.querySelectorAll('.dlg-mask button')].find(b=>b.textContent.trim()==='知道了')?.click();location.hash='/tools'");await until(()=>js("!!document.querySelector('#tab-resource-income')"),'tool tab');await js("document.querySelector('#tab-resource-income').click()");
 await until(()=>js("!!document.querySelector('[data-income-date=\"2000-01-01\"]')"),'persisted UI');
 await js("[...document.querySelector('[data-income-date=\"2000-01-01\"]').querySelectorAll('button')].find(b=>b.textContent==='编辑').click()");
 assert.equal(await js("document.querySelector('#income-stones').value"),'9');
 await delay(500);
 fs.writeFileSync(path.join(cacheRoot,'resource-income-smoke.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await js("document.querySelector('.theme-toggle').click()");await delay(500);
 fs.writeFileSync(path.join(cacheRoot,'resource-income-dark.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await js("document.querySelector('.theme-toggle').click()");await delay(100);
 await js("[...document.querySelector('[data-income-date=\"2000-01-01\"]').querySelectorAll('button')].find(b=>b.textContent==='删除').click()");
 await until(()=>js("!!document.querySelector('#income-delete-confirm')"),'delete confirmation');
 await js("document.querySelector('#income-delete-confirm').click()");await until(()=>js("!document.querySelector('[data-income-date=\"2000-01-01\"]')"),'delete');
 // Restore disposable fixture if a previous smoke run already had this date.
 const old=original.records.find(r=>r.date==='2000-01-01');if(old)await js(`window.nikkeDesktop.resourceIncome.save(${JSON.stringify(old)})`);
 assert.equal(await js('JSON.stringify({...localStorage})'),before);
 const {dialog}=require('electron');const nativeDialog=dialog.showSaveDialog;
 const exportFile=path.join(cacheRoot,'resource-income-export-smoke.json');
 try {
   dialog.showSaveDialog=async()=>({canceled:false,filePath:exportFile});
   const expected=await js('window.nikkeDesktop.resourceIncome.read()');
   await js("document.querySelector('.income-heading button').click()");
   await until(()=>js("document.querySelector('.income-notice')?.textContent.includes('JSON 备份已导出')"),'export success');
   assert.deepEqual(JSON.parse(fs.readFileSync(exportFile,'utf8')),expected);
   dialog.showSaveDialog=async()=>({canceled:true});
   assert.equal((await js('window.nikkeDesktop.resourceIncome.exportBackup()')).canceled,true);
 }finally{dialog.showSaveDialog=nativeDialog}
 const {dataRoot}=await js('window.nikkeDesktop.getInfo()');assert.ok(dataRoot.startsWith(cacheRoot));
 const persisted=JSON.parse(fs.readFileSync(path.join(dataRoot,'tools','resource-income.json'),'utf8'));assert.deepEqual(persisted,await js('window.nikkeDesktop.resourceIncome.read()'));
 assert.ok(fs.existsSync(path.join(dataRoot,'tools','resource-income.json.bak')));
 return {resourceLabelsAndLocalIcons:true,statLabelsReplacedWithAccessibleIcons:true,dateUnique:true,edit:true,delete:true,reloadPersistence:true,diskJSON:true,previousBackup:true,hostStoreUnchanged:true,jsonExport:true,cancelExport:true,theme:true};
}
