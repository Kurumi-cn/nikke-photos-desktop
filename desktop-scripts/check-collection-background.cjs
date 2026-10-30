// A deliberately blocked OCR proves navigation intake doesn't wait for it.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PNG}=require('pngjs');
const {createCollection}=require('../electron/maanikke-collection.cjs'),{createScreenshotStore}=require('../electron/maanikke-screenshots.cjs');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/background-check-'+Date.now());
const roster=JSON.parse(fs.readFileSync(path.join(project,'src/data/roster.json'))).characters;
const codes=['桃乐丝','小红帽'].map(n=>roster.find(c=>c.nameCn===n).nameCode),slots=['head','chest','hands','legs'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function png(marker){const p=new PNG({width:2,height:2});p.data.fill(marker);return PNG.sync.write(p)}
async function scenario(mode){
 const cacheRoot=path.join(root,mode),shots=createScreenshotStore({cacheRoot});shots.settings({equipmentCleanup:'character'});
 let release;const gate=new Promise(r=>release=r),reads=[];let manager,returnedBeforeOcr=false;
 const launch=async(_exe,args)=>{
  const file=args[args.indexOf('-RequestFile')+1],folder=path.dirname(file);let id=0;
  async function send(kind,data={},marker=null){
   const eventId=++id;if(marker!==null)fs.writeFileSync(path.join(folder,'spool',eventId+'.png'),png(marker));
   fs.writeFileSync(path.join(folder,'spool',eventId+'.json'),JSON.stringify({id:eventId,kind,data,image:marker!==null,savedAt:Date.now()/1000}));
   const reply=path.join(folder,'spool',eventId+'.reply.json'),deadline=Date.now()+3000;
   while(!fs.existsSync(reply)){assert.ok(Date.now()<deadline,'Intake incorrectly waited for blocked OCR');await sleep(10)}
   const response=JSON.parse(fs.readFileSync(reply));assert.ok(response.ok,response.error);return response.result;
  }
  await send('started',{hallConfirmed:true});
  for(let index=0;index<codes.length;index++){
   const nameCode=codes[index];await send('characterBegin',{nameCode,index});
   if(mode==='generation'&&index===0){
    for(const slot of slots)await send('equipment',{nameCode,slot,classification:'overload'},11);
    await send('characterBegin',{nameCode,index});
   }
   for(const slot of slots){const ack=await send('equipment',{nameCode,slot,classification:'overload'},index+21);assert.equal(ack.queued,true)}
   await send('character',{nameCode});
  }
  assert.equal(manager.status().pendingOCR,mode==='generation'?12:8);assert.ok(shots.stats().count>=8);
  await send('done',{returnedToLobby:true,inputRequests:10});
  const waiting=manager.status();assert.equal(waiting.stage,'recognizing');assert.equal(waiting.active,true);assert.equal(waiting.returnedToLobby,true);
  assert.equal(Object.values(waiting.draft).filter(c=>c.status==='complete').length,0);returnedBeforeOcr=true;
  if(mode==='stop')manager.cancel();
  release();return {stdout:'{"canceled":false}'};
 };
 manager=createCollection({project,cacheRoot,screenshots:shots,shortcuts:{register:()=>true,unregister:()=>{}},launch,ocr:async(file)=>{
  await gate;assert.ok(fs.existsSync(file),'OCR input deleted before read');
  const value=PNG.sync.read(fs.readFileSync(file)).data[0];reads.push(value);
  return {rows:[1,2,3].map(position=>({position,status:'ok',name:'测试词条',value,needsConfirm:false}))};
 }});
 await manager.start({nameCodes:codes,target:{hwnd:'123',pid:123}});const result=await manager.wait();
 assert.ok(returnedBeforeOcr);assert.equal(result.stage,mode==='stop'?'canceled':'completed');assert.equal(result.pendingOCR,0);
 for(let i=0;i<codes.length;i++){
  assert.equal(result.draft[codes[i]].status,'complete');
  for(const slot of slots)assert.equal(result.draft[codes[i]].equipment[slot].rows[0].value,i+21,'Stale generation or wrong role results');
 }
 assert.ok(shots.stats().count>=8);assert.equal(shots.stats().activeTasks,0);
 manager.reviewDone({runId:result.runId});
 assert.ok(shots.stats().count<=1,'Only a retained failure screenshot may remain');
 assert.equal(fs.readdirSync(path.join(result.folder,'spool')).filter(n=>/\.png$/.test(n)).length,0);
 return {mode,passed:true,reads:reads.length};
}
(async()=>{const cases=[];for(const mode of ['normal','generation','stop'])cases.push(await scenario(mode));const report={passed:true,gameInputs:0,navigationBeforeOCR:true,resultsBoundToRoleAndSlot:true,staleGenerationRejected:true,cleanupAfterReaders:true,stopDuringDrain:true,cases};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:root}))})().catch(e=>{console.error(e);process.exitCode=1});
