const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, description, attempts=200) {
  for(let i=0;i<attempts;i++){ const value=await read();if(value)return value;await delay(100); }
  throw new Error('Timed out: '+description);
}
module.exports = async function checkReroll(window, cacheRoot) {
  const web=window.webContents;
  const hostBefore=await web.executeJavaScript('JSON.stringify({...localStorage})');
  const redFrame=web.mainFrame.frames.find(f=>f.url.startsWith('nikke://tools/core-dust/'));
  const redBefore=await redFrame.executeJavaScript("({storage:localStorage.getItem('nikke-tools:core-dust:v1'),dust:document.querySelector('#chipMulValue').textContent})");
  await web.executeJavaScript("document.querySelector('#tab-equipment-reroll').click()");
  const frame=await until(async()=>web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/')),'reroll iframe');
  await until(()=>frame.executeJavaScript("document.querySelectorAll('#initial-rows .form-row').length===3"),'manual editor');
  await until(()=>web.executeJavaScript("!document.querySelector('#panel-equipment-reroll .tools-status')"),'ready handshake');
  const boundary=await frame.executeJavaScript(`(()=>{let isolated=false;try{void parent.localStorage.length}catch{isolated=true}return {origin:location.origin,isolated,bridge:typeof window.nikkeDesktop,extensionStorage:!!globalThis.chrome?.storage}})()`);
  assert.deepEqual(boundary,{origin:'nikke://reroll',isolated:true,bridge:'undefined',extensionStorage:false});

  async function select(id,value){await frame.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(30);}
  // Return to the single board even if a previous smoke run left a four-equipment draft.
  await select('#collection-select','single-equipment');
  if(await frame.executeJavaScript("!!document.querySelector('#resource-strategy')"))await select('#resource-strategy','workshop-stone');
  const fixtures=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../tools/equipment-reroll/tests/fixtures/calculator-worker-baseline.json')));
  async function fill(selector,values){
    await frame.executeJavaScript(`(()=>{const values=${JSON.stringify(values)};Array.from(document.querySelectorAll(${JSON.stringify(selector+' .form-row')})).forEach((row,i)=>{
      const item=values[i]||{stat:'空词条',tier:0};const stat=row.querySelector('.stat-select');stat.value=item.stat;stat.dispatchEvent(new Event('change',{bubbles:true}));
      const tier=row.querySelector('.tier-select');tier.value=String(item.tier);tier.dispatchEvent(new Event('change',{bubbles:true}));
      const flag=row.querySelector('.flag-input');flag.checked=!!item.flagged;flag.dispatchEvent(new Event('change',{bubbles:true}));
      const force=row.querySelector('.force-retain-toggle');if(force&&force.getAttribute('aria-pressed')!==String(!!item.forceKeep))force.click();
    });})()`);
  }
  const cases=[];
  for(const fixture of [fixtures[4],fixtures[0],fixtures[3],fixtures[7]]) {
    await fill('#initial-rows',fixture.initialInput);
    await fill('#target-rows',fixture.targetInput);
    await select('#calculation-rule',fixture.calculationRule);
    await frame.executeJavaScript("document.querySelector('#calculate').click()");
    await until(()=>frame.executeJavaScript("document.querySelector('#app').getAttribute('aria-busy')==='false' && !document.querySelector('#classic-optimal-result').textContent.includes('正在计算')"),'single solver');
    const result=await frame.executeJavaScript("({message:document.querySelector('#message').textContent,result:document.querySelector('#result').textContent,details:document.querySelector('#details').textContent,tree:document.querySelector('#classic-optimal-result').innerText})");
    assert.equal(result.message,'',fixture.name);
    assert.ok(result.details.includes(fixture.expected.value.toFixed(6)),fixture.name+': expectation');
    assert.ok(result.details.includes(fixture.expected.firstActionText),fixture.name+': action');
    assert.ok(result.tree.length>0);
    cases.push({name:fixture.name,rule:fixture.calculationRule,expected:fixture.expected.value,action:fixture.expected.firstActionText});
  }
  // Invalid targets must produce a readable error, then allow a normal calculation again.
  await fill('#target-rows',[]);
  await frame.executeJavaScript("document.querySelector('#calculate').click()");
  assert.match(await frame.executeJavaScript("document.querySelector('#message').textContent"),/至少设置/);

  await select('#collection-select','manual-four-equipment');
  await select('#calculation-mode','global');
  assert.equal(await frame.executeJavaScript("document.querySelectorAll('.character-equipment-slot').length"),4);
  await select('#calculation-rule','cn-legacy');
  // Use a small actual four-board plan, not merely the panel rendering.
  await frame.executeJavaScript(`(()=>{
    while(document.querySelectorAll('.global-condition-row').length>1){
      document.querySelector('.global-condition-row:last-child .global-remove-condition').click();
    }
    if(!document.querySelector('.global-condition-row'))document.querySelector('#add-global-condition').click();
  })()`);
  const condition=await frame.executeJavaScript("document.querySelector('.global-condition-row')?.outerHTML");
  assert.ok(condition,'condition row');
  await select('.global-condition-row .global-stat-select','攻击力增加');
  await frame.executeJavaScript(`(()=>{const row=document.querySelector('.global-condition-row');for(const [sel,value]of [['.global-min-count','4'],['.global-min-total','22']]){const input=row.querySelector(sel);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  // Restored test drafts may contain old boards. Clear all four boards explicitly.
  for(let index=0;index<4;index++){
    await fill(`[data-equipment-index="${index}"] .equipment-current-rows`,[]);
    await frame.executeJavaScript(`(()=>{const input=document.querySelector('[data-equipment-index="${index}"] .equipment-skip-input');if(input.checked)input.click();})()`);
  }
  await frame.executeJavaScript("document.querySelector('#calculate').click()");
  await until(()=>frame.executeJavaScript("document.querySelector('#app').getAttribute('aria-busy')==='false' && !document.querySelector('#result').textContent.includes('正在计算')"),'four equipment solver');
  const global=await frame.executeJavaScript("({message:document.querySelector('#message').textContent,result:document.querySelector('#result').textContent,details:document.querySelector('#details').textContent,records:localStorage.getItem('nikke-tools:workshop:results:v1'),draft:localStorage.getItem('nikke-tools:workshop:draft:v1')})");
  assert.equal(global.message,'');
  const records=JSON.parse(global.records);
  const entry=Object.values(records.entries)[0];
  assert.ok(Math.abs(entry.totalExpectedCost-22.7666176467407)<1e-7);
  assert.ok(global.result.includes('不等同于') || global.details.includes('不等同于'));
  assert.equal(entry.equipmentResults.length,4);
  assert.ok(await frame.executeJavaScript("document.querySelectorAll('.equipment-optimal-result details').length>0"),'decision tree rendered');
  await delay(500);
  fs.writeFileSync(path.join(cacheRoot,'workshop-smoke.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());

  await web.executeJavaScript("document.querySelector('#tab-core-dust').click()");
  assert.deepEqual(await redFrame.executeJavaScript("({storage:localStorage.getItem('nikke-tools:core-dust:v1'),dust:document.querySelector('#chipMulValue').textContent})"),redBefore);
  await web.executeJavaScript("document.querySelector('#tab-equipment-reroll').click()");
  assert.equal(await frame.executeJavaScript("document.querySelector('#result').textContent"),global.result);
  assert.equal(await web.executeJavaScript('JSON.stringify({...localStorage})'),hostBefore);

  // Leave the whole tools route and return: defaults to red; reroll draft is independent.
  await web.executeJavaScript("location.hash='/data'");
  await until(()=>web.executeJavaScript("!document.querySelector('.nikke-tool-frame')"),'leave tools');
  await web.executeJavaScript("location.hash='/tools'");
  await until(()=>web.executeJavaScript("document.querySelector('#tab-core-dust')?.getAttribute('aria-selected')==='true'"),'default red');
  await web.executeJavaScript("document.querySelector('#tab-equipment-reroll').click()");
  const restored=await until(async()=>web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/')),'restored reroll');
  await until(()=>restored.executeJavaScript("document.querySelectorAll('.character-equipment-slot').length===4"),'restored draft');
  assert.equal(await restored.executeJavaScript("document.querySelector('.global-condition-row .global-min-total').value"),'22');
  assert.equal(await restored.executeJavaScript("document.querySelector('#calculation-rule').value"),'cn-legacy');
  // The real editor enforces its upstream six-condition budget.
  await restored.executeJavaScript("for(let i=0;i<8;i++)document.querySelector('#add-global-condition').click()");
  assert.equal(await restored.executeJavaScript("document.querySelectorAll('.global-condition-row').length"),6);
  assert.match(await restored.executeJavaScript("document.querySelector('#message').textContent"),/最多 6/);
  // Restore one valid condition in the disposable test draft.
  await restored.executeJavaScript("while(document.querySelectorAll('.global-condition-row').length>1)document.querySelector('.global-condition-row:last-child .global-remove-condition').click()");
  await web.executeJavaScript("document.querySelector('.theme-toggle').click()");
  const dark=await until(async()=>web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/')&&f.url.includes('theme=dark')),'dark reroll');
  await until(()=>dark.executeJavaScript("document.documentElement.dataset.theme==='dark'&&document.querySelectorAll('.character-equipment-slot').length===4"),'dark draft');
  assert.equal(await dark.executeJavaScript("document.querySelector('.global-condition-row .global-min-total').value"),'22');
  await delay(500);
  fs.writeFileSync(path.join(cacheRoot,'workshop-smoke-dark.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await web.executeJavaScript("document.querySelector('.theme-toggle').click()");
  const strategy = await require('./check-strategy.cjs')(window,cacheRoot);
  const simulator = await require('./check-simulator.cjs')(window,cacheRoot);
  return {simulator,boundary,cases,global:{expected:entry.totalExpectedCost,equipments:4,finiteCandidateSearch:true},invalidInput:true,conditionLimit:true,redStateUnchanged:true,tabPreservesResult:true,draftRestored:true,theme:true,strategy};
};
