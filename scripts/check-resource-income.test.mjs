import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {localToday,validDate,validateRecord,validateDocument,resourceStatistics} from '../electron/resource-income-model.mjs'
import {createResourceIncomeStore} from '../electron/resource-income-store.mjs'
const today='2026-10-25'
const root='E:/博哥/codex temp/nikke-desktop/resource-income-tests'
fs.mkdirSync(root,{recursive:true})
test('calendar validation, leap days, zero versus blank and quantity guards',()=>{
 assert.equal(localToday(new Date(2026,0,2,0,1)),'2026-01-02')
 for(const date of ['2024-02-29','2026-10-25'])assert.equal(validDate(date),true)
 for(const date of ['2026-02-29','2026-04-31','2026-1-01','garbage','1899-12-31'])assert.equal(validDate(date),false)
 assert.deepEqual(validateRecord({date:today,stones:'0',keys:''},today),{date:today,stones:0,keys:null})
 assert.deepEqual(validateRecord({date:today,keys:'7'},today),{date:today,stones:null,keys:7})
 for(const value of [-1,1.5,'1.5','1e3',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateRecord({date:today,stones:value},today))
 assert.throws(()=>validateRecord({date:today,stones:'',keys:''},today),/至少/)
 assert.throws(()=>validateRecord({date:'2026-10-26',keys:1},today),/未来/)
})
test('per-resource 7/30-day averages exclude gaps and blanks, include explicit zeros and window edges',()=>{
 const records=[{date:today,stones:10,keys:null},{date:'2026-10-24',stones:null,keys:8},{date:'2026-10-19',stones:4,keys:0},{date:'2026-10-18',stones:20,keys:2},{date:'2026-09-26',stones:6,keys:null},{date:'2026-09-25',stones:100,keys:10}]
 const stats=resourceStatistics(records,today)
 assert.deepEqual(stats.week,{recordedDays:3,calendarDays:7,stones:{total:'14',days:2,average:7},keys:{total:'8',days:2,average:4}})
 assert.equal(stats.month.recordedDays,5);assert.equal(stats.month.stones.total,'40');assert.equal(stats.month.stones.average,10);assert.equal(stats.month.keys.average,10/3)
 assert.equal(stats.all.stones.total,'140');assert.equal(stats.all.keys.total,'20')
 assert.equal(resourceStatistics([],today).week.keys.average,null)
 assert.equal(resourceStatistics([{date:today,stones:0,keys:null}],today).week.stones.average,0)
 const n=Number.MAX_SAFE_INTEGER;assert.equal(resourceStatistics([{date:today,stones:n,keys:null},{date:'2026-10-24',stones:n,keys:null}],today).all.stones.total,(2n*BigInt(n)).toString())
})
test('durable date upsert, editing, deletion, previous backup and independent reopening/export',()=>{
 const dir=fs.mkdtempSync(path.join(root,'store-')),store=createResourceIncomeStore(dir)
 assert.equal(store.read().records.length,0);assert.equal(fs.existsSync(store.file),false)
 store.upsert({date:today,stones:2,keys:''});store.upsert({date:today,stones:'5',keys:3})
 assert.equal(store.read().records.length,1);assert.equal(store.read().records[0].stones,5)
 assert.equal(JSON.parse(fs.readFileSync(store.file+'.bak')).records[0].stones,2)
 store.upsert({date:'2026-10-24',stones:null,keys:7})
 const reopened=createResourceIncomeStore(dir);assert.equal(reopened.read().records.length,2)
 const backup=validateDocument(JSON.parse(reopened.backupJSON()));assert.deepEqual(backup,reopened.read())
 reopened.remove(today);assert.equal(createResourceIncomeStore(dir).read().records.length,1)
 assert.equal(JSON.parse(fs.readFileSync(store.file+'.bak')).records.length,2)
 const before=fs.readFileSync(store.file,'utf8');assert.throws(()=>store.upsert({date:today,stones:-1}));assert.equal(fs.readFileSync(store.file,'utf8'),before)
})
test('malformed and duplicate-date documents fail closed and never overwrite persistent data',()=>{
 for(const content of ['not json',JSON.stringify({version:2,records:[]}),JSON.stringify({version:1,records:[{date:today,stones:1},{date:today,keys:2}]})]){
  const dir=fs.mkdtempSync(path.join(root,'invalid-')),store=createResourceIncomeStore(dir);fs.mkdirSync(path.dirname(store.file),{recursive:true});fs.writeFileSync(store.file,content)
  assert.throws(()=>store.read(),/读取失败/);assert.throws(()=>store.upsert({date:today,stones:1}),/读取失败/);assert.throws(()=>store.remove(today),/读取失败/);assert.equal(fs.readFileSync(store.file,'utf8'),content)
 }
})
