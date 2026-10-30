const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label){for(let i=0;i<200;i++){const value=await read();if(value)return value;await delay(100);}throw Error('Timed out: '+label);}

module.exports=async function checkStrategy(window,cacheRoot,options={}){
  const web=window.webContents;
  const frame=await until(async()=>web.mainFrame.frames.find(f=>f.url.startsWith('nikke://reroll/equipment-reroll/')&&f.url.includes('theme=light')),'light strategy frame');
  await until(()=>frame.executeJavaScript("!!document.querySelector('#resource-strategy')"),'strategy UI');
  const hostBefore=await web.executeJavaScript('JSON.stringify({...localStorage})');
  const red=web.mainFrame.frames.find(f=>f.url.startsWith('nikke://tools/core-dust/'));
  const redBefore=red?await red.executeJavaScript('JSON.stringify({...localStorage})'):null;
  const line=(stat='空词条',tier=0,flagged=false,forceKeep=false)=>({stat,tier,flagged,forceKeep});
  const original=[line('防御力增加',1,true),line('攻击力增加',1),line()];
  const target=[line('攻击力增加',1,true),line('优越代码伤害增加',1,true)];
  async function select(selector,value){
    await frame.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(20);
  }
  async function fill(selector,values){
    await frame.executeJavaScript(`(()=>{const values=${JSON.stringify(values)};Array.from(document.querySelectorAll(${JSON.stringify(selector+' .form-row')})).forEach((row,i)=>{
      const item=values[i]||{stat:'空词条',tier:0};const stat=row.querySelector('.stat-select');stat.value=item.stat;stat.dispatchEvent(new Event('change',{bubbles:true}));
      const tier=row.querySelector('.tier-select');tier.value=String(item.tier);tier.dispatchEvent(new Event('change',{bubbles:true}));
      const flag=row.querySelector('.flag-input');flag.checked=!!item.flagged;flag.dispatchEvent(new Event('change',{bubbles:true}));
      const force=row.querySelector('.force-retain-toggle');if(force&&force.getAttribute('aria-pressed')!==String(!!item.forceKeep))force.click();
    });})()`);await delay(20);
  }
  async function click(selector){await frame.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);}
  async function settled(){await until(()=>frame.executeJavaScript("document.querySelector('#app').getAttribute('aria-busy')==='false'"),'strategy completion');}
  async function readBoard(){return frame.executeJavaScript("Array.from(document.querySelectorAll('#initial-rows .form-row'),row=>({stat:row.querySelector('.stat-select').value,tier:Number(row.querySelector('.tier-select').value),flagged:row.querySelector('.flag-input').checked,forceKeep:row.querySelector('.force-retain-toggle').getAttribute('aria-pressed')==='true'}))");}

  await select('#collection-select','single-equipment');
  await select('#calculation-rule','cn-legacy');
  await fill('#initial-rows',original);await fill('#target-rows',target);
  await select('#resource-strategy','zbx-keys');await select('#key-threshold','0.1');
  await click('#calculate');await settled();
  const keyText=await frame.executeJavaScript("document.querySelector('#resource-result').innerText");
  assert.match(keyText,/zbx 同模型全石头/);assert.match(keyText,/秘钥锁定 2 号位/);assert.match(keyText,/免费解除 1 号位/);
  assert.match(keyText,/不同于 Workshop 旧规则直接覆盖/);

  await click('#compare-capture');
  const after=[line('攻击力增加',1),line('优越代码伤害增加',1),line()];
  await fill('#compare-after-rows',after);await click('#compare-run');await settled();
  assert.equal(await frame.executeJavaScript("document.querySelector('#compare-apply').disabled"),false);
  const keyComparison=await frame.executeJavaScript("document.querySelector('#compare-output').innerText");
  assert.match(keyComparison,/减少/);assert.match(keyComparison,/秘钥/);assert.match(keyComparison,/不含已经花掉/);
  assert.deepEqual(await readBoard(),original);
  // A different threshold invalidates the result rather than reusing a stale cost.
  await select('#key-threshold','1');
  assert.equal(await frame.executeJavaScript("document.querySelector('#compare-apply').disabled"),true);
  assert.match(await frame.executeJavaScript("document.querySelector('#compare-output').textContent"),/失效/);
  await select('#key-threshold','0.1');await click('#compare-run');await settled();
  await click('#compare-apply');assert.deepEqual(await readBoard(),after);
  await click('#compare-restore');assert.deepEqual(await readBoard(),original);

  // p=1 explicitly returns the same-model stone policy with zero keys.
  await select('#key-threshold','1');await click('#calculate');await settled();
  const pOne=await frame.executeJavaScript("document.querySelector('#resource-result').innerText");
  assert.match(pOne,/p=1/);assert.ok(!pOne.includes('本次使用秘钥锁定'));

  // Native Workshop forced-retention comparison remains available.
  await select('#resource-strategy','workshop-stone');
  assert.match(await frame.executeJavaScript("document.querySelector('#result').textContent"),/请重新计算/);
  const forced=[line('攻击力增加',5,true),line('防御力增加',10,false,true),line()];
  await fill('#initial-rows',forced);await fill('#target-rows',[line('攻击力增加',10,true)]);
  await click('#compare-capture');
  const forcedAfter=[line('攻击力增加',10,true),line('防御力增加',10,false,true),line()];
  await fill('#compare-after-rows',forcedAfter);await click('#compare-run');await settled();
  assert.equal(await frame.executeJavaScript("document.querySelector('#compare-apply').disabled"),false);
  assert.match(await frame.executeJavaScript("document.querySelector('#compare-output').innerText"),/Workshop 全石头/);
  await click('#compare-apply');assert.deepEqual(await readBoard(),forcedAfter);
  await click('#compare-restore');assert.deepEqual(await readBoard(),forced);
  // Unsupported constraints must block zbx; no stale cost or apply button survives.
  await select('#resource-strategy','zbx-keys');await select('#key-threshold','0.1');
  await click('#calculate');await settled();
  assert.match(await frame.executeJavaScript("document.querySelector('#message').textContent"),/强制保留/);
  assert.equal(await frame.executeJavaScript("document.querySelector('#resource-result').hidden"),true);
  assert.equal(await frame.executeJavaScript("document.querySelector('#compare-apply').disabled"),true);

  const fourTargets=['攻击力增加','优越代码伤害增加','暴击率增加','蓄力速度增加'].map(stat=>line(stat,1));
  await fill('#initial-rows',[line('攻击力增加',1),line('优越代码伤害增加',1),line('暴击率增加',1)]);await fill('#target-rows',fourTargets);
  await click('#calculate');await settled();assert.match(await frame.executeJavaScript("document.querySelector('#message').textContent"),/4～5/);
  await select('#resource-strategy','workshop-stone');await click('#calculate');await settled();
  assert.match(await frame.executeJavaScript("document.querySelector('#result').textContent"),/满足全部目标/);

  // Failed/invalid/cancelled work produces a readable error and cannot be applied.
  await fill('#initial-rows',original);await fill('#target-rows',target);await select('#resource-strategy','zbx-keys');
  await select('#key-threshold','2');await click('#calculate');await settled();
  assert.match(await frame.executeJavaScript("document.querySelector('#message').textContent"),/阈值 p/);
  await select('#key-threshold','0.1');
  await frame.executeJavaScript("document.querySelector('#calculate').click();document.querySelector('#strategy-cancel').click()");await settled();
  assert.match(await frame.executeJavaScript("document.querySelector('#compare-status').textContent"),/取消/);
  assert.equal(await frame.executeJavaScript("document.querySelector('#resource-result').hidden"),true);
  await select('#calculation-rule','global-current');await click('#calculate');await settled();
  assert.match(await frame.executeJavaScript("document.querySelector('#resource-result').innerText"),/zbx global/);
  await click('#compare-capture');await fill('#compare-after-rows',after);await click('#compare-run');await settled();
  await frame.executeJavaScript("document.querySelector('#compare-panel').scrollIntoView({block:'center'})");await delay(400);
  fs.writeFileSync(path.join(cacheRoot,'strategy-compare-smoke.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());

  assert.equal(await web.executeJavaScript('JSON.stringify({...localStorage})'),hostBefore);
  if(red)assert.equal(await red.executeJavaScript('JSON.stringify({...localStorage})'),redBefore);
  await select('#collection-select','manual-four-equipment');
  assert.equal(await frame.executeJavaScript("document.querySelector('#resource-strategy').disabled"),false);
  assert.equal(await frame.executeJavaScript("document.querySelector('#resource-strategy').value"),'workshop-stone');
  assert.equal(await frame.executeJavaScript("document.querySelector('#compare-panel').hidden"),true);
  const enhancements=options.enhancements ? await require('./check-reroll-enhancements.cjs')({window,frame,cacheRoot,select,fill,click,settled}) : {separateCheck:'npm run strategy:ui-check'};
  assert.equal(await web.executeJavaScript('JSON.stringify({...localStorage})'),hostBefore);
  return {keyAction:true,pOneFallback:true,sameSettingsComparison:true,staleResultRejected:true,applyRestore:true,forcedWorkshop:true,unsupportedKeyConstraintsRejected:true,invalidP:true,cancel:true,globalRule:true,fourEquipmentGuard:true,hostAndRedStorageUnchanged:true,enhancements};
};
