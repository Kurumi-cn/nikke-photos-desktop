const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../src/lib/ocr/assets.js'),'utf8');
const captureCode=source.slice(source.indexOf('export const captureScreenFrame =')).replace('export const captureScreenFrame =','globalThis.captureScreenFrame =');
function fixture(mode='ok'){
  let stopped=0,paused=0,arrived=false;const calls=[];
  const track={readyState:mode==='ended'?'ended':'live',getSettings:()=>{assert.ok(arrived);return {width:1590,height:926,resizeMode:'none'}},addEventListener(){},stop(){stopped++}};
  const video={videoWidth:1590,videoHeight:926,play:()=>mode==='play-error'?Promise.reject(Error('closed')):mode==='play-timeout'?new Promise(()=>{}):Promise.resolve(),pause(){paused++},requestVideoFrameCallback(cb){if(mode!=='frame-timeout')queueMicrotask(()=>{arrived=true;cb()});return 1},cancelVideoFrameCallback(){}};
  const pixels={width:1590,height:926,data:new Uint8Array([7,8,9,255])};
  const canvas={getContext:()=>({drawImage:(...args)=>{assert.equal(args.length,3)},getImageData:()=>pixels}),toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,test'}};
  const context={window:{},navigator:{mediaDevices:{getDisplayMedia:async options=>{calls.push(options);return {getVideoTracks:()=>[track],getTracks:()=>[track]}}}},document:{createElement:tag=>tag==='video'?video:canvas},console:{info(){}},setTimeout:(cb,ms)=>{if(mode.endsWith('timeout'))queueMicrotask(cb);return 1},clearTimeout(){}};
  vm.runInNewContext(captureCode,context);
  return {capture:context.captureScreenFrame,video,canvas,calls,pixels,stats:()=>({stopped,paused})};
}
test('frame stays native size and same ImageData is handed to OCR; PNG encoded once',async()=>{const f=fixture();const frame=await f.capture();assert.equal(frame.imageData,f.pixels);assert.equal(f.canvas.width,1590);assert.equal(f.canvas.height,926);assert.equal(frame.meta.scaleX,1);assert.equal(frame.meta.ocrWidth,1590);assert.equal(f.calls[0].video.resizeMode,'none');assert.equal(f.video.srcObject,null);assert.deepEqual(f.stats(),{stopped:1,paused:1})});
for(const mode of ['play-error','play-timeout','frame-timeout','ended'])test(mode+' releases capture tracks and video',async()=>{const f=fixture(mode);await assert.rejects(f.capture());assert.deepEqual(f.stats(),{stopped:1,paused:1});assert.equal(f.video.srcObject,null)});
