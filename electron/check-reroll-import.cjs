const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async function({window:win,cacheRoot}){
  const web=win.webContents,host=code=>web.executeJavaScript(code),report={};
  const until=async(read,label)=>{for(let i=0;i<200;i++){if(await read())return;await delay(60)}throw Error('Reroll import timeout: '+label)};
  await until(()=>host("!!document.querySelector('.topbar')"),'app');
  const roster=require('../src/data/roster.json'),[complete,invalid,incomplete]=roster.characters;
  const equipments=[
    [{functionType:'StatAtk',level:6,value:8.29},null,{functionType:'StatCritical',level:1,value:2.30}],
    [{functionType:'IncElementDmg',level:12,value:24.96}],
    [{functionType:'StatAmmoLoad',level:1,value:27.84}],
    [{functionType:'StatChargeTime',level:7,value:3.75},null,null],
  ];
  const stamp='2026-10-26T00:00:00.000Z';
  const records={[complete.nameCode]:{equipments,updatedAt:stamp},[invalid.nameCode]:{equipments:Array.from({length:4},()=>[{functionType:'StatAtk',level:null,value:null}]),updatedAt:stamp},[incomplete.nameCode]:{equipments:[equipments[0]],updatedAt:stamp}};
  const index={version:2,currentId:'default',profiles:[{id:'default',name:'导入验收存档',synchroLevel:200,createdAt:stamp,updatedAt:stamp,schemes:[]},{id:'empty-profile',name:'空存档',synchroLevel:200,createdAt:stamp,updatedAt:stamp,schemes:[]}]};
  await host(`localStorage.clear();localStorage.setItem('nikke-photos/profiles/v1/index',${JSON.stringify(JSON.stringify(index))});localStorage.setItem('nikke-photos/profiles/v1/data/default',${JSON.stringify(JSON.stringify({version:2,characters:records,updatedAt:stamp}))});`);
  await new Promise(resolve=>{web.once('did-finish-load',resolve);web.reload()});
  await until(()=>host("!!document.querySelector('.topbar')"),'reload');
  await host("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click();location.hash='/tools'");
  await until(()=>host("!!document.querySelector('#tab-equipment-reroll')"),'tools');
  await host("document.querySelector('#tab-equipment-reroll').click()");
  let frame;
  await until(async()=>{frame=web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/index.html'));return frame},'frame');
  const js=code=>frame.executeJavaScript(code);
  await until(()=>js("!!document.querySelector('#import-completed-character')"),'import installed');
  await until(()=>js("!!document.querySelector('.expectation-outline')"),'calculator initialization completed');
  report.boundary=await js("(()=>{let isolated=false;try{void parent.localStorage.length}catch{isolated=true}return {isolated,bridge:typeof window.nikkeDesktop}})()");assert.ok(report.boundary.isolated);assert.equal(report.boundary.bridge,'undefined');
  const select=async(id,value)=>{await js(`(()=>{const e=document.querySelector('${id}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(20)};
  await select('#collection-select','single-equipment');assert.equal(await js("document.querySelector('#import-completed-character').hidden"),true);
  await select('#collection-select','manual-four-equipment');await until(()=>js("!document.querySelector('#import-completed-character').hidden"),'four mode');
  const board=()=>js("[...document.querySelectorAll('.equipment-current-rows')].map(c=>[...c.querySelectorAll('.form-row')].map(r=>({stat:r.querySelector('.stat-select').value,tier:Number(r.querySelector('.tier-select').value),locked:r.querySelector('.flag-input').checked})))");
  const initial=await board();
  const open=async()=>{await js("document.querySelector('#import-completed-character').click()");await until(()=>host("!!document.querySelector('.reroll-import-dialog[open]')"),'picker')};
  await open();
  assert.equal(await host("document.querySelectorAll('.reroll-import-option').length"),2);report.onlyCompleteListed=true;
  await host(`document.querySelector('input[name=reroll-import-character][value="${invalid.nameCode}"]').click()`);
  await until(()=>host("document.querySelector('.reroll-import-status').textContent.includes('缺少有效档位')"),'invalid tier');assert.equal(await host("document.querySelector('.reroll-import-dialog [type=submit]').disabled"),true);report.invalidDataBlocked=true;
  await host("[...document.querySelectorAll('.reroll-import-dialog .dlg-foot button')].find(b=>b.textContent==='取消').click()");await until(()=>js("!document.querySelector('#import-completed-character').disabled"),'cancel response');assert.deepEqual(await board(),initial);report.cancelUnchanged=true;
  await open();
  await host(`document.querySelector('input[name=reroll-import-character][value="${complete.nameCode}"]').click()`);
  win.showInactive();win.focus();await delay(180);fs.writeFileSync(path.join(cacheRoot,'reroll-import-picker.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  const before=await host("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([key])=>key.startsWith('nikke-photos/profiles/'))))");
  const targetsBefore=await js("[...document.querySelectorAll('.equipment-target-rows')].map(c=>[...c.querySelectorAll('select,input')].map(e=>e.type==='checkbox'?e.checked:e.value))");
  const rule=await js("document.querySelector('#calculation-rule').value"),conditions=await js("[...document.querySelectorAll('.global-condition-row')].map(c=>[...c.querySelectorAll('select,input')].map(e=>e.value))");
  await host("document.querySelector('#panel-equipment-reroll iframe').contentWindow.postMessage({type:'nikke-reroll:import-result',requestId:'wrong-nonce',payload:{version:1,equipments:[]}},'nikke://reroll')");await delay(50);assert.deepEqual(await board(),initial);report.wrongNonceIgnored=true;
  await host("document.querySelector('.reroll-import-dialog [type=submit]').click()");await until(()=>js("document.querySelector('#import-character-status').textContent.includes('已导入')"),'import result');
  const actual=await board();assert.deepEqual(actual[0],[{stat:'攻击力增加',tier:6,locked:false},{stat:'空词条',tier:0,locked:false},{stat:'暴击率增加',tier:1,locked:false}]);assert.equal(actual[1][0].tier,12);assert.equal(actual[2][0].stat,'最大装弹数增加');assert.equal(actual[3][0].stat,'蓄力速度增加');report.fourSlotsCorrect=true;
  assert.deepEqual(await js("[...document.querySelectorAll('.equipment-target-rows')].map(c=>[...c.querySelectorAll('select,input')].map(e=>e.type==='checkbox'?e.checked:e.value))"),targetsBefore);assert.equal(await js("document.querySelector('#calculation-rule').value"),rule);assert.deepEqual(await js("[...document.querySelectorAll('.global-condition-row')].map(c=>[...c.querySelectorAll('select,input')].map(e=>e.value))"),conditions);report.targetsRuleConditionsPreserved=true;
  assert.equal(await host("JSON.stringify(Object.fromEntries(Object.entries({...localStorage}).filter(([key])=>key.startsWith('nikke-photos/profiles/'))))"),before);report.profileUnchanged=true;
  assert.match(await js("document.querySelector('#result').textContent"),/重新计算/);
  const persisted=await js("JSON.parse(localStorage.getItem('nikke-tools:workshop:draft:v1')).four.map(e=>e.initialInput)");assert.equal(persisted[0][0].tier,6);report.draftSaved=true;
  // Profile switch while the picker is open must not import the old account's board.
  await open();await host(`document.querySelector('input[name=reroll-import-character][value="${complete.nameCode}"]').click()`);
  const rawIndex=await host("localStorage.getItem('nikke-photos/profiles/v1/index')");
  await host("(()=>{const k='nikke-photos/profiles/v1/index',v=JSON.parse(localStorage.getItem(k));v.currentId='empty-profile';localStorage.setItem(k,JSON.stringify(v))})()");
  await host("document.querySelector('.reroll-import-dialog [type=submit]').click()");await until(()=>host("document.querySelector('.reroll-import-status').textContent.includes('当前存档已变化')"),'scope change');assert.equal(await host("document.querySelectorAll('.reroll-import-option').length"),0);assert.equal(await host("document.querySelector('.reroll-import-dialog [type=submit]').disabled"),true);report.emptyAndProfileChange=true;
  await host("document.querySelector('.reroll-import-dialog .dlg-x').click()");await delay(30);await host(`localStorage.setItem('nikke-photos/profiles/v1/index',${JSON.stringify(rawIndex)})`);
  // A zero-cost already-achieved global condition still goes through the original Worker.
  await js("[...document.querySelectorAll('.global-condition-row')].slice(1).forEach(row=>row.querySelector('.global-remove-condition').click());(()=>{const row=document.querySelector('.global-condition-row'),stat=row.querySelector('.global-stat-select');stat.value='攻击力增加';stat.dispatchEvent(new Event('change',{bubbles:true}));row.querySelector('.global-min-count').value='1';row.querySelector('.global-min-total').value='4.77';})()");
  await js("document.querySelector('#calculate').click()");await until(()=>js("document.querySelector('#app').getAttribute('aria-busy')==='false' && !document.querySelector('#result').textContent.includes('正在计算')"),'calculation');
  assert.equal(await js("document.querySelector('#message').textContent"),'');report.calculation=await js("document.querySelector('#result').textContent.slice(0,1000)");assert.match(report.calculation,/0/);
  report.simulator=await require('./check-simulator-import.cjs')({window:win,frame,cacheRoot,complete,invalid});
  return report;
};


