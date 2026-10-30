const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,frame,cacheRoot,select,fill,click,settled})=>{
 const web=win.webContents,js=s=>frame.executeJavaScript(s),report={};
 // Real focus/hover checks need a normal renderer window, not an offscreen one.
 win.show();win.focus();web.focus();await delay(150);
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').focus()");
 const line=(stat='空词条',tier=0,flagged=false)=>({stat,tier,flagged,forceKeep:false});
 assert.deepEqual(await js("[...document.querySelector('#resource-strategy').options].map(o=>o.textContent)"),['不使用自订秘钥','允许使用自订秘钥']);
 assert.equal(await js("!!document.querySelector('.resource-controls details')"),false);report.labelsAndRemovedDisclosure=true;
 await select('#calculation-rule','cn-legacy');assert.equal(await js("document.querySelector('#calculation-rule-help').textContent"),'允许同一词条栏位再次出现完全相同的效果和数值');
 await select('#calculation-rule','global-current');assert.equal(await js("document.querySelector('#calculation-rule-help').textContent"),'同一词条栏位再次抽到完全相同的效果和数值时，会重新抽取；空词条仍可能重复');report.ruleDescriptions=true;
 await select('#calculation-rule','cn-legacy');
 const visible=()=>js("getComputedStyle(document.querySelector('#key-threshold-help')).display!=='none'");
 await js("document.querySelector('.help-icon').focus()");assert.equal(await visible(),true,JSON.stringify(await js("({active:document.activeElement?.outerHTML,button:document.querySelector('.help-icon').outerHTML,help:document.querySelector('#key-threshold-help').outerHTML,match:document.querySelector('.resource-controls').matches(':has(.help-icon:focus)'),style:getComputedStyle(document.querySelector('#key-threshold-help')).display})")));
 assert.equal(await js("document.querySelector('.help-icon').getAttribute('aria-describedby')"),'key-threshold-help');
 await js("document.querySelector('.help-icon').blur()");assert.equal(await visible(),false);report.focusHelp=true;
 // Real mouse movement in the renderer, using the nested frame's viewport coordinates.
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').scrollIntoView({block:'start'})");
 await js("document.querySelector('.help-icon').scrollIntoView({block:'center'})");await delay(100);
 const outer=await web.executeJavaScript("(()=>{const r=document.querySelector('#panel-equipment-reroll iframe').getBoundingClientRect();return {x:r.x,y:r.y}})()");
 const inner=await js("(()=>{const r=document.querySelector('.help-icon').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 web.debugger.attach('1.3');
 await web.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:outer.x+inner.x,y:outer.y+inner.y});await delay(150);
 if(!await visible()) {
  fs.writeFileSync(path.join(cacheRoot,'reroll-hover-diagnostic.png'),(await web.capturePage()).toPNG());
  throw Error(JSON.stringify({outer,inner,host:await web.executeJavaScript(`({w:innerWidth,h:innerHeight,hit:document.elementFromPoint(${outer.x+inner.x},${outer.y+inner.y})?.outerHTML.slice(0,200)})`),child:await js(`({w:innerWidth,h:innerHeight,hit:document.elementFromPoint(${inner.x},${inner.y})?.outerHTML.slice(0,200),hover:document.querySelector('.help-icon').matches(':hover')})`)}));
 }
 report.hoverHelp=true;
 await web.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});web.debugger.detach();await delay(80);
 await select('#resource-strategy','zbx-keys');
 assert.equal(await js("document.querySelector('#key-character-targets').hidden"),false);
 assert.equal(await js("document.querySelector('#global-target-mode').hidden"),true);
 for(let i=0;i<4;i++)await fill(`[data-equipment-index="${i}"] .equipment-current-rows`,[line('攻击力增加',1),line('优越代码伤害增加',1),line()]);
 await js("for(const e of document.querySelectorAll('.equipment-skip-input'))e.checked=false;const r=document.querySelector('.character-target-row');r.querySelector('select').value='攻击力增加';r.querySelector('input').value='5';r.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}))");
 await click('#calculate');await settled();
 assert.equal(await js("document.querySelector('#message').textContent"),'');
 const text=await js("document.querySelector('#resource-result').innerText");assert.match(text,/近似/);assert.match(text,/不是联合 MDP/);assert.match(text,/装备 4/);assert.match(text,/总档位≥5/);report.characterWorker=true;
 // Layout QA across both themes, wide and narrow; help is in normal document flow.
 for(const theme of ['light','dark']) {
  await js(`document.documentElement.dataset.theme='${theme}';document.querySelector('.help-icon').blur();document.querySelector('.help-icon').focus()`);
  await js("document.querySelector('.resource-controls').scrollIntoView({block:'center'})");await delay(80);
  const layout=await js("(()=>{const t=document.querySelector('#key-threshold-help').getBoundingClientRect(),s=document.querySelector('#resource-strategy').getBoundingClientRect(),b=document.querySelector('#calculate').getBoundingClientRect();const overlaps=r=>!(t.bottom<=r.top||t.top>=r.bottom||t.right<=r.left||t.left>=r.right);return {overflow:document.documentElement.scrollWidth>innerWidth,covered:overlaps(s)||overlaps(b),visible:getComputedStyle(document.querySelector('#key-threshold-help')).display!=='none'}})()");
  assert.deepEqual(layout,{overflow:false,covered:false,visible:true});
  fs.writeFileSync(path.join(cacheRoot,`reroll-enhancement-${theme}.png`),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.width='390px'");await delay(100);
 await js("document.querySelector('.help-icon').focus();document.querySelector('.help-icon').scrollIntoView({block:'center'})");await delay(80);
 assert.equal(await js("document.documentElement.scrollWidth>innerWidth"),false);assert.equal(await visible(),true);
 assert.equal(await js("(()=>{const t=document.querySelector('#key-threshold-help').getBoundingClientRect(),s=document.querySelector('#resource-strategy').getBoundingClientRect(),b=document.querySelector('#calculate').getBoundingClientRect();const overlap=r=>!(t.bottom<=r.top||t.top>=r.bottom||t.right<=r.left||t.left>=r.right);return overlap(s)||overlap(b)})()"),false);
 fs.writeFileSync(path.join(cacheRoot,'reroll-enhancement-narrow.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.width='100%'");await js("document.documentElement.dataset.theme='light';document.querySelector('.help-icon').blur()");report.themesNarrowNoOverlap=true;
 await js("document.querySelector('#key-character-targets').scrollIntoView({block:'center'})");await delay(80);
 fs.writeFileSync(path.join(cacheRoot,'reroll-character-targets.png'),(await web.capturePage()).toPNG());
 await select('.character-target-total','6');assert.equal(await js("document.querySelector('#resource-result').hidden"),true);report.characterInvalidation=true;
 await select('#calculation-rule','global-current');await click('#calculate');await settled();assert.match(await js("document.querySelector('#message').textContent"),/档位平均/);assert.equal(await js("document.querySelector('#resource-result').hidden"),true);report.globalGuard=true;
 await select('#calculation-rule','cn-legacy');await js("document.querySelector('.equipment-skip-input').checked=true");await click('#calculate');await settled();assert.match(await js("document.querySelector('#message').textContent"),/不跑/);await js("document.querySelector('.equipment-skip-input').checked=false");report.skipGuard=true;
 await js("document.querySelector('#calculate').click();document.querySelector('#strategy-cancel').click()");await settled();assert.match(await js("document.querySelector('#message').textContent"),/取消/);report.characterCancel=true;
 await select('#resource-strategy','workshop-stone');assert.equal(await js("document.querySelector('#global-target-mode').hidden"),false);assert.equal(await js("document.querySelector('#key-character-targets').hidden"),true);report.workshopRestored=true;
 win.hide();return report;
};
