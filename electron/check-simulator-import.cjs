const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,frame:outer,cacheRoot,complete,invalid})=>{
 const web=win.webContents,host=s=>web.executeJavaScript(s),parent=s=>web.executeJavaScript(s),report={};
 const until=async(fn,label)=>{for(let i=0;i<180;i++){if(await fn())return;await delay(60)}throw Error('simulator import timeout: '+label)};
 await parent("document.querySelector('#tab-equipment-simulator').click()");let sim;
 await until(async()=>{sim=web.mainFrame.frames.find(f=>f.url.includes('/simulator/index.html'));return sim&&await sim.executeJavaScript("!!document.querySelector('.sim-controls')")},'ready');
 const js=s=>sim.executeJavaScript(s),radio=async value=>{await js(`document.querySelector('.sim-controls input[value="${value}"]').click()`);await delay(60)};
 const profileBefore=await host('JSON.stringify({...localStorage})');
 const calcBefore=await outer.executeJavaScript('JSON.stringify({...localStorage})');
 assert.deepEqual(await js("[...document.querySelector('#simulator-rule').options].map(o=>o.textContent)"),['国服版 · 旧规则','国际服版 · 新规则']);
 assert.equal(await js("!!document.querySelector('footer')"),false);report.ruleLabelsAndRemovedFooter=true;
 assert.equal(await js("document.querySelector('.sim-controls input[value=single]').checked && document.querySelector('.sim-controls input[value=custom]').checked"),true);report.defaultSingleCustom=true;
 await radio('random');assert.equal(await js("!!document.querySelector('#simulator-select-equipment')"),false);
 await radio('custom');assert.equal(await js("document.querySelector('#simulator-select-equipment').textContent.trim()"),'选择角色装备');
 const board=()=>js("[...document.querySelectorAll('.custom-panel .gear-grid .slot-row')].map(r=>[...r.querySelectorAll('.el-select__selected-item')].map(e=>e.textContent.trim()))");
 const open=async()=>{await js("document.querySelector('#simulator-select-equipment').click()");await until(()=>host("!!document.querySelector('.reroll-import-dialog[open]')"),'dialog')};
 const pick=()=>host(`document.querySelector('input[name=reroll-import-character][value="${complete.nameCode}"]').click()`);
 const ready=()=>until(()=>js("!document.querySelector('#simulator-select-equipment').classList.contains('is-loading')"),'import reply');
 const initial=await board();await open();assert.equal(await host("document.querySelectorAll('.reroll-import-option').length"),2);
 await host(`document.querySelector('input[name=reroll-import-character][value="${invalid.nameCode}"]').click()`);assert.equal(await host("document.querySelector('.reroll-import-dialog [type=submit]').disabled"),true);
 await host("document.querySelector('.reroll-import-dialog .dlg-x').click()");await ready();assert.deepEqual(await board(),initial);report.cancelAndBadData=true;
 await open();await pick();assert.equal(await host("document.querySelector('.reroll-import-dialog [type=submit]').disabled"),true);
 await host("document.querySelector('input[name=reroll-import-equipment][value=\"0\"]').click()");
 await until(()=>host("document.querySelectorAll('.reroll-import-equipment-art img').length===4 && [...document.querySelectorAll('.reroll-import-equipment-art img')].every(i=>i.complete&&i.naturalWidth>0)"),'equipment icons');
 const preview=await host("[...document.querySelectorAll('.reroll-import-affixes tbody tr')].map(r=>[...r.cells].map(c=>c.textContent))");
 assert.deepEqual(preview[0],['1. 攻击力增加','8.29%','第6档']);assert.deepEqual(preview[1],['2. 空词条','—','—']);assert.deepEqual(preview[2],['3. 暴击率增加','2.30%','第1档']);assert.equal(preview[3][1],'24.96%');assert.equal(preview[9][1],'3.75%');
 const family={Attacker:'vmetal',Defender:'99',Supporter:'code'}[complete.class];
 const images=await host("[...document.querySelectorAll('.reroll-import-equipment-art img')].map(i=>i.getAttribute('src'))");
 for(const [i,slot] of ['head','body','arms','legs'].entries())assert.ok(images[i].endsWith(`/${family}-${slot}.png`));
 report.previewValuesAndMatchingIcons=true;
 const frameStyle=await host("(()=>{const e=document.querySelector('.reroll-import-equipment-art'),s=getComputedStyle(e),p=getComputedStyle(e,'::before');return {border:s.borderTopColor,shadow:s.boxShadow,inner:p.borderTopColor,blocks:p.pointerEvents}})()");
 assert.equal(frameStyle.border,'rgb(233, 129, 157)');assert.ok(frameStyle.shadow.includes('255, 68, 126'));assert.equal(frameStyle.inner,'rgba(255, 181, 201, 0.46)');assert.equal(frameStyle.blocks,'none');report.overloadFrame=true;
 await delay(120);fs.writeFileSync(path.join(cacheRoot,'simulator-equipment-picker.png'),(await web.capturePage()).toPNG());
 win.setMinimumSize(360,600);win.setSize(420,840);await delay(180);
 assert.equal(await host("document.querySelector('.reroll-import-preview').scrollWidth>document.querySelector('.reroll-import-preview').clientWidth"),false);
 fs.writeFileSync(path.join(cacheRoot,'simulator-equipment-picker-narrow.png'),(await web.capturePage()).toPNG());
 win.setSize(1440,960);win.setMinimumSize(1000,700);await delay(100);report.previewNarrowNoOverflow=true;
 await host("document.querySelector('.reroll-import-equipment-art img').dispatchEvent(new Event('error'))");await delay(60);assert.equal(await host("document.querySelector('.reroll-import-equipment-art').textContent"),'暂无图标');report.missingIconFallback=true;
 await host("document.querySelector('#panel-equipment-simulator iframe').contentWindow.postMessage({type:'nikke-simulator:import-result',requestId:'wrong',payload:{}},'nikke://reroll')");await delay(60);assert.deepEqual(await board(),initial);report.wrongNonceIgnored=true;
 const targetBefore=await js("document.querySelector('.custom-panel .slot-list').innerText");
 await host("document.querySelector('.reroll-import-dialog [type=submit]').click()");await ready();
 const single=await board();assert.equal(single.length,3);assert.match(single[0].join(' '),/攻击力.*阶数6/);assert.match(single[2].join(' '),/暴击率.*阶数1/);
 assert.equal(await js("document.querySelectorAll('.custom-panel .gear-grid input[type=checkbox]:checked').length"),0);
 assert.equal(await js("document.querySelector('.custom-panel .slot-list').innerText"),targetBefore);report.singleSelectedGearAndTargets=true;
 // Start and wash the imported equipment through actual controls.
 async function choose(selector,index,label){
  const id=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}).querySelectorAll('.el-select')[${index}];e.querySelector('.el-select__wrapper').click();return e.querySelector('[aria-controls]').getAttribute('aria-controls')})()`);await delay(100);
  await js(`(()=>{const e=[...document.getElementById(${JSON.stringify(id)}).querySelectorAll('.el-select-dropdown__item')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('option missing');e.click();document.querySelector('header').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))})()`);await delay(100);
 }
 await choose('.custom-panel .slot-list .slot-row',0,'防御力');await choose('.custom-panel .slot-list .slot-row',1,'阶数1（4.77%）');
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='开始模拟').click()");
 await until(()=>js("!!document.querySelector('.sim-stats')"),'started');
 assert.match(await js("document.querySelector('.gear-grid').innerText"),/攻击力\s*8\.29%/);
 await js("[...document.querySelectorAll('.gear-card button')].find(b=>b.textContent.includes('变更效果')).click()");
 await until(()=>js("!!document.querySelector('.el-dialog')?.getClientRects().length"),'wash');
 await js("[...document.querySelectorAll('.el-dialog button')].find(b=>b.textContent.trim()==='保留原词条').click()");
 assert.equal(await js("document.querySelector('.stat-num').textContent"),'1');
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='结束本局').click()");report.importedGearCanSimulate=true;
 await radio('character');assert.equal(await js("document.querySelector('#simulator-select-equipment').textContent.trim()"),'选择角色');
 await open();await pick();assert.equal(await host("document.querySelectorAll('input[name=reroll-import-equipment]').length"),0);
 await host("document.querySelector('.reroll-import-dialog [type=submit]').click()");await ready();
 const four=await board();assert.equal(four.length,12);assert.match(four[0].join(' '),/攻击力.*阶数6/);assert.match(four[3].join(' '),/优越代码伤害.*阶数12/);assert.match(four[6].join(' '),/最大装弹数.*阶数1/);assert.match(four[9].join(' '),/蓄力速度.*阶数7/);report.fourGearSnapshot=true;
 await js("document.querySelector('#simulator-select-equipment').scrollIntoView({block:'center'})");await delay(100);fs.writeFileSync(path.join(cacheRoot,'simulator-imported-four.png'),(await web.capturePage()).toPNG());
 await parent("document.querySelector('#panel-equipment-simulator iframe').style.width='390px'");await delay(100);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);report.longRuleNoOverflow=true;
 await parent("document.querySelector('#panel-equipment-simulator iframe').style.width='100%'");
 await open();await pick();await js("const r=document.querySelector('#simulator-rule');r.value='global';r.dispatchEvent(new Event('change',{bubbles:true}))");
 await until(()=>host("!document.querySelector('.reroll-import-dialog')"),'rule cancels picker');report.ruleRemountCancelsImport=true;
 assert.equal(await host('JSON.stringify({...localStorage})'),profileBefore);assert.equal(await outer.executeJavaScript('JSON.stringify({...localStorage})'),calcBefore);report.externalDataUnchanged=true;
 report.noStorageBridge=await js("typeof window.nikkeDesktop==='undefined'");assert.equal(report.noStorageBridge,true);
 await parent("document.querySelector('#tab-equipment-reroll').click()");return report;
};



