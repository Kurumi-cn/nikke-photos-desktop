const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({frame,web,parent,cacheRoot,choose,button,radio,exec})=>{
 const js=s=>frame.executeJavaScript(s),report={};
 assert.equal(await js("document.querySelector('.simulator-header p').textContent"),'自由尝试洗练与锁定策略，不修改角色档案。');report.description=true;
 await radio('custom');
 await exec("document.querySelectorAll('.custom-panel .gear-grid .slot-row').forEach((e,i)=>e.dataset.appearanceRow=i)");
 for(const [i,effect,tier] of [[0,'攻击力','阶数15（14.63%）'],[1,'防御力','阶数12（12.52%）'],[2,'暴击率','阶数11（5.71%）']]){
  await choose(`[data-appearance-row="${i}"]`,0,effect);await choose(`[data-appearance-row="${i}"]`,1,tier);
 }
 await choose('.custom-panel .slot-list .slot-row',0,'蓄力速度');await choose('.custom-panel .slot-list .slot-row',1,'阶数13（5.51%）');
 const targetFits=()=>js("[...document.querySelectorAll('.custom-target-tier .el-select__selected-item')].every(e=>e.scrollWidth<=e.clientWidth+1)");
 assert.equal(await targetFits(),true);report.targetFullyVisible=true;
 await exec("document.querySelector('.custom-target-tier').scrollIntoView({block:'center'})");await delay(150);fs.writeFileSync(path.join(cacheRoot,'simulator-target-tier.png'),(await web.capturePage()).toPNG());
 await button('开始模拟');await delay(300);
 assert.equal(await js("document.querySelectorAll('.gear-card .game-affix').length"),0);assert.doesNotMatch(await js("getComputedStyle(document.querySelector('.slot-affix')).fontFamily"),/NIKKE/);report.externalSystemFont=true;
 await exec("document.querySelector('.gear-grid').scrollIntoView({block:'center'})");await delay(150);fs.writeFileSync(path.join(cacheRoot,'simulator-game-affixes-dark.png'),(await web.capturePage()).toPNG());
 await exec("Math.random=()=>.999;[...document.querySelectorAll('.gear-card button')].find(b=>b.textContent.includes('变更数值')).click()");await delay(150);
 const fonts=await js("(async()=>{const cn=await document.fonts.load('700 14px \"NIKKE Text\"'),num=await document.fonts.load('700 14px \"NIKKE Digit\"');return {cn:cn.length,num:num.length,name:getComputedStyle(document.querySelector('.game-affix-name')).fontFamily,value:getComputedStyle(document.querySelector('.game-affix-value')).fontFamily}})()");
 assert.ok(fonts.cn>0&&fonts.num>0);assert.match(fonts.name,/NIKKE Text/);assert.match(fonts.value,/NIKKE Digit/);report.gameFontsLoaded=true;
 const colors=await js("(()=>{const b=document.querySelector('.game-affix-black'),w=document.querySelector('.game-affix-blue');return {black:getComputedStyle(b).backgroundColor,blackText:getComputedStyle(b).color,white:getComputedStyle(w).backgroundColor,blue:getComputedStyle(w.querySelector('.game-affix-value')).color}})()");
 assert.deepEqual(colors,{black:'rgb(36, 36, 36)',blackText:'rgb(8, 172, 230)',white:'rgb(255, 255, 255)',blue:'rgb(0, 157, 224)'});report.thresholdColors=true;
 assert.equal(await js("document.querySelectorAll('.el-dialog .game-affix').length"),6);assert.ok(await js("!!document.querySelector('.el-dialog .game-affix-black') && !!document.querySelector('.el-dialog .game-affix-blue')"));report.washDialogUsesSameFonts=true;
 const separation=await js("(()=>{const e=document.querySelector('.game-affix:not(.game-affix-empty)'),name=e.querySelector('.game-affix-name').getBoundingClientRect(),value=e.querySelector('.game-affix-value').getBoundingClientRect();return {gap:value.left-name.right,dashed:[...document.querySelectorAll('.wash-block-item')].filter(e=>getComputedStyle(e).borderBottomStyle==='dashed').length}})()");
 assert.ok(separation.gap>=12);assert.equal(separation.dashed,4);report.washSpacingAndSeparators=true;
 fs.writeFileSync(path.join(cacheRoot,'simulator-game-wash-dark.png'),(await web.capturePage()).toPNG());
 await exec("document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark')");await delay(100);fs.writeFileSync(path.join(cacheRoot,'simulator-game-wash-light.png'),(await web.capturePage()).toPNG());
 assert.equal(await js("document.querySelector('.el-dialog__footer').getBoundingClientRect().bottom<=innerHeight+1"),true);
 await parent.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').style.width='390px'");await delay(120);
 assert.equal(await js("document.querySelector('.el-dialog__footer').getBoundingClientRect().bottom<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth"),true);report.washButtonsStayVisible=true;
 fs.writeFileSync(path.join(cacheRoot,'simulator-game-wash-narrow.png'),(await web.capturePage()).toPNG());
 await parent.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').style.width='100%'");await delay(60);
 await button('保留原词条');await button('结束本局');
 await radio('character');await choose('.custom-panel .slot-list .slot-row',0,'最大装弹数');
 await parent.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').style.width='390px'");await delay(100);
 assert.equal(await targetFits(),true);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);report.narrowNoClipping=true;
 await exec("document.querySelector('.custom-target-tier').scrollIntoView({block:'center'})");await delay(100);fs.writeFileSync(path.join(cacheRoot,'simulator-target-narrow.png'),(await web.capturePage()).toPNG());
 await parent.executeJavaScript("document.querySelector('#panel-equipment-simulator iframe').style.width='100%'");
 return report;
};


