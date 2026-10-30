import assert from 'node:assert/strict'
import { CHARACTERS } from '../src/lib/roster.js'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const store=await import('../src/lib/profileStore.js')
const code=String(CHARACTERS[0].nameCode),unknown='99999999'
const line={functionType:'StatAtk',level:1,value:4.77}
const good={combat:12345,equipments:[[line,null,null]]},bad={equipments:[[line,line,null]]}
const parse=characters=>store.parseProfile(JSON.stringify({format:'nikke-photos-profile',version:2,synchroLevel:200,characters}))
store.listProfiles()
const payload=parse({[code]:good,[unknown]:bad}),original=JSON.stringify(payload)
assert.deepEqual(payload.unknown,[unknown])
for(const mode of ['new','overwrite']){
 const result=mode==='new'?store.importAsNewProfile(payload,{name:'隔离测试',synchroLevel:200}):store.importIntoProfile('default',payload)
 const id=result.profile?.id||'default'
 const saved=JSON.parse(memory.get('nikke-photos/profiles/v1/data/'+id)).characters
 assert.deepEqual(Object.keys(saved),[code]);assert.equal(saved[code].combat,12345)
 assert.equal(result.imported,1);assert.deepEqual(result.unknown,[unknown])
 assert.equal(JSON.stringify(payload),original)
}
// Unknown-only files must not empty the target profile or create an empty new profile.
const snapshot=()=>JSON.stringify([...memory])
for(const mode of ['new','overwrite']){
 const before=snapshot(),p=parse({[unknown]:bad})
 assert.throws(()=>mode==='new'?store.importAsNewProfile(p,{name:'拒绝',synchroLevel:200}):store.importIntoProfile('default',p),/没有可导入/)
 assert.equal(snapshot(),before)
}
// Recompute known IDs at commit even when callers bypass the preview's unknown list.
const bypass={...payload,unknown:[]}
assert.equal(store.importIntoProfile('default',bypass).imported,1)
assert.ok(!JSON.parse(memory.get('nikke-photos/profiles/v1/data/default')).characters[unknown])
for(const mode of ['new','overwrite']){
 const before=snapshot(),p=parse({[code]:bad,[unknown]:good})
 assert.throws(()=>mode==='new'?store.importAsNewProfile(p,{name:'非法',synchroLevel:200}):store.importIntoProfile('default',p),/重复/)
 assert.equal(snapshot(),before)
}
console.log('Import policy passed: new/overwrite filter unknown before validation, exact counts, unchanged input, bypass guard, unknown-only and invalid-known atomic refusal.')
