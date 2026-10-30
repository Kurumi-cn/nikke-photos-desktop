const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function checkCapture(win,cache){
  const js=code=>win.webContents.executeJavaScript(code);
  const until=async(code)=>{for(let i=0;i<160;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,100))}throw Error('Capture UI timeout: '+code)};
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click();location.hash='/data?code=3007'");
  await until("!!document.querySelector('button[title=\"从装备面板截图识别词条\"]')");
  await js("document.querySelector('button[title=\"从装备面板截图识别词条\"]').click()");
  await until("!!document.querySelector('.ocr-drop-text')");
  assert.equal(await js("[...document.querySelectorAll('.dlg button')].some(b=>b.textContent==='手动选择窗口')"),true);
  await js("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent==='截图识别').click()");
  await until("!!document.querySelector('.ocr-capture-thumb') && !document.querySelector('.ocr-status')");
  await until("document.querySelector('.ocr-capture-thumb')?.naturalWidth > 0");
  const result=await js("({info:document.querySelector('.ocr-capture').innerText,width:document.querySelector('.ocr-capture-thumb').naturalWidth,height:document.querySelector('.ocr-capture-thumb').naturalHeight,rows:[...document.querySelectorAll('.ocr-row')].map(r=>[...r.querySelectorAll('select')].map(s=>s.value)),png:document.querySelector('.ocr-capture-thumb').src})");
  assert.ok(result.width>0 && result.height>0);assert.ok(result.info.includes(`${result.width}×${result.height}`));assert.match(result.info,/缩放 1×1/);
  assert.equal(result.rows.length,3);
  // Live equipment is user-controlled; pin expected OCR rows only when supplied.
  if(process.env.NIKKE_CAPTURE_EXPECTED_ROWS)assert.deepEqual(result.rows,JSON.parse(process.env.NIKKE_CAPTURE_EXPECTED_ROWS));
  const expected=Buffer.from(result.png.split(',')[1],'base64');delete result.png;
  const saved=path.join(cache,'capture-quality','desktop-download.png');
  const download=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),8000);win.webContents.session.once('will-download',(_e,item)=>{item.setSavePath(saved);item.once('done',(_e,status)=>{clearTimeout(timer);status==='completed'?resolve():reject(Error(status))})})});
  await js("[...document.querySelectorAll('.ocr-capture button')].find(b=>b.textContent==='下载图片').click()");await download;
  assert.ok(expected.equals(fs.readFileSync(saved)));result.downloadIdentical=true;
  await js("[...document.querySelectorAll('.ocr-capture button')].find(b=>b.textContent==='查看原尺寸图片').click()");
  await until(`document.querySelector('.ocr-original img')?.naturalWidth===${result.width}`);
  assert.equal(await js("getComputedStyle(document.querySelector('.ocr-original img')).width"),`${result.width}px`);result.originalSize=true;
  return result;
};
