import test from 'node:test'
import assert from 'node:assert/strict'
import {harness,snapshot} from './harness.mjs'

test('four-gear custom game consumes resources on selected gear and reaches aggregate target',async()=>{
  for(const rule of ['cn','global']){
    const cases=[harness(true,15),harness(false,15)]
    for(const h of cases){
      const a=h.a;h.props.ruleVersion=rule;a.mode.value='character';a.simMode.value='custom'
      a.customCharGears.value=Array.from({length:4},()=>({slots:[{effect:'gj',tier:1},{effect:'uy',tier:1},{effect:'wd',tier:0}],locks:{},want:{}}))
      a.customTargets.value=[{effects:['gj'],tier:5}];a.startCustomSimulation();h.workers.at(-1).finish()
      await new Promise(r=>setImmediate(r));assert.equal(a.won.value,false)
      a.setLockWant(3,1,'key',true);h.random([.999]);a.startWash(3,'sz');assert.equal(a.stonesUsed.value,2);assert.equal(a.keysUsed.value,20)
      a.resolveWash(true);assert.equal(a.won.value,true);assert.equal(a.gears.value[0].slots[0].tier,1);assert.equal(a.gears.value[3].slots[0].tier,15);assert.deepEqual(h.plain(a.gears.value[3].locks),{})
    }
    assert.deepEqual(snapshot(cases[0]),snapshot(cases[1]))
  }
})
