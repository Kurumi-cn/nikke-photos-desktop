import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRerollEquipmentSnapshot } from '../src/lib/rerollEquipmentImport.js'
import { AFFIX_TIER_VALUES, FUNCTION_LABELS } from '../src/data/affixTiers.js'
import { validateEquipmentImport } from '../tools/equipment-reroll/src/character-import.js'
const line=(functionType='StatAtk',level=6)=>({functionType,level,value:AFFIX_TIER_VALUES[functionType][level-1]})
const record=()=>({equipments:Array.from({length:4},()=>[line(),null,null])})
test('four slots keep order, blanks and snapshot isolation',()=>{
  const source=record(),before=JSON.stringify(source),payload=toRerollEquipmentSnapshot(source)
  assert.equal(payload.equipments.length,4);assert.deepEqual(payload.equipments[0],[{stat:'攻击力增加',tier:6},{stat:'空词条',tier:0},{stat:'空词条',tier:0}])
  assert.equal(JSON.stringify(source),before);payload.equipments[0][0].tier=1;assert.equal(source.equipments[0][0].level,6)
})
test('all nine stats and all 15 tiers round trip to the calculator validator',()=>{
  let checked=0
  for(const [type,tiers] of Object.entries(AFFIX_TIER_VALUES))for(let i=0;i<15;i++){
    const input={equipments:Array.from({length:4},()=>[line(type,i+1)])}
    const output=validateEquipmentImport(toRerollEquipmentSnapshot(input))
    assert.equal(output[0][0].stat,FUNCTION_LABELS[type]);assert.equal(output[0][0].tier,i+1);assert.equal(output[0][0].locked,false);checked++
  }
  assert.equal(checked,135)
})
test('explicit row position preserved and exact values can recover missing tier',()=>{
  const input=record();input.equipments[1]=[line(),{functionType:'IncElementDmg',value:24.96,position:3}]
  const result=toRerollEquipmentSnapshot(input)
  assert.deepEqual(result.equipments[1][2],{stat:'优越代码伤害增加',tier:12})
})
test('incomplete, unknown, duplicate, missing tier and mismatched values refused without guessing',()=>{
  assert.throws(()=>toRerollEquipmentSnapshot({equipments:[]}),/完整/)
  for(const rows of [[],[null,line(),null],[{...line(),position:3}],[{functionType:'unknown',level:1}],[line(),line()],[{functionType:'StatAtk',level:null,value:12.34}],[{...line(),level:16}],[{...line(),value:999}],[{...line(),position:0}]]){
    const input=record();input.equipments[2]=rows;assert.throws(()=>toRerollEquipmentSnapshot(input))
  }
})
test('child rejects malformed snapshots and resets current locks, never imports player metadata',()=>{
  const payload=toRerollEquipmentSnapshot(record())
  for(const bad of [{}, {...payload,version:2},{...payload,equipments:payload.equipments.slice(1)},{...payload,equipments:[[{stat:'未知',tier:1}],...payload.equipments.slice(1)]}])assert.throws(()=>validateEquipmentImport(bad))
  payload.equipments[0][0].locked=true
  assert.equal(validateEquipmentImport(payload)[0][0].locked,false)
  assert.deepEqual(Object.keys(payload),['version','equipments'])
})
