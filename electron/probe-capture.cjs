// Development-only capture evidence; uses isolated storage and never thumbnails.
const {app,BrowserWindow,desktopCapturer,session,protocol,net}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../codex temp/nikke-desktop/capture-quality');
app.setPath('userData',path.join(root,'probe-data'));
protocol.registerSchemesAsPrivileged([{scheme:'captureprobe',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.whenReady().then(async()=>{
  protocol.handle('captureprobe',request=>{
    const filename=path.resolve(__dirname,'..','.'+new URL(request.url).pathname);
    if(!filename.startsWith(path.resolve(__dirname,'..')+path.sep))return new Response('',{status:403});
    if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())return new Response('Not found',{status:404});
    if(filename.endsWith(path.join('ocr','assets.js')))return new Response(fs.readFileSync(filename,'utf8').replace('import.meta.env.BASE_URL',JSON.stringify('/public/')),{headers:{'Content-Type':'text/javascript'}});
    return net.fetch(require('node:url').pathToFileURL(filename).toString()).catch(()=>new Response('Read failed',{status:500}));
  });
  const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
  const candidates=sources.filter(s=>/^(胜利女神[:：]|GODDESS OF VICTORY|NIKKE$)/i.test(s.name));
  if(candidates.length!==1)throw Error(JSON.stringify(sources.map(s=>({id:s.id,name:s.name}))));
  let production=false;
  session.defaultSession.setDisplayMediaRequestHandler(async(_r,cb)=>cb({video:production?await require('./capture-source.cjs').chooseCaptureSource({desktopCapturer,dialog:require('electron').dialog,window:win}):candidates[0]}));
  const win=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{backgroundThrottling:false}});
  await win.loadURL('captureprobe://app/dist/index.html');
  const results=[];
  if(process.argv.includes('--cursor-only')) {
    for(const cursor of ['always','never']) {
      const result=await win.webContents.executeJavaScript(`(async()=>{const supported=navigator.mediaDevices.getSupportedConstraints();const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:7680},height:{ideal:4320},resizeMode:'none',cursor:'${cursor}'},audio:false});try{const track=stream.getVideoTracks()[0];const v=document.createElement('video');v.muted=true;v.srcObject=stream;await v.play();await new Promise(r=>v.requestVideoFrameCallback(r));const before=track.getSettings();let applied,error;try{await track.applyConstraints({cursor:{exact:'${cursor}'}});applied=true}catch(e){error=String(e)}await new Promise(r=>v.requestVideoFrameCallback(r));const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return {supported,before,applied,error,after:track.getSettings(),capabilities:track.getCapabilities(),png:c.toDataURL('image/png')}}finally{stream.getTracks().forEach(t=>t.stop())}})()`);
      fs.writeFileSync(path.join(root,'cursor-'+cursor+'.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;results.push({cursor,...result});
    }
    fs.writeFileSync(path.join(root,'cursor-probe.json'),JSON.stringify({versions:process.versions,results},null,2));app.exit(0);return;
  }
  for(const [name,video] of [['baseline',true],['native',{width:{ideal:7680},height:{ideal:4320},resizeMode:'none'}]]){
    const r=await win.webContents.executeJavaScript(`(async()=>{const stream=await navigator.mediaDevices.getDisplayMedia({video:${JSON.stringify(video)},audio:false});try{const track=stream.getVideoTracks()[0];const v=document.createElement('video');v.srcObject=stream;v.muted=true;await v.play();await new Promise(r=>v.requestVideoFrameCallback(r));const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return {settings:track.getSettings(),width:c.width,height:c.height,png:c.toDataURL('image/png')};}finally{stream.getTracks().forEach(t=>t.stop())}})()`);
    fs.writeFileSync(path.join(root,name+'.png'),Buffer.from(r.png.split(',')[1],'base64'));delete r.png;results.push({name,...r});
  }
  production=true;
  const actual=await win.webContents.executeJavaScript(`(async()=>{const {captureScreenFrame,loadOcrAssets}=await import('/src/lib/ocr/assets.js');const {recognizeEquipment}=await import('/src/lib/ocr/equipment/engine.js');const frame=await captureScreenFrame();const bitmap=await createImageBitmap(await (await fetch(frame.dataUrl)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const decoded=ctx.getImageData(0,0,c.width,c.height);const equal=decoded.data.every((v,i)=>v===frame.imageData.data[i]);const result=await recognizeEquipment(frame.imageData,{...await loadOcrAssets(),engine:'v2'});return {meta:frame.meta,png:frame.dataUrl,pixelIdentical:equal,ocr:result};})()`);
  fs.writeFileSync(path.join(root,'production.png'),Buffer.from(actual.png.split(',')[1],'base64'));delete actual.png;results.push({name:'production',...actual});
  const js=code=>win.webContents.executeJavaScript(code);
  const until=async(code,label)=>{for(let i=0;i<120;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,100))}throw Error('UI timeout: '+label)};
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click()");
  await js("location.hash='/data?code=3007'");
  await until("!!document.querySelector('button[title=\"从装备面板截图识别词条\"]')",'OCR button');
  await js("document.querySelector('button[title=\"从装备面板截图识别词条\"]').click()");
  await until("!!document.querySelector('.ocr-drop-text')",'OCR dialog');
  await js("[...document.querySelectorAll('.dlg button')].find(b=>b.textContent==='截图识别').click()");
  await until("!!document.querySelector('.ocr-capture-thumb') && !document.querySelector('.ocr-status')",'capture and OCR');
  const ui=await js("({text:document.querySelector('.ocr-capture').innerText,rows:[...document.querySelectorAll('.ocr-row')].map(r=>[...r.querySelectorAll('select')].map(s=>s.value)),png:document.querySelector('.ocr-capture-thumb').src,webBranch:!window.nikkeDesktop})");
  const expected=Buffer.from(ui.png.split(',')[1],'base64');delete ui.png;
  await js("[...document.querySelectorAll('.ocr-capture button')].find(b=>b.textContent==='查看原尺寸图片').click()");
  await until("document.querySelector('.ocr-original img')?.naturalWidth===1590",'original preview');
  ui.preview=await js("(()=>{const img=document.querySelector('.ocr-original img');const s=getComputedStyle(img);return {width:s.width,height:s.height,maxWidth:s.maxWidth,scroll:document.querySelector('.ocr-original').scrollWidth}})()");
  await js("document.querySelector('.ocr-original').dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}))");
  const download= new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),8000);win.webContents.session.once('will-download',(_e,item)=>{item.setSavePath(path.join(root,'ui-download.png'));item.once('done',(_e,state)=>{clearTimeout(timer);state==='completed'?resolve():reject(Error(state))})})});
  await js("[...document.querySelectorAll('.ocr-capture button')].find(b=>b.textContent==='下载图片').click()");await download;
  ui.savedIdentical=expected.equals(fs.readFileSync(path.join(root,'ui-download.png')));
  results.push({name:'ui',...ui});
  fs.writeFileSync(path.join(root,'probe.json'),JSON.stringify({source:{id:candidates[0].id,name:candidates[0].name},results},null,2));
  app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(root,'probe-error.txt'),String(e.stack));app.exit(1)});
setTimeout(()=>app.exit(2),55000).unref();
