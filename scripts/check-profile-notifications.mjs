import assert from 'node:assert/strict'
const data=new Map()
globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}
const store=await import('../src/lib/profileStore.js')
store.listProfiles()
let notices=0
const unsubscribe=store.subscribeProfiles(()=>notices++)
const line={functionType:'StatAtk',level:1,value:4.77}
store.saveRecord('5005',{equipments:[[line,null,null]]});assert.equal(notices,1)
assert.throws(()=>store.saveRecord('5005',{equipments:[[line,line,null]]}),/重复/);assert.equal(notices,1)
store.removeRecord('5005');assert.equal(notices,2)
const snapshot=store.loadStore();store.saveStore(snapshot);assert.equal(notices,3)
unsubscribe();store.saveStore(snapshot);assert.equal(notices,3)
console.log('Profile notifications passed: successful record/saveStore/remove updates emit; failed validation does not emit; unsubscribe works.')
