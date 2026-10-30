import test from 'node:test'
import assert from 'node:assert/strict'
import {simulatorGears,requestSimulatorEquipment} from '../src/simulator/equipment-import.js'
import {installSimulatorImportRelay} from '../src/simulator-import-relay.js'
const row=(stat='空词条',tier=0)=>({stat,tier})
const board=[row('攻击力增加',6),row(),row('暴击率增加',1)]
test('selected equipment snapshots map every affix/tier, create independent gears and clear locks',()=>{
 const names=['优越代码伤害增加','攻击力增加','最大装弹数增加','暴击伤害增加','暴击率增加','防御力增加','命中率增加','蓄力速度增加','蓄力伤害增加']
 const codes=['uy','gj','dr','bs','bj','fy','mz','xs','xl']
 for(const [i,stat] of names.entries())for(let tier=1;tier<=15;tier++) {
  const input={version:1,slot:3,equipments:[[row(stat,tier),row(),row()]]},before=structuredClone(input)
  const [gear]=simulatorGears(input,'single');assert.equal(gear.slots[0].effect,codes[i]);assert.equal(gear.slots[0].tier,tier);assert.deepEqual(gear.locks,{});assert.deepEqual(gear.want,{})
  gear.slots[0].tier=0;assert.deepEqual(input,before)
 }
 const gears=simulatorGears({version:1,equipments:Array(4).fill(board)},'character');assert.equal(gears.length,4);gears[0].slots[0].tier=1;assert.equal(gears[1].slots[0].tier,6)
})
test('invalid scope/count/slot/effect/tier/duplicates are rejected rather than guessed',()=>{
 const base={version:1,slot:0,equipments:[board]}
 for(const mutate of [x=>x.version=2,x=>x.slot=-1,x=>x.equipments=[],x=>x.equipments[0][0].stat='未知',x=>x.equipments[0][0].tier=16,x=>x.equipments[0][2]=row('攻击力增加',1)]) {
  const input=structuredClone(base);mutate(input);assert.throws(()=>simulatorGears(input,'single'))
 }
 assert.throws(()=>simulatorGears(base,'character'));assert.throws(()=>simulatorGears(base,'unknown'))
 const inherited=structuredClone(base);inherited.equipments[0][0].stat='constructor';assert.throws(()=>simulatorGears(inherited,'single'))
})
test('snapshot reply requires matching parent, origin and nonce; cancel removes pending listener',async()=>{
 const previous=Object.fromEntries(['window','parent','location'].map(k=>[k,globalThis[k]])),listeners=new Set(),messages=[]
 globalThis.window={addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)}
 globalThis.parent={postMessage:(data,origin)=>messages.push({data,origin})};globalThis.location={protocol:'nikke:',origin:'nikke://reroll'}
 try {
  const task=requestSimulatorEquipment('single'),id=messages.at(-1).data.requestId
  const data={type:'nikke-simulator:import-result',requestId:id,payload:{version:1,slot:2,equipments:[board]}}
  for(const event of [{source:{},origin:'nikke://app',data},{source:parent,origin:'nikke://reroll',data},{source:parent,origin:'nikke://app',data:{...data,requestId:'wrong'}}])for(const fn of listeners)fn(event)
  assert.equal(listeners.size,1)
  for(const fn of listeners)fn({source:parent,origin:'nikke://app',data})
  assert.equal((await task.promise).gears[0].slots[0].effect,'gj');assert.equal(listeners.size,0)
  const canceled=requestSimulatorEquipment('character');canceled.cancel();assert.equal(await canceled.promise,null);assert.equal(listeners.size,0);assert.equal(messages.at(-1).data.type,'nikke-simulator:cancel-import')
 } finally {for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value}
})
test('outer relay ignores orphan replies, wrong sources and duplicate completed requests',()=>{
 const keys=['window','parent','location','document'],previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]])),sent=[],replies=[]
 let receive
 const simulator={postMessage:data=>replies.push(data)}
 globalThis.window={addEventListener:(type,fn)=>{receive=fn}}
 globalThis.parent={postMessage:data=>sent.push(data)}
 globalThis.location={protocol:'nikke:',origin:'nikke://reroll'}
 globalThis.document={querySelector:id=>id==='#simulator-frame'?{contentWindow:simulator}:{hidden:false}}
 try {
  installSimulatorImportRelay()
  const result={source:parent,origin:'nikke://app',data:{type:'nikke-reroll:import-result'}}
  assert.doesNotThrow(()=>receive(result))
  receive({source:{},origin:'nikke://reroll',data:{type:'nikke-simulator:request-import',requestId:'bad',scope:'single'}});assert.equal(sent.length,0)
  receive({source:simulator,origin:'nikke://reroll',data:{type:'nikke-simulator:request-import',requestId:'selected',scope:'single'}})
  assert.equal(sent[0].purpose,'simulator-single');receive(result);assert.equal(replies.length,0)
  receive({...result,data:{...result.data,requestId:'selected',canceled:true}});assert.equal(replies.length,1)
  assert.doesNotThrow(()=>receive(result));assert.equal(replies.length,1)
 } finally {for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value}
})
