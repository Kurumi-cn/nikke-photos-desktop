const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PNG}=require('pngjs'),{createCollection,normalizeRows}=require('../electron/maanikke-collection.cjs');
const {createScreenshotStore}=require('../electron/maanikke-screenshots.cjs');
const project=path.resolve(__dirname,'..'),cacheRoot=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/collection-check-'+Date.now());
fs.mkdirSync(cacheRoot,{recursive:true});const shots=createScreenshotStore({cacheRoot});shots.settings({equipmentCleanup:'character'});
const roster=JSON.parse(fs.readFileSync(path.join(project,'src/data/roster.json'))).characters,codes=['桃乐丝','小红帽'].map(name=>roster.find(c=>c.nameCn===name).nameCode);
const target={hwnd:'123',pid:123},registered=new Set();
const shortcuts={register:(key)=>{if(registered.has(key))return false;registered.add(key);return true},unregister:key=>registered.delete(key)};
const png=PNG.sync.write(new PNG({width:2,height:2}));
let launched=0;
async function launch(_exe,args){
 assert.equal(_exe,'powershell.exe');assert.equal(args[args.indexOf('-ExecutionPolicy')+1],'Bypass');assert.ok(args.indexOf('-ExecutionPolicy')<args.indexOf('-File'));
 launched++;const file=args[args.indexOf('-RequestFile')+1],folder=path.dirname(file),request=JSON.parse(fs.readFileSync(file));let id=0;
 async function send(kind,data={},image=false){
  id++;if(image)fs.writeFileSync(path.join(folder,'spool',id+'.png'),png);
  fs.writeFileSync(path.join(folder,'spool',id+'.json'),JSON.stringify({id,kind,data,image,savedAt:Date.now()/1000}));
  const reply=path.join(folder,'spool',id+'.reply.json');const deadline=Date.now()+6000;
  while(!fs.existsSync(reply)){if(Date.now()>deadline)throw Error('Mock helper reply timeout');await new Promise(r=>setTimeout(r,20));}
  const result=JSON.parse(fs.readFileSync(reply));assert.equal(result.ok,true,result.error);return result;
 }
 await send('started',{hallConfirmed:true});
 await send('characterBegin',{nameCode:codes[0],index:0});
 await send('equipment',{nameCode:codes[0],slot:'head',classification:'unequipped'},true);
 await send('equipment',{nameCode:codes[0],slot:'chest',classification:'non_overload'},true);
 await send('equipment',{nameCode:codes[0],slot:'hands',classification:'overload'},true);
 await send('equipment',{nameCode:codes[0],slot:'legs',classification:'equipment_unknown'},true);
 await send('character',{nameCode:codes[0]});assert.equal(shots.stats().count,4);
 await send('characterBegin',{nameCode:codes[1],index:1});await send('frame',{},true);
 await send('skipped',{nameCode:codes[1],reason:'无法唯一判别'});
 await send('done',{returnedToLobby:true});return {stdout:'{"canceled":false}'};
}
async function main(){
 const collection=createCollection({project,cacheRoot,screenshots:shots,shortcuts,launch,ocr:async()=>({rows:[{position:1,status:'ok',name:'攻击力增加',value:6.88,needsConfirm:false},{position:2,status:'ok',name:'暴击率增加',value:4.35,needsConfirm:true},{position:3,status:'empty'}]})});
 assert.deepEqual(collection.preferences().nameCodes,[]);
 collection.preferences({nameCodes:codes,keys:{pause:'Ctrl+F8',stop:'F9'}});
 assert.deepEqual(collection.preferences().nameCodes,codes);
 assert.throws(()=>collection.preferences({nameCodes:['invalid'],keys:{pause:'F8',stop:'F9'}}),/无效/);
 const cnCodes=new Set(require('../src/data/cn-roster.json').nameCodes),outside=roster.find(c=>!cnCodes.has(c.nameCode)).nameCode;
 assert.throws(()=>collection.preferences({nameCodes:[outside],keys:{pause:'F8',stop:'F9'}}),/无效/);
 await assert.rejects(collection.start({nameCodes:[outside],target}),/国服/);assert.equal(launched,0);
 assert.throws(()=>collection.preferences({nameCodes:codes,keys:{pause:'F8',stop:'F8'}}),/快捷键/);
 registered.add('F8');await assert.rejects(collection.start({nameCodes:codes,target}),/占用/);assert.equal(launched,0);registered.clear();
 await assert.rejects(collection.start({nameCodes:['invalid'],target}),/有效/);
 await collection.start({nameCodes:codes,target});const result=await collection.wait();
 assert.equal(result.stage,'completed');assert.equal(result.returnedToLobby,true);assert.equal(registered.size,0);assert.equal(shots.stats().activeTasks,0);
 assert.equal(result.draft[codes[0]].status,'complete');assert.equal(result.draft[codes[1]].status,'skipped');
 assert.equal(result.draft[codes[0]].equipment.head.rows[0].reason,'unequipped');assert.equal(result.draft[codes[0]].equipment.chest.rows[0].reason,'non_overload');
 assert.equal(result.draft[codes[0]].equipment.hands.rows[1].status,'unreadable');assert.equal(result.draft[codes[0]].equipment.hands.rows[1].value,4.35);
 assert.equal(result.draft[codes[0]].equipment.hands.rows[1].suggested,true);
 assert.equal(result.draft[codes[0]].equipment.legs.rows[0].reason,'equipment_unknown');
 assert.equal(shots.stats().count,5);assert.equal(Object.keys(result.draft[codes[1]].equipment).length,0);
 assert.equal(shots.read(result.draft[codes[0]].equipment.head.imageId).available,true);
 await collection.editRow({runId:result.runId,nameCode:codes[0],slot:'hands',position:2,row:{status:'ok',functionType:'StatAtk',value:6.88}});
 assert.equal(collection.status().draft[codes[0]].equipment.hands.rows[1].tier,4);
 assert.equal(collection.status().draft[codes[0]].equipment.hands.rows[1].manual,true);
 await assert.rejects(collection.editRow({runId:result.runId,nameCode:codes[0],slot:'hands',position:2,row:{status:'ok',functionType:'StatAtk',value:999}}),/有效/);
 await assert.rejects(collection.start({nameCodes:codes,target,resumeRunId:result.runId}),/已完成/);assert.equal(registered.size,0);
 assert.throws(()=>collection.archiveReceipt({runId:result.runId,profileId:'fixture',profileName:'测试档案',nameCodes:[codes[1]]}),/无效/);
 assert.equal(collection.status().runId,result.runId);
 const archived=collection.archiveReceipt({runId:result.runId,profileId:'fixture',profileName:'测试档案',nameCodes:[codes[0]]});
 assert.equal(archived.stage,'idle');assert.deepEqual(archived.archiveSaved,{profileName:'测试档案',count:1});
 assert.deepEqual(collection.status().draft,{});assert.deepEqual(collection.preferences().nameCodes,[]);
 assert.equal(shots.stats().count,1);
 assert.equal(shots.read(result.draft[codes[0]].equipment.head.imageId).available,false);
 assert.equal(normalizeRows({rows:[]}).length,3);
 const candidates=normalizeRows({rows:[{position:1,status:'unknown',name:'攻击力增加',functionType:'StatAtk',value:null,needsConfirm:true},{position:2,status:'empty',needsConfirm:true,flags:['ROW1_EMPTY_SUSPECT']}]});
 assert.equal(candidates[0].name,'攻击力增加');assert.equal(candidates[0].value,null);assert.equal(candidates[0].status,'unreadable');
 assert.equal(candidates[1].suggestedEmpty,true);assert.equal(candidates[1].status,'unreadable');
 assert.equal(candidates[2].name,null);assert.equal(candidates[2].value,null);
 const keysBefore=collection.preferences().keys;
 collection.clearSession();assert.equal(collection.status().stage,'idle');assert.deepEqual(collection.preferences(),{nameCodes:[],keys:keysBefore});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.folder,'draft.json'))),{});
 assert.equal(fs.existsSync(path.join(result.folder,'attempt.lock')),false); // Mock launcher has no native lock.
 // A forced exit never runs clearSession: the next startup must discard it.
 fs.writeFileSync(path.join(result.folder,'status.json'),JSON.stringify({...result,active:true,stage:'collecting'}));
 fs.writeFileSync(path.join(result.folder,'draft.json'),JSON.stringify(result.draft));
 fs.writeFileSync(path.join(result.folder,'ocr-'+codes[0]+'-head.json'),'{}');
 fs.writeFileSync(path.join(result.folder,'attempt.lock'),'keep-lock');
 fs.writeFileSync(path.join(cacheRoot,'maanikke-collection','latest.json'),JSON.stringify({runId:result.runId}));
 const restarted=createCollection({project,cacheRoot,screenshots:shots,shortcuts,launch});
 assert.equal(restarted.status().stage,'idle');assert.deepEqual(restarted.preferences().nameCodes,[]);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.folder,'draft.json'))),{});
 assert.equal(fs.existsSync(path.join(result.folder,'ocr-'+codes[0]+'-head.json')),false);
 assert.equal(fs.readFileSync(path.join(result.folder,'attempt.lock'),'utf8'),'keep-lock');
 const report={passed:true,archiveClearsSessionAndScreenshots:true,invalidArchiveDoesNotClear:true,nonCnRejectedBeforeUAC:true,keyConflictStopsBeforeUAC:true,taskAndCharacterCleanup:true,durableDraft:true,skipNotEmpty:true,unreadNotEmpty:true,registeredKeysReleased:true,gameInputs:0};
 fs.writeFileSync(path.join(cacheRoot,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:cacheRoot}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
