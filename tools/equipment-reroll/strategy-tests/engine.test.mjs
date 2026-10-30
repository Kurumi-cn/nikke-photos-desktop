import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { solve } from '../src/zbx/affix_solver.mjs'
import { convertZbxSource } from '../../../desktop-scripts/zbx-module.mjs'
import { solveResourceSingle, compareResourceSingle, prepareSettings, encodeZbx, describeZbxAction, assertZbxResult } from '../src/strategy/engine.js'
import { solveEquipment } from '../src/calculator/engine.js'

const root=path.resolve(import.meta.dirname,'..')
const original=fs.readFileSync(path.join(root,'vendor/zbx/affix_solver.upstream.cjs'),'utf8')
const module={exports:{}}
const requireShim=()=>{throw Error('unexpected require')};requireShim.main=undefined
vm.runInNewContext(original,{module,require:requireShim,console})
const upstream=module.exports.solve
const plain=value=>JSON.parse(JSON.stringify(value))
const line=(stat='空词条',tier=0,flagged=false,forceKeep=false)=>({stat,tier,flagged,forceKeep})
const board=[line('防御力增加',1,true),line('攻击力增加',1),line()]
const targets=[line('攻击力增加',1,true),line('优越代码伤害增加',1,true)]
const base={scope:'single',strategy:'zbx-keys',calculationRule:'cn-legacy',p:0.1,initialInput:board,targetInput:targets}

test('MIT source is pinned; generated module changes packaging and output metadata only',()=>{
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'vendor/zbx/source.json')))
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),metadata.originalSha256)
  assert.equal(fs.readFileSync(path.join(root,'src/zbx/affix_solver.mjs'),'utf8'),convertZbxSource(original))
  assert.match(original,/return pImp > keyP/)
  assert.match(original,/pImp <= keyP/)
  const cache=path.resolve(root,'../../../codex temp/nikke-desktop/upstream-outpost/src/affix_solver.js')
  if(fs.existsSync(cache))assert.equal(fs.readFileSync(cache,'utf8'),original)
})

test('threshold, old/new draw rules, expected resources and actions match original zbx',()=>{
  const fixtures=[['0wd0,0wd0,0wd0','gj1'],['1fy1,0gj1,0wd0','gj1,uy1'],['0gj1,0wd0,0wd0','gj2'],['0gj1,0uy1,0dr1','gj1,uy1,dr1']]
  for(const ruleVersion of ['cn','global'])for(const p of [0,0.1,0.2,1])for(const [current,target]of fixtures){
    const options={epsilon:1e-9,maxIterations:10000,digits:6,ruleVersion,p}
    const expected=upstream(current,target,options)
    const actual=solve(current,target,options)
    const {modelInfo,...numeric}=actual
    assert.deepEqual(plain(numeric),plain(expected),`${current} ${target} ${ruleVersion} ${p}`)
    if(ruleVersion==='global')assert.equal(modelInfo.bandTierUsed,true)
    if(p===1){assert.ok(Math.abs(actual.expected.withKeysStone-actual.expected.stoneOnly)<1e-7);assert.equal(actual.expected.withKeysKeys,0);assert.ok(!/(^|,)s[1-3]/.test(actual.action))}
  }
})

test('adapter preserves permanent-lock unlock and key-lock action material',async()=>{
  const result=await solveResourceSingle(base)
  assert.match(result.nextAction,/免费解除 1 号位/)
  assert.match(result.nextAction,/秘钥锁定 2 号位/)
  assert.ok(result.resources.keys>0)
  assert.ok(result.resources.stones<result.zbx.stoneOnly)
  assert.deepEqual(describeZbxAction('S2,xg',[]),'使用石头永久锁定 2 号位 → 变更词条效果（洗名称）')
  assert.match(result.settings.ruleNote,/不同于 Workshop/)
  assert.deepEqual(encodeZbx(board,prepareSettings(base)),{current:'1fy1,0gj1,0wd0',target:'gj1,uy1'})
})

test('already satisfied returns zero and original Workshop full-stone remains unchanged',async()=>{
  const initialInput=[line('攻击力增加',1),line('优越代码伤害增加',1),line()]
  for(const strategy of ['workshop-stone','zbx-keys']){
    const result=await solveResourceSingle({...base,strategy,initialInput})
    assert.deepEqual(result.resources,{stones:0,keys:0})
    assert.match(result.nextAction,/完成/)
  }
  const initial=[line('攻击力增加',5,true),line('防御力增加',10,false,true),line()]
  const target=[line('攻击力增加',10,true)]
  const input={...base,strategy:'workshop-stone',initialInput:initial,targetInput:target}
  const source=structuredClone(input)
  const expected=await solveEquipment(input)
  const actual=await solveResourceSingle(input)
  assert.equal(actual.resources.stones,expected.exactSolution.value)
  assert.equal(actual.nextAction,expected.exactSolution.firstActionText)
  assert.deepEqual(input,source)
})

test('unsupported key constraints and four-equipment mode are rejected without dropping them',async()=>{
  const force=[line('防御力增加',1,false,true),line('攻击力增加',1),line()]
  await assert.rejects(solveResourceSingle({...base,initialInput:force}),/强制保留/)
  const four=['攻击力增加','优越代码伤害增加','暴击率增加','蓄力速度增加'].map(stat=>line(stat,1))
  await assert.rejects(solveResourceSingle({...base,targetInput:four}),/4～5/)
  await assert.rejects(solveResourceSingle({...base,scope:'global'}),/四装备/)
  for(const p of [-1,1.01,NaN,Infinity,'0.1'])await assert.rejects(solveResourceSingle({...base,p}),/阈值 p/)
  await assert.rejects(solveResourceSingle({...base,targetInput:[]}),/目标/)
  await assert.rejects(solveResourceSingle({...base,initialInput:[line('攻击力增加',1),line('攻击力增加',2),line()]}),/重复/)
  await assert.rejects(solveResourceSingle({...base,initialInput:[line('未知',1),line(),line()]}),/未知/)
})

test('comparison recalculates both boards with one settings snapshot, never spent costs',async()=>{
  const beforeInput=[line('攻击力增加',1),line(),line()]
  const afterInput=[line('攻击力增加',1),line('优越代码伤害增加',1),line()]
  for(const strategy of ['workshop-stone','zbx-keys'])for(const calculationRule of ['cn-legacy','global-current']){
    const input={...base,strategy,calculationRule,beforeInput,afterInput}
    const snapshot=structuredClone(input)
    const result=await compareResourceSingle(input)
    assert.deepEqual(result.before.settings,result.after.settings)
    assert.deepEqual(result.settings,result.before.settings)
    assert.equal(result.after.resources.stones,0)
    assert.equal(result.after.resources.keys,0)
    assert.equal(result.delta.stones,-result.before.resources.stones)
    assert.equal(result.delta.keys,result.before.resources.keys===0?0:-result.before.resources.keys)
    assert.match(result.note,/不含已经花掉/)
    assert.deepEqual(input,snapshot)
    const reversed=await compareResourceSingle({...input,beforeInput:afterInput,afterInput:beforeInput})
    assert.equal(reversed.delta.stones,-result.delta.stones)
    assert.equal(reversed.delta.keys===0?0:reversed.delta.keys,result.delta.keys===0?0:-result.delta.keys)
  }
})

test('stone/key tradeoffs stay separate, and identical p/rule/targets reach both solves',async()=>{
  let calls=[]
  const dep={workshopSolve:async()=>({exactSolution:{value:20,firstActionText:'基准'}}),zbxSolve:(current,target,options)=>{
    calls.push({current,target,options:structuredClone(options)})
    const after=current.includes('uy')
    return {expected:{stoneOnly:20,withKeysStone:after?9:10,withKeysKeys:after?2:1},action:'xg',preUnlock:[],stoneOnlyAction:'xg',stoneOnlyPreUnlock:[],modelInfo:{bandTierUsed:true},iterations:{},stateCount:1}
  }}
  const result=await compareResourceSingle({...base,beforeInput:board,afterInput:[line('攻击力增加',1),line('优越代码伤害增加',1),line()]},()=>{},dep)
  assert.deepEqual(result.delta,{stones:-1,keys:1})
  assert.deepEqual(calls[0].options,calls[1].options)
  assert.equal(calls[0].target,calls[1].target)
  assert.equal('score' in result,false)
})

test('impossible constraints, solver failure, non-convergence and band fallback produce no comparison',async()=>{
  const invalid=[line('攻击力增加',1,false,true),line(),line()]
  await assert.rejects(compareResourceSingle({...base,strategy:'workshop-stone',targetInput:[line('攻击力增加',10,true)],beforeInput:invalid,afterInput:invalid}),/低于目标/)
  await assert.rejects(solveResourceSingle(base,()=>{},{workshopSolve:async()=>{throw Error('基准失败')}}),/基准失败/)
  await assert.rejects(solveResourceSingle(base,()=>{},{zbxSolve:(cur,target,options)=>solve(cur,target,{...options,maxIterations:0})}),/未在 0 轮内收敛/)
  const fixed={...base,calculationRule:'global-current'}
  const raw=solve('0wd0,0wd0,0wd0','gj1',{ruleVersion:'global',bandTier:false})
  assert.throws(()=>assertZbxResult(raw,prepareSettings(fixed)),/退化/)
  let count=0
  await assert.rejects(compareResourceSingle({...base,beforeInput:board,afterInput:board},()=>{},{zbxSolve:()=>{if(++count===2)throw Error('后盘面计算失败');return {expected:{stoneOnly:1,withKeysStone:1,withKeysKeys:0},action:'xg',preUnlock:[],stoneOnlyAction:'xg',stoneOnlyPreUnlock:[],modelInfo:{bandTierUsed:true}}}}),/后盘面计算失败/)
})
