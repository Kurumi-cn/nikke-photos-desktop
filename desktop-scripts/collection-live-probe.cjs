// Explicit --collection-live-check only. Human approves UAC once; helper runs the full flow.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({window,cacheRoot})=>{
 const web=window.webContents,delay=ms=>new Promise(r=>setTimeout(r,ms));
 const beforeStatus=await web.executeJavaScript("window.nikkeDesktop.maanikke.request('collectionStatus')");
 await web.executeJavaScript("document.querySelector('[aria-label=\"角色装备采集\"]').scrollIntoView({block:'start'});for(const name of ['桃乐丝','米哈拉：羁绊锁链','小红帽']){const el=[...document.querySelectorAll('input[type=checkbox]')].find(e=>e.getAttribute('aria-label')==='采集 '+name);if(!el.checked)el.click()}");
 await delay(150);fs.writeFileSync(path.join(cacheRoot,'selected-roster.png'),(await web.capturePage()).toPNG());
 await web.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='启动所选角色采集（UAC）').click()");
 const deadline=Date.now()+12*60*1000;let status;
 do{
  await delay(750);status=await web.executeJavaScript("window.nikkeDesktop.maanikke.request('collectionStatus')");
  fs.writeFileSync(path.join(cacheRoot,'collection-progress.json'),JSON.stringify(status,null,2));
  if(status.runId&&status.runId!==beforeStatus.runId&&!status.active)break;
  if((!status.runId||status.runId===beforeStatus.runId)&&Date.now()>deadline-12*60*1000+10000){
   const problem=await web.executeJavaScript("document.querySelector('[aria-label=\"角色装备采集\"] [role=alert]')?.textContent");
   if(problem)throw Error(problem);
  }
 }while(Date.now()<deadline);
 fs.writeFileSync(path.join(cacheRoot,'collection-result.json'),JSON.stringify(status,null,2));
 await web.executeJavaScript("document.querySelector('[aria-label=\"角色装备采集\"]').scrollIntoView({block:'end'})");await delay(150);
 fs.writeFileSync(path.join(cacheRoot,'collection-result.png'),(await web.capturePage()).toPNG());
 assert.equal(status?.stage,'completed',status?.error||'Collection did not complete');
 assert.equal(status.returnedToLobby,true);
 const entries=Object.values(status.draft);assert.equal(entries.length,3);assert.equal(entries.filter(e=>e.status==='complete').length,3);
 assert.ok(entries.every(e=>Object.keys(e.equipment).length===4));
 const shots=await web.executeJavaScript("window.nikkeDesktop.maanikke.screenshots('stats')");assert.equal(shots.activeTasks,0);
 const inputRequests=fs.readFileSync(path.join(status.folder,'actions.jsonl'),'utf8').trim().split('\n').filter(Boolean).length;
 return {passed:true,runId:status.runId,inputRequests,returnedToLobby:true,characters:3,equipment:12,skipped:entries.filter(e=>e.status==='skipped').length,unreadableRows:entries.flatMap(e=>Object.values(e.equipment).flatMap(s=>s.rows)).filter(r=>r.status==='unreadable').length,remainingScreenshots:shots.count};
};
