const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {resolveStoragePaths,writeLocation}=require('../electron/storage-paths.cjs');
const cache=path.resolve(__dirname,'../../codex temp/nikke-desktop/beta-storage-tests');fs.mkdirSync(cache,{recursive:true});
const base=fs.mkdtempSync(path.join(cache,'case-'));
function options(name){return {packaged:true,project:path.join(base,'source'),executable:path.join(base,name,'NIKKE Photos.exe'),localAppData:path.join(base,'user'),env:{NIKKE_DATA_HOME:path.join(base,name+'-data')}}}
test('installed data and caches stay outside installation and independent of version/directory',()=>{
 const a=options('new'),r=resolveStoragePaths(a),next=resolveStoragePaths({...a,executable:path.join(base,'other','NIKKE Photos.exe')});
 assert.equal(r.dataRoot,next.dataRoot);assert.equal(r.cacheRoot,next.cacheRoot);assert.equal(r.storageMode,'per-user');assert.ok(!r.dataRoot.startsWith(path.dirname(a.executable)+path.sep));assert.ok(!r.cacheRoot.startsWith(r.dataRoot));
})
test('development data path and explicit test overrides remain compatible',()=>{
 const o=options('dev');assert.equal(resolveStoragePaths({...o,packaged:false}).dataRoot,path.join(o.project,'data'));
 assert.equal(resolveStoragePaths({...o,env:{NIKKE_DATA_DIR:path.join(base,'isolated'),NIKKE_CACHE_DIR:path.join(base,'cache')}}).dataRoot,path.join(base,'isolated'));
})
test('legacy in-place adoption preserves all bytes and stable pointer survives moving installer',()=>{
 const o=options('legacy'),folder=path.join(path.dirname(o.executable),'data');fs.mkdirSync(path.join(folder,'Local Storage'),{recursive:true});fs.writeFileSync(path.join(folder,'Local Storage','sentinel'),'original profile');
 const r=resolveStoragePaths(o);assert.equal(r.dataRoot,folder);assert.equal(r.storageMode,'legacy-in-place');assert.equal(fs.readFileSync(path.join(folder,'Local Storage','sentinel'),'utf8'),'original profile');
 assert.equal(resolveStoragePaths({...o,executable:path.join(base,'reinstall','NIKKE Photos.exe')}).dataRoot,folder);
})
test('existing new data wins; invalid/missing old directory fails closed instead of blank profile',()=>{
 const o=options('conflict'),standard=path.join(o.env.NIKKE_DATA_HOME,'userdata');fs.mkdirSync(path.join(standard,'tools'),{recursive:true});fs.mkdirSync(path.join(path.dirname(o.executable),'data','Local Storage'),{recursive:true});
 assert.equal(resolveStoragePaths(o).dataRoot,standard);
 assert.throws(()=>writeLocation(o.env.NIKKE_DATA_HOME,path.join(base,'missing')),/旧版/);
 fs.writeFileSync(path.join(o.env.NIKKE_DATA_HOME,'storage-location.json'),'bad json');assert.throws(()=>resolveStoragePaths(o),/配置损坏/);
})
