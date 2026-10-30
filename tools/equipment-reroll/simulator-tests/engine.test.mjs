import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import {harness,snapshot,fixture} from './harness.mjs'
import {simulationExpectation} from '../src/simulator/expectation.js'
const plain=x=>JSON.parse(JSON.stringify(x))
const base=new URL('../',import.meta.url)
const tick=()=>new Promise(r=>setImmediate(r))

test('original constants/functions and vendor source SHA stay unchanged',()=>{
  const ref=harness(true),local=harness()
  for(const key of ['EFFECT_WEIGHTS','TIER_P','SLOT_GET','WASH_STONE','LOCK_STONE','LOCK_KEY'])assert.deepEqual(plain(local.a[key]),plain(ref.a[key]))
  for(const key of ['randomTier','randomTierExcept','randomTierAvoidSame','randomEffect','sampleTargetEffects','generateGear','generateTargets','goalMetFor','setLockWant','lockPlan','washCost','lockCost','canCheckLock','canWashSz','unlockSlot','resolveWash','keepAndWashAgain','buildCurrent','cloneCustomGear'])assert.equal(local.a[key].toString(),ref.a[key].toString(),key)
  assert.equal(local.a.startWash.toString(),ref.a.startWash.toString().replace('  playWashSound()\n',''))
  const m=JSON.parse(fs.readFileSync(new URL('vendor/zbx/simulator-source.json',base)))
  for(const f of m.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('vendor/zbx/'+f.name,base))).digest('hex'),f.sha256)
  const raw=fs.readFileSync(new URL('vendor/zbx/affix_4gear_solver.upstream.cjs',base),'utf8')
  const generated=fs.readFileSync(new URL('src/simulator/affix_4gear_solver.mjs',base),'utf8')
  assert.equal(generated.split('\n').slice(2).join('\n'),raw.replace(/    if \(typeof require === 'function'\) \{\r?\n      return require\('\.\/affix_solver.js'\)\.solve;\r?\n    \}\r?\n/,'').replace(/module\.exports = \{\s*solveCharacter,\s*\};\s*$/,'export { solveCharacter };\n'))
})

test('custom equipment validation adds first-row guard and still allows wholly empty equipment',()=>{
  const h=harness(),a=h.a
  a.customTargets.value=[{effects:['gj'],tier:1}]
  assert.equal(a.validateCustom(),null)
  a.customSingleGear.value.slots[1]={effect:'gj',tier:1}
  assert.match(a.validateCustom(),/第一条/)
  a.customSingleGear.value.slots[0]={effect:'gj',tier:1}
  assert.match(a.validateCustom(),/重复/)
  a.customSingleGear.value.slots[1]={effect:'fy',tier:1}
  assert.equal(a.validateCustom(),null)
})

test('seeded original parity: generation and 3200 wash actions across both rules, locks, keep/apply',()=>{
  for(const rule of ['cn','global'])for(const seed of [3,42,7890,20261025]){
    const ref=harness(true,seed),local=harness(false,seed)
    ref.props.ruleVersion=local.props.ruleVersion=rule
    for(let i=0;i<40;i++){
      assert.deepEqual(plain(local.a.generateGear()),plain(ref.a.generateGear()))
      assert.deepEqual(plain(local.a.generateTargets(3,15)),plain(ref.a.generateTargets(3,15)))
      assert.deepEqual(plain(local.a.generateTargets(5,60)),plain(ref.a.generateTargets(5,60)))
    }
    fixture(ref);fixture(local)
    for(let i=0;i<400;i++){
      for(const h of [ref,local]){
        h.a.won.value=false
        for(let si=0;si<3;si++)if(i%7===0)h.a.unlockSlot(0,si)
        h.a.setLockWant(0,i%3,i%2?'stone':'key',i%4!==0)
        h.a.startWash(0,i%2 && h.a.canWashSz(h.a.gears.value[0])?'sz':'xg')
      }
      assert.deepEqual(snapshot(local),snapshot(ref),rule+' wash '+i)
      for(const h of [ref,local])h.a.resolveWash(i%3!==0)
      assert.deepEqual(snapshot(local),snapshot(ref))
    }
  }
})

test('tier probability boundaries, exclusion and initial/wash slot distinction agree with source',()=>{
  const h=harness();let sum=0
  for(let t=1;t<=15;t++){const p=h.a.TIER_P[t];h.random([sum+p/2]);assert.equal(h.a.randomTier(),t);sum+=p}
  assert.ok(Math.abs(sum-1)<1e-12)
  h.random([0]);assert.equal(h.a.randomEffect(), 'uy')
  h.random([.100001]);assert.equal(h.a.randomEffect(), 'gj')
  for(let t=1;t<=15;t++){h.random([0]);assert.notEqual(h.a.randomTierExcept(t),t)}
  // second/third INITIAL slots both use .5 (not wash .3).
  h.random([.1,.1,.4,.2,.2,.4,.3,.3]);const g=h.a.generateGear();assert.notEqual(g.slots[2].effect,'wd')
})

test('lock billing is deferred, stone first, key one-shot, keep/repeat and free unlock',()=>{
  const h=harness();fixture(h);const a=h.a
  a.setLockWant(0,0,'key',true);a.setLockWant(0,1,'stone',true)
  assert.equal(a.stonesUsed.value,0);assert.equal(a.keysUsed.value,0)
  assert.equal(a.canCheckLock(a.gears.value[0],2,'key'),false)
  assert.equal(a.lockCost(a.gears.value[0],0,'key'),30)
  a.startWash(0,'sz');assert.equal(a.stonesUsed.value,5);assert.equal(a.keysUsed.value,30)
  assert.equal(a.pendingWash.value.lockStone,2);assert.equal(a.pendingWash.value.cost,3)
  a.resolveWash(false);assert.deepEqual(plain(a.gears.value[0].locks),{'1':'stone'});assert.equal(a.gears.value[0].want[0],'key')
  a.startWash(0,'sz');a.keepAndWashAgain();assert.equal(a.stonesUsed.value,11);assert.equal(a.keysUsed.value,90)
  a.resolveWash(true);a.unlockSlot(0,1);assert.equal(a.stonesUsed.value,11);assert.equal(a.keysUsed.value,90)
  assert.deepEqual(plain(a.gears.value[0].locks),{})
  const two=harness();fixture(two);two.a.setLockWant(0,0,'key',true);two.a.setLockWant(0,1,'key',true);two.a.startWash(0,'xg');assert.equal(two.a.keysUsed.value,50);assert.equal(two.a.stonesUsed.value,3)
  const stones=harness();fixture(stones);stones.a.setLockWant(0,0,'stone',true);stones.a.setLockWant(0,1,'stone',true);stones.a.startWash(0,'xg');assert.equal(stones.a.stonesUsed.value,8);assert.equal(stones.a.keysUsed.value,0)
})

test('empty first modification fixed tier11 and mandatory apply; normal keep and target completion',()=>{
  const h=harness(),a=h.a;a.started.value=true;a.gears.value=[a.blankGear()];a.targets.value=[{effects:['uy'],tier:11}];h.random([0,0,.9,.9]);a.startWash(0,'xg')
  assert.equal(a.pendingWash.value.forceApply,true);assert.equal(a.pendingWash.value.rows[0].new.tier,11)
  a.resolveWash(false);assert.equal(a.gears.value[0].slots[0].effect,'uy');assert.equal(a.won.value,true);assert.equal(a.stonesUsed.value,1)
  a.exitGame();assert.equal(a.started.value,false);assert.equal(a.stonesUsed.value,0);assert.equal(a.keysUsed.value,0);assert.equal(a.pendingWash.value,null)
})

test('custom inputs, merged targets, initial locks, validation and four-gear goal totals',async()=>{
  const h=harness(),a=h.a;a.simMode.value='custom';a.customSingleGear.value={slots:[{effect:'gj',tier:7},{effect:'uy',tier:3},{effect:'wd',tier:0}],locks:{0:'stone'},want:{}}
  a.customTargets.value=[{effects:['gj','bs'],tier:7},{effects:['uy'],tier:3}]
  assert.equal(a.validateCustom(),null);a.startCustomSimulation();h.workers.at(-1).finish();await tick();assert.equal(a.won.value,true);assert.equal(a.stonesUsed.value,0);assert.equal(a.gears.value[0].locks[0],'stone')
  a.gears.value[0].slots[0].tier=1;assert.equal(a.customSingleGear.value.slots[0].tier,7)
  a.restartGame();h.workers.at(-1).finish();await tick();assert.equal(a.gears.value[0].slots[0].tier,7)
  a.customTargets.value=[{effects:['gj'],tier:16}];assert.match(a.validateCustom(),/1~15/)
  a.customTargets.value=[{effects:['gj'],tier:1},{effects:['gj'],tier:1}];assert.match(a.validateCustom(),/重复/)
  a.customTargets.value=[];assert.match(a.validateCustom(),/至少/)
  a.mode.value='character';a.customTargets.value=[{effects:['gj'],tier:60},{effects:['uy'],tier:60},{effects:['dr'],tier:60},{effects:['fy'],tier:1}];assert.match(a.validateCustom(),/不满足/)
  const gear=()=>({slots:[{effect:'gj',tier:5},{effect:'uy',tier:2},{effect:'wd',tier:0}],locks:{},want:{}})
  assert.equal(a.goalMetFor([gear(),gear(),gear(),gear()],[{effects:['gj'],tier:20}]),true)
  assert.equal(a.goalMetFor([gear(),gear(),gear(),gear()],[{effects:['gj'],tier:21}]),false)
})

test('random start, continue, restart, reset and stale/error/timeout expectation lifecycle',async()=>{
  const h=harness(false,7890),a=h.a;const p=a.startSimulation();assert.equal(a.started.value,true);assert.equal(a.expectLoading.value,true)
  h.workers.at(-1).finish();await p;assert.equal(a.won.value,false);assert.ok(a.targets.value.length)
  a.startWash(0,'xg');a.resolveWash(false);assert.equal(a.stonesUsed.value,1)
  const restart=a.startSimulation();h.workers.at(-1).fail();await restart;assert.match(a.expectError.value,/失败/);assert.equal(a.started.value,true);assert.equal(a.stonesUsed.value,0)
  const waiting=a.startSimulation();const worker=h.workers.at(-1);a.exitGame();await waiting;assert.equal(a.started.value,false);assert.equal(a.expectation.value,null);assert.equal(worker.dead,true)
  const timeout=a.startSimulation();[...h.timers.values()].at(-1)();await timeout;assert.match(a.expectError.value,/60 秒/);assert.equal(a.started.value,true);a.startWash(0,'xg');assert.equal(a.dialogVisible.value,true)
  a.exitGame();assert.equal(h.timers.size,0)
})

test('single and four-gear expectation wrappers exactly match original CJS default path',()=>{
  const one={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('vendor/zbx/affix_solver.upstream.cjs',base),'utf8'),{module:one,require:Object.assign(()=>{throw Error('unexpected require')},{main:null}),console})
  const four={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('vendor/zbx/affix_4gear_solver.upstream.cjs',base),'utf8'),{module:four,console})
  const opts={epsilon:1e-9,maxIterations:10000,digits:6,p:.1}
  for(const ruleVersion of ['cn','global'])for(const [current,target] of [['0gj1,0wd0,0wd0','gj1'],['0fy1,0wd0,0wd0','gj1'],['1gj1,0uy1,0wd0','gj1,uy2'],['0fy1,0wd0,0wd0','gjuy1']]){
    const expected=one.exports.solve(current,target,{...opts,ruleVersion}),actual=simulationExpectation({type:'single',current,target,options:{ruleVersion}})
    assert.equal(actual.cost,expected.cost);assert.equal(actual.action,expected.action);assert.deepEqual(plain(actual.expected),plain(expected.expected))
  }
  for(const ruleVersion of ['cn','global']){
    const current=Array(4).fill('0gj1,0wd0,0wd0').join('/'),target='gj5'
    const expected=four.exports.solveCharacter(current,target,{...opts,ruleVersion,maxGlobalStates:500000,maxTransitionsPerAction:500000,usePrecise:true,solve:one.exports.solve})
    if(ruleVersion==='global'){assert.throws(()=>simulationExpectation({type:'character',current,target,options:{ruleVersion}}),/档位平均/);continue}
    const actual=simulationExpectation({type:'character',current,target,options:{ruleVersion}})
    assert.equal(actual.approx,true);assert.equal(actual.cost,expected.cost);assert.equal(actual.action,expected.action);assert.deepEqual(plain(actual.expected),plain(expected.expected))
  }
  assert.throws(()=>simulationExpectation({type:'bad'}),/未知/)
  assert.throws(()=>simulationExpectation({type:'single',current:'bad',target:'gj1'}))
})

