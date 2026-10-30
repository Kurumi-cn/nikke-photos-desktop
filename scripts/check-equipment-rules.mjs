import assert from 'node:assert/strict'
import {equipmentIssue,assertEquipmentChanges} from '../src/lib/equipmentRules.js'
import {collectionPatch} from '../src/lib/collectionReview.js'
import {toRerollEquipmentSnapshot} from '../src/lib/rerollEquipmentImport.js'
import {simulatorGears} from '../tools/equipment-reroll/src/simulator/equipment-import.js'
import {validateEquipmentImport} from '../tools/equipment-reroll/src/character-import.js'
const atk={functionType:'StatAtk',level:1,value:4.77},def={functionType:'StatDef',level:1,value:4.77}
const empty=[null,null,null],valid=[atk,null,def],duplicate=[atk,{...atk},null],missingFirst=[null,def,null]
for(const rows of [empty,valid,[atk,null,null]])assert.equal(equipmentIssue(rows),'')
assert.match(equipmentIssue(duplicate),/重复/);assert.match(equipmentIssue(missingFirst),/第一条/)
const record=rows=>({equipments:Array.from({length:4},()=>structuredClone(rows)),skills:{skill1:5}})
const old=record(duplicate),unchanged=structuredClone(old);unchanged.skills.skill1=7
assert.doesNotThrow(()=>assertEquipmentChanges({a:old},{a:unchanged}))
assert.throws(()=>assertEquipmentChanges({}, {a:old}),/重复/)
assert.doesNotThrow(()=>assertEquipmentChanges({a:old},{a:record(valid)}))
assert.doesNotThrow(()=>assertEquipmentChanges({a:old},{a:record(empty)}))
assert.throws(()=>toRerollEquipmentSnapshot(record(missingFirst)),/第一条/)
assert.throws(()=>toRerollEquipmentSnapshot(record(duplicate)),/重复/)
const payload=toRerollEquipmentSnapshot(record(valid));assert.doesNotThrow(()=>validateEquipmentImport(payload))
payload.equipments[0][0]={stat:'空词条',tier:0}
assert.throws(()=>validateEquipmentImport(payload),/第一条/)
assert.throws(()=>simulatorGears({version:1,slot:0,equipments:[payload.equipments[0]]},'single'),/第一条/)
assert.doesNotThrow(()=>simulatorGears({version:1,slot:0,equipments:[[0,0,0].map(()=>({stat:'空词条',tier:0}))]},'single'))
const captured=rows=>({a:{status:'complete',equipment:{head:{rows}}}})
const original={a:record([atk,null,null])},originalText=JSON.stringify(original)
assert.throws(()=>collectionPatch(original,captured([{position:2,status:'ok',functionType:'StatAtk',value:4.77}]),['a']),/重复/)
assert.throws(()=>collectionPatch({a:record(empty)},captured([{position:2,status:'ok',functionType:'StatDef',value:4.77}]),['a']),/第一条/)
assert.equal(JSON.stringify(original),originalText)
const patched=collectionPatch(original,captured([{position:2,status:'ok',functionType:'StatDef',value:4.77}]),['a'])
assert.equal(patched.characters.a.equipments[0][0].functionType,'StatAtk')
assert.equal(patched.characters.a.equipments[0][1].functionType,'StatDef')

// Real persistence API with memory-only storage: failed writes/imports must be atomic.
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const store=await import('../src/lib/profileStore.js')
store.saveRecord('a',record(valid))
const raw=()=>JSON.stringify([...memory])
let before=raw()
assert.throws(()=>store.saveRecord('a',record(duplicate)),/重复/);assert.equal(raw(),before)
assert.throws(()=>store.saveRecord('a',record(missingFirst)),/第一条/);assert.equal(raw(),before)
const parsed={characters:{5145:record(duplicate)},count:1,unknown:[],schemes:[],synchroLevel:300}
assert.throws(()=>store.importIntoProfile('default',parsed),/重复/);assert.equal(raw(),before)
assert.throws(()=>store.importAsNewProfile(parsed,{name:'Invalid',synchroLevel:300}),/重复/);assert.equal(raw(),before)
// Legacy invalid equipment is visible and untouched until explicitly edited.
const key='nikke-photos/profiles/v1/data/default'
memory.set(key,JSON.stringify({version:2,characters:{a:old}}));before=raw()
assert.deepEqual(store.loadRecord('a').equipments,old.equipments);assert.equal(raw(),before)
store.saveRecord('a',unchanged);assert.deepEqual(store.loadRecord('a').equipments,old.equipments)
store.saveRecord('a',record(valid));assert.equal(equipmentIssue(store.loadRecord('a').equipments[0]),'')
memory.set(key,JSON.stringify({version:1,characters:{a:old}}))
assert.deepEqual(store.loadRecord('a').equipments,old.equipments)
assert.ok(memory.has('nikke-photos/profiles/v1/backup/default'))
store.saveRecord('a',record(empty));assert.deepEqual(store.loadRecord('a').equipments[0],empty)
console.log('Equipment rules passed: blank/unique/first-row, atomic saves and imports, legacy preservation/migration, merged collection rows, tool boundaries.')
