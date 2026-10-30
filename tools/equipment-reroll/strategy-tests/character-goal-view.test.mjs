import test from 'node:test'
import assert from 'node:assert/strict'
import { describeGearGoals } from '../src/strategy/character-goal-view.js'

test('per-gear goals show names, percentages and independent progress against the input snapshot', () => {
  const board = [{stat:'优越代码伤害增加',tier:3},{stat:'攻击力增加',tier:5},{stat:'命中率增加',tier:4}]
  const before = structuredClone(board), result = describeGearGoals('uy4,gj4,mz4', board)
  assert.equal(result.state,'pending')
  assert.deepEqual(result.targets.map(t=>[t.stat,t.tier,t.value,t.currentTier,t.currentValue,t.met]),[
    ['优越代码伤害增加',4,'13.75%',3,'12.34%',false],
    ['攻击力增加',4,'6.88%',5,'7.59%',true],
    ['命中率增加',4,'6.88%',4,'6.88%',true],
  ])
  assert.deepEqual(result.targets.map(t=>t.slot),[1,2,3])
  assert.deepEqual(board,before)
})

test('unassigned, absent and unknown current data are not misrepresented as achieved', () => {
  assert.equal(describeGearGoals('',[]).state,'unassigned')
  assert.equal(describeGearGoals('gj1',[]).targets[0].met,false)
  assert.equal(describeGearGoals('gj1').targets[0].met,null)
  assert.equal(describeGearGoals('gj15',[{stat:'攻击力增加',tier:15}]).state,'met')
})

test('all nine supported effects use their own percentage ranges, including tier boundaries', () => {
  const expected = {uy:['9.54%','29.16%'],gj:['4.77%','14.63%'],dr:['27.84%','85.37%'],bs:['6.64%','20.36%'],bj:['2.30%','7.07%'],fy:['4.77%','14.63%'],mz:['4.77%','14.63%'],xs:['1.98%','6.09%'],xl:['4.77%','14.63%']}
  for (const [code,values] of Object.entries(expected)) assert.deepEqual([1,15].map(t=>describeGearGoals(code+t,[]).targets[0].value),values)
})

test('unsupported or damaged goal tokens never become guessed targets or success', () => {
  for (const tokens of ['gj0','gj16','unknown4','gj4,','gj4,gj5','bsbj4','gj4<mz4>']) {
    assert.deepEqual(describeGearGoals(tokens,[]),{state:'unknown',targets:[]})
  }
})
