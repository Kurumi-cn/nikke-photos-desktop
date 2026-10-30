// End-to-end checks against the real bundled Vue iframe, with all HTTP(S) blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await read();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out: ' + description);
}

module.exports = async function checkTools(window, cacheRoot) {
  const web = window.webContents;
  const remoteRequests = [];
  web.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    remoteRequests.push(details.url);
    callback({ cancel: true });
  });
  const before = await web.executeJavaScript('JSON.stringify({...localStorage})');
  await web.executeJavaScript("Array.from(document.querySelectorAll('.dlg-mask button')).find(el=>el.textContent.trim()==='知道了')?.click()");
  await web.executeJavaScript("location.hash='/tools'");
  const frame = await until(async () => web.mainFrame.frames.find(f => f.url.startsWith('nikke://tools/core-dust/')), 'local tool iframe');
  await until(() => frame.executeJavaScript("!!document.querySelector('#chipMulValue') && document.querySelector('#chipMulValue').textContent !== '-'"), 'calculator output');
  await until(() => web.executeJavaScript("!document.querySelector('.tools-status')"), 'ready message');
  // Set a known visible state explicitly so repeated tests also cover persisted preferences.
  await chooseSelect(1, '显示');
  await chooseStage(0, 'Chapter 40', '40-36');
  const initial = await frame.executeJavaScript(`(() => {
    let isolated = false;
    try { void parent.localStorage.length } catch { isolated = true }
    return { origin:location.origin, isolated, bridge:typeof window.nikkeDesktop,
      level:document.querySelector('#levelDisplay').textContent,
      dust:document.querySelector('#chipMulValue').textContent,
      rows:document.querySelectorAll('tbody tr').length };
  })()`);
  assert.equal(initial.origin, 'nikke://tools');
  assert.equal(initial.isolated, true);
  assert.equal(initial.bridge, 'undefined');
  assert.ok(initial.rows > 0);
  assert.deepEqual(await web.executeJavaScript("Array.from(document.querySelectorAll('.tabs a'), a=>a.textContent)"), ['角色管理', '数据录入', '数据统计', '妮姬工具', '装备采集', '更多']);

  async function chooseSelect(index, label) {
    await frame.executeJavaScript(`document.querySelectorAll('.table-controls .el-select')[${index}].querySelector('.el-select__wrapper').click()`);
    await delay(150);
    await frame.executeJavaScript(`(() => { const item=Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.offsetParent !== null && el.textContent.trim() === ${JSON.stringify(label)}); if(!item) throw new Error('Missing select option: '+${JSON.stringify(label)}); item.click(); })()`);
    await delay(150);
  }
  await chooseSelect(0, '升序');
  const asc = await frame.executeJavaScript("Array.from(document.querySelectorAll('tbody .dust-rate'), el=>Number(el.textContent))");
  assert.ok(asc.every((v, i) => i === 0 || v >= asc[i - 1]));
  await chooseSelect(0, '降序');
  const desc = await frame.executeJavaScript("Array.from(document.querySelectorAll('tbody .dust-rate'), el=>Number(el.textContent))");
  assert.deepEqual(desc, [...asc].reverse());
  await chooseSelect(1, '隐藏');
  const hiddenRows = await frame.executeJavaScript("document.querySelectorAll('tbody tr').length");
  fs.writeFileSync(path.join(cacheRoot, 'tools-check-debug.json'), JSON.stringify({initial, asc:asc.length, desc:desc.length, hiddenRows, state:await frame.executeJavaScript("({storage:localStorage.getItem('nikke-tools:core-dust:v1'),inputs:Array.from(document.querySelectorAll('.table-controls input'),el=>el.value),text:document.querySelector('.reference-panel').innerText.slice(0,500)})")},null,2));
  assert.ok(hiddenRows < initial.rows);

  // Exercise both cascaders through their actual rendered menus.
  async function chooseStage(index, chapter, stagePrefix) {
    await frame.executeJavaScript(`document.querySelectorAll('.input-panel .el-cascader')[${index}].querySelector('.el-input__wrapper').click()`);
    await delay(150);
    await frame.executeJavaScript(`(() => { const item=Array.from(document.querySelectorAll('.el-cascader-node__label')).find(el=>el.offsetParent !== null && el.textContent.trim() === ${JSON.stringify(chapter)}); if(!item) throw new Error('Missing chapter: '+${JSON.stringify(chapter)}); item.closest('.el-cascader-node').dispatchEvent(new MouseEvent('mouseenter',{bubbles:true})); item.click(); })()`);
    await until(() => frame.executeJavaScript(`!!Array.from(document.querySelectorAll('.el-cascader-node__label')).find(el=>el.offsetParent !== null && el.textContent.trim().startsWith(${JSON.stringify(stagePrefix)}))`), 'stage '+stagePrefix);
    await frame.executeJavaScript(`Array.from(document.querySelectorAll('.el-cascader-node__label')).find(el=>el.offsetParent !== null && el.textContent.trim().startsWith(${JSON.stringify(stagePrefix)})).click()`);
    await delay(150);
  }
  await chooseStage(0, 'Chapter 10', '10-10');
  await chooseStage(1, 'Chapter 1', '1-1');
  const changed = await frame.executeJavaScript(`({level:document.querySelector('#levelDisplay').textContent,dust:document.querySelector('#chipMulValue').textContent,stored:localStorage.getItem('nikke-tools:core-dust:v1')})`);
  assert.notEqual(changed.level, initial.level);
  assert.ok(changed.stored);
  assert.equal(await web.executeJavaScript('JSON.stringify({...localStorage})'), before);
  await delay(500);
  fs.writeFileSync(path.join(cacheRoot, 'tools-smoke.png'), (await web.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());

  // Navigate away and back: tool settings persist without touching a character profile.
  await web.executeJavaScript("location.hash='/data'");
  await until(() => web.executeJavaScript("!!document.querySelector('main') && !document.querySelector('.nikke-tool-frame')"), 'data entry route');
  await web.executeJavaScript("location.hash='/tools'");
  const restoredFrame = await until(async () => web.mainFrame.frames.find(f => f.url.startsWith('nikke://tools/core-dust/')), 'restored tool');
  await until(() => restoredFrame.executeJavaScript("!!document.querySelector('#chipMulValue')"), 'restored calculator');
  assert.equal(await restoredFrame.executeJavaScript("document.querySelector('#levelDisplay').textContent"), changed.level);
  assert.equal(await restoredFrame.executeJavaScript("document.querySelector('#chipMulValue').textContent"), changed.dust);
  // The main page's theme controls also apply to the isolated child application.
  await web.executeJavaScript("document.querySelector('.theme-toggle').click()");
  const themedFrame = await until(async () => web.mainFrame.frames.find(f => f.url.includes('nikke://tools/core-dust/') && f.url.includes('theme=dark')), 'dark theme iframe');
  await until(() => themedFrame.executeJavaScript("!!document.querySelector('#chipMulValue') && document.documentElement.dataset.theme === 'dark'"), 'dark theme calculator');
  assert.equal(await themedFrame.executeJavaScript("document.querySelector('#levelDisplay').textContent"), changed.level);
  await delay(500);
  fs.writeFileSync(path.join(cacheRoot, 'tools-smoke-dark.png'), (await web.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  await web.executeJavaScript("document.querySelector('.theme-toggle').click()");
  // Wait for the red iframe to finish its theme reload before checking tool switching.
  await until(async () => {
    const current = web.mainFrame.frames.find(f => f.url.includes('nikke://tools/core-dust/') && f.url.includes('theme=light'));
    return current && await current.executeJavaScript("!!document.querySelector('#chipMulValue')");
  }, 'light red calculator');
  const workshop = await require('./check-reroll.cjs')(window, cacheRoot);
  assert.equal(remoteRequests.length, 0);
  web.session.webRequest.onBeforeRequest(null);
  return { offline: true, isolatedStorage: true, normalAndHardSelection: true, sort: true, halfToggle: true, restored: true, theme: true, initial, changed, hiddenRows, workshop };
};
