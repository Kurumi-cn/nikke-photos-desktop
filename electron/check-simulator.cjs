const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,label){for(let i=0;i<200;i++){const v=await read();if(v)return v;await delay(75)}throw Error('Simulator timeout: '+label)}
module.exports=async function checkSimulator(window,cacheRoot){
  const web=window.webContents;
  const parent=web.mainFrame,calculator=web.mainFrame.frames.find(f=>f.url.includes('/equipment-reroll/index.html'));
  const hostBefore=await web.executeJavaScript('JSON.stringify({...localStorage})');
  const calcBefore=await calculator.executeJavaScript('JSON.stringify({...localStorage})');
  assert.equal(await parent.executeJavaScript("document.querySelector('#tab-equipment-reroll').getAttribute('aria-selected')"),'true');
  await parent.executeJavaScript("document.querySelector('#tab-equipment-simulator').click()");
  let frame=await until(()=>parent.frames.find(f=>f.url.includes('/simulator/index.html')),'iframe');
  await until(()=>frame.executeJavaScript("!!document.querySelector('.sim-controls')"),'Vue mount');
  async function exec(code){const value=await frame.executeJavaScript(code);await delay(30);return value}
  async function button(text){return exec(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!b)throw Error('Missing button '+${JSON.stringify(text)});if(b.disabled)throw Error('Disabled button '+${JSON.stringify(text)});b.click()})()`)}
  const text=()=>frame.executeJavaScript('document.body.innerText');
  async function radio(value){await exec(`document.querySelector('.sim-controls input[value="${value}"]').click()`)}
  async function choose(selector,index,label){
    const id=await exec(`(()=>{const select=document.querySelector(${JSON.stringify(selector)}).querySelectorAll('.el-select')[${index}];select.querySelector('.el-select__wrapper').click();return select.querySelector('[aria-controls]').getAttribute('aria-controls')})()`);
    const find=`[...document.getElementById(${JSON.stringify(id)})?.querySelectorAll('.el-select-dropdown__item')||[]].find(e=>e.textContent.trim()===${JSON.stringify(label)})`;
    await until(()=>frame.executeJavaScript(`!!(${find})`),'option '+label);
    await exec(`(()=>{(${find}).click();const h=document.querySelector('header');for(const t of ['mousedown','mouseup','click'])h.dispatchEvent(new MouseEvent(t,{bubbles:true}));})()`);
    await delay(200);
  }
  async function stats(stones,keys){const result=await frame.executeJavaScript("[...document.querySelectorAll('.sim-stats .stat-num')].map(e=>Number(e.textContent))");assert.deepEqual(result,[stones,keys])}
  async function apply(){await button('应用新结果');await until(()=>frame.executeJavaScript("!document.querySelector('.el-dialog')||document.querySelector('.el-dialog').getClientRects().length===0"),'dialog closed')}
  // Complete a real RANDOM run with a deterministic RNG stream, not an auto-play solver.
  assert.equal(await frame.executeJavaScript("document.querySelector('.sim-controls input[value=single]').checked && document.querySelector('.sim-controls input[value=custom]').checked"),true);
  await radio('random');
  await exec("Math.random=(()=>{const q=[.31,0,.9,.9,0,0,.9,0];return()=>q.length?q.shift():.99})()");
  await button('开始随机模拟');await until(()=>frame.executeJavaScript("!!document.querySelector('.gear-grid')"),'random gear');
  await until(()=>frame.executeJavaScript("!document.querySelector('.sim-controls button.is-loading')"),'initial theory');
  assert.match(await text(),/优越代码伤害 ≥ 阶数5/);
  await exec("Math.random=(()=>{const q=[0,0,.99,.99,.99];return()=>q.length?q.shift():.99})()");
  await until(()=>frame.executeJavaScript("!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('变更效果')&&!e.disabled)"),'wash');
  await exec("[...document.querySelectorAll('.gear-card button')].find(e=>e.textContent.includes('变更效果')).click()");
  await apply();await until(()=>frame.executeJavaScript("document.body.innerText.includes('已通关')"),'random win');
  await stats(1,0);assert.match(await text(),/实际消耗与初始期望对比/);assert.doesNotMatch(await text(),/期望计算失败/);
  await exec("document.querySelector('.result-panel').scrollIntoView({block:'center'})");await delay(400);
  fs.writeFileSync(path.join(cacheRoot,'reroll-simulator-completed.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await button('结束本局');assert.equal(await frame.executeJavaScript("document.querySelectorAll('.sim-stats').length"),0);
  await radio('custom');await button('开始模拟');assert.match(await text(),/请至少选择/);
  // nth-of-type includes the h4; use explicit test-only positional selectors stable across Vue rendering.
  await exec("document.querySelectorAll('.custom-panel .gear-grid .slot-row').forEach((e,i)=>e.setAttribute('data-smoke-row',i))");
  await choose('[data-smoke-row="0"]',0,'攻击力');
  await choose('[data-smoke-row="0"]',1,'阶数1（4.77%）');
  await choose('[data-smoke-row="1"]',0,'优越代码伤害');
  await choose('[data-smoke-row="1"]',1,'阶数1（9.54%）');
  await exec("document.querySelector('[data-smoke-row=\"0\"] input[type=checkbox]').click()");
  await choose('.custom-panel .slot-list .slot-row',0,'防御力');
  await choose('.custom-panel .slot-list .slot-row',1,'阶数1（4.77%）');
  await button('开始模拟');await until(()=>frame.executeJavaScript("!document.querySelector('.sim-controls button.is-loading')"),'custom theory');
  await stats(0,0);assert.match(await text(),/攻击力\s*4\.77%/);assert.match(await text(),/石头锁/);
  await exec("document.querySelectorAll('.gear-card .slot-row')[1].querySelectorAll('input[type=checkbox]')[1].click()");
  await stats(0,0);await exec("[...document.querySelectorAll('.gear-card button')].find(e=>e.textContent.includes('变更效果')).click()");
  await stats(3,30);await button('保留原词条');await delay(150);await stats(3,30);
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('.gear-card .slot-row')[1].querySelectorAll('input[type=checkbox]')[1].checked"),true);
  await exec("[...document.querySelectorAll('.gear-card button')].find(e=>e.textContent.includes('变更效果')).click()");
  await button('保留原词条并再洗');await stats(9,90);await button('保留原词条');await delay(100);
  await exec("[...document.querySelectorAll('.gear-card .slot-row')[0].querySelectorAll('button')].find(e=>e.textContent.trim()==='解锁').click()");await stats(9,90);
  await parent.executeJavaScript("document.querySelector('#tab-equipment-reroll').click();document.querySelector('#tab-equipment-simulator').click()");await stats(9,90);
  await button('查看期望');await exec("document.querySelector('.result-panel').scrollIntoView({block:'center'})");await delay(400);
  fs.writeFileSync(path.join(cacheRoot,'reroll-simulator-comparison.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await button('重新开始');await stats(0,0);assert.match(await text(),/攻击力\s*4\.77%/);
  await button('结束本局');
  // A rule switch remounts and resets only this simulation. Four-equipment custom initialization is preserved.
  await exec("const r=document.querySelector('#simulator-rule');r.value='global';r.dispatchEvent(new Event('change',{bubbles:true}))");
  await radio('character');await radio('custom');assert.equal(await frame.executeJavaScript("document.querySelectorAll('.custom-panel .gear-card').length"),4);
  // Reset to a visible single-gear reference screen for visual review.
  await radio('single');await radio('random');await exec("Math.random=(()=>{const q=[.31,0,.9,.9,0,0,.9,0];return()=>q.length?q.shift():.99})()");await button('开始随机模拟');await delay(400);
  fs.writeFileSync(path.join(cacheRoot,'reroll-simulator-smoke.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await button('结束本局');
  await parent.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').src='nikke://reroll/equipment-reroll/simulator/index.html?theme=dark'");
  frame=await until(()=>parent.frames.find(f=>f.url.includes('/simulator/index.html?theme=dark')),'dark simulator');
  await until(()=>frame.executeJavaScript("document.documentElement.dataset.theme==='dark' && !!document.querySelector('.sim-controls')"),'dark mount');
  await radio('random');
  await exec("Math.random=(()=>{const q=[.31,0,.9,.9,0,0,.9,0];return()=>q.length?q.shift():.99})()");await button('开始随机模拟');await delay(500);
  fs.writeFileSync(path.join(cacheRoot,'reroll-simulator-dark.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await button('结束本局');
  const appearance=await require('./check-simulator-appearance.cjs')({frame,web,parent,cacheRoot,choose,button,radio,exec});
  assert.equal(await web.executeJavaScript('JSON.stringify({...localStorage})'),hostBefore);
  assert.equal(await calculator.executeJavaScript('JSON.stringify({...localStorage})'),calcBefore);
  assert.equal(await frame.executeJavaScript("typeof window.nikkeDesktop"),'undefined');
  await parent.executeJavaScript("document.querySelector('#tab-equipment-reroll').click()");
  return {appearance,randomCompleted:true,customInputs:true,locksAndCosts:true,keepRepeat:true,separateResourceCounters:true,restartAndReset:true,fourGearCustom:true,ruleSwitch:true,tabStateRetained:true,hostAndCalculatorStorageUnchanged:true,noAccountBridge:true,darkTheme:true};
}


