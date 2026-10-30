import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {prepareCharacter,solveResourceCharacter,describeCharacterTokens} from '../src/strategy/character.js'
import {runCalculatorWorker} from '../src/calculator/workerClient.js'
import {Worker} from 'node:worker_threads'

const one={exports:{}},four={exports:{}}
vm.runInNewContext(fs.readFileSync(new URL('../vendor/zbx/affix_solver.upstream.cjs',import.meta.url),'utf8'),{module:one,require:Object.assign(()=>{throw Error('unexpected require')},{main:null}),console})
vm.runInNewContext(fs.readFileSync(new URL('../vendor/zbx/affix_4gear_solver.upstream.cjs',import.meta.url),'utf8'),{module:four,console})
const line=(stat='空词条',tier=0,flagged=false)=>({stat,tier,flagged,forceKeep:false})
const fixture=(variant=0)=>({scope:'character',strategy:'zbx-keys',p:.1,calculationRule:'cn-legacy',characterTargets:[{stat:'攻击力增加',totalTier:variant===2?14:5}],equipments:Array.from({length:4},(_,i)=>({skipped:false,initialInput:variant===2?[line('攻击力增加',i===0?10:1,i===0),line('优越代码伤害增加',1),line()]:[line('攻击力增加',1),line('防御力增加',1,variant===1&&i===3),line()]}))})
const plain=x=>JSON.parse(JSON.stringify(x))

test('character resources, assignments and per-gear actions match pinned CJS default chain',()=>{
  for(const variant of [0,1,2])for(const p of [0,.1,1]) {
    const input={...fixture(variant),p},before=structuredClone(input)
    const {current,target}=prepareCharacter(input)
    const original=four.exports.solveCharacter(current,target,{epsilon:1e-9,maxIterations:10000,digits:6,ruleVersion:'cn',p,usePrecise:true,solve:one.exports.solve})
    const actual=solveResourceCharacter(input)
    assert.deepEqual(actual.expected,plain(original.expected))
    assert.deepEqual(actual.gears.map(({nextAction,stoneAction,...g})=>g),plain(original.gearActions))
    assert.equal(actual.approx,true);assert.match(actual.note,/不是联合 MDP/)
    assert.deepEqual(input,before)
    if(p===1){assert.equal(actual.expected.withKeysKeys,0);assert.ok(Math.abs(actual.expected.withKeysStone-actual.expected.stoneOnly)<1e-6)}
  }
})

test('four-gear boundary refuses unsupported constraints, invalid targets and global averaged path',()=>{
  const completed=fixture();completed.characterTargets[0].totalTier=4
  assert.deepEqual(solveResourceCharacter(completed).expected,{stoneOnly:0,withKeysStone:0,withKeysKeys:0})
  assert.equal(solveResourceCharacter(completed).approx,false)
  const checks=[
    [x=>x.equipments[0].initialInput[0].forceKeep=true,/强制保留/],
    [x=>x.equipments[0].skipped=true,/不跑/],
    [x=>x.characterTargets.push(...Array(3).fill({stat:'优越代码伤害增加',totalTier:1})),/1～3/],
    [x=>x.characterTargets[0].totalTier=61,/1～60/],
    [x=>x.characterTargets.push(x.characterTargets[0]),/重复/],
    [x=>x.p=2,/阈值/],
    [x=>x.calculationRule='global-current',/档位平均/],
    [x=>x.equipments[0].initialInput[2]=line('攻击力增加',1),/重复/],
  ]
  for(const [mutate,pattern] of checks){const input=fixture();mutate(input);assert.throws(()=>solveResourceCharacter(input),pattern)}
  assert.equal(describeCharacterTokens(['4u1','4s2','4sz']),'装备 4：免费解除 1 号位永久石头锁 → 装备 4：本次使用秘钥锁定 2 号位（洗练后解除） → 装备 4：变更词条数值')
})

test('budget, nonconvergence, invalid costs and unexpected path fail without algorithm fallback',()=>{
  const raw={expected:{stoneOnly:1,withKeysStone:1,withKeysKeys:1}}
  assert.throws(()=>solveResourceCharacter(fixture(),()=>{},{solve:()=>raw,solveCharacter:(c,t,o)=>{for(let i=0;i<33;i++)o.solve();}}),/32 次预算/)
  assert.throws(()=>solveResourceCharacter(fixture(),()=>{},{solve:()=>{throw Error('未收敛')}}),/未收敛/)
  assert.throws(()=>solveResourceCharacter(fixture(),()=>{},{solve:()=>({expected:{stoneOnly:Infinity}})}),/有限/)
  assert.throws(()=>solveResourceCharacter(fixture(),()=>{},{solveCharacter:()=>({...raw,approx:false})}),/路径/)
})

test('resourceCharacter runs in the shared cancellable Worker with isolated cloned input',async()=>{
  const factory=()=>{
    const native=new Worker(new URL('../tests/fixtures/calculator-worker-node.mjs',import.meta.url))
    const bridge={postMessage:x=>native.postMessage(x),terminate:()=>native.terminate()}
    native.on('message',data=>bridge.onmessage({data}));native.on('error',e=>bridge.onerror({message:e.message,preventDefault(){}}))
    return bridge
  }
  const input=fixture(),before=structuredClone(input)
  const result=await runCalculatorWorker('resourceCharacter',input,()=>{},factory)
  assert.equal(result.gears.length,4);assert.equal(result.approx,true);assert.deepEqual(input,before)
})
