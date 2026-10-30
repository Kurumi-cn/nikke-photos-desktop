import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as local from '../tools/equipment-reroll/src/calculator/engine.js'

const root = path.resolve(import.meta.dirname, '..')
const tool = path.join(root, 'tools/equipment-reroll')
const cache = process.env.NIKKE_CACHE_DIR || path.resolve(root, '../codex temp/nikke-desktop')
const upstreamRoot = process.env.WORKSHOP_UPSTREAM_DIR || path.join(cache, 'upstream-workshop')
const upstreamFile = path.join(upstreamRoot, 'src/calculator/engine.js')
assert.ok(fs.existsSync(upstreamFile), '直接对照需要缓存中的上游源码；见 tools/equipment-reroll/UPSTREAM.md')
const upstream = await import(pathToFileURL(upstreamFile).href)
const manifest = JSON.parse(fs.readFileSync(path.join(tool, 'vendor/algorithm-sha256.json')))
for (const [name, expected] of Object.entries(manifest.files)) {
  for (const base of [path.join(tool, 'src/calculator'), path.join(upstreamRoot, 'src/calculator')]) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(base, name))).digest('hex'), expected, `${base}/${name}`)
  }
}

const fixtures = JSON.parse(fs.readFileSync(path.join(tool, 'tests/fixtures/calculator-worker-baseline.json')))
const line = (stat = '空词条', tier = 0, flagged = false, forceKeep = false) => ({ stat, tier, flagged, forceKeep })
const report = { upstreamCommit: manifest.commit, unchangedModules: Object.keys(manifest.files), cases: [], exceptions: [] }
const summarize = ({ exactSolution: s }) => ({ value:s.value, action:s.firstActionText, states:s.stateCount, iterations:s.iterations, residual:s.residual, rule:s.calculationRule, stages:s.policyStagePreview })
for (const input of [...fixtures, ...['cn-legacy', 'global-current'].map(calculationRule => ({
  name:'two mandatory targets', calculationRule, initialInput:[line('攻击力增加', 5), line(), line()],
  targetInput:[line('攻击力增加', 1, true), line('优越代码伤害增加', 1, true)],
}))]) {
  const actual = await local.solveEquipment(input)
  const expected = await upstream.solveEquipment(input)
  assert.deepEqual(summarize(actual), summarize(expected), input.name)
  if (input.expected) {
    assert.ok(Math.abs(actual.exactSolution.value - input.expected.value) < 1e-7)
    assert.equal(actual.exactSolution.firstActionText, input.expected.firstActionText)
  }
  assert.ok(actual.exactSolution.policyData)
  report.cases.push({ name:input.name, ...summarize(actual) })
}

for (const calculationRule of ['cn-legacy', 'global-current']) {
  const input = { calculationRule,
    activeEquipments:[0,1,2,3].map(index => ({index,label:`装备${index + 1}`,initialInput:[line(),line(),line()]})),
    config:{ conditions:[{stat:'攻击力增加',minCount:4,minTotal:22,minTotalBasis:2200}],requiredLines:4 },
  }
  const actual = await local.solveGlobal(input)
  const expected = await upstream.solveGlobal(input)
  const summary = r => ({ value:r.bestResult.totalExpectedCost,plan:r.bestResult.plan,
    equipment:r.bestResult.equipmentResults.map(e => ({index:e.index,...summarize({exactSolution:e.exactSolution})})),
    candidates:r.candidateCount,evaluated:r.evaluatedCount,stats:r.optimizationStats })
  assert.deepEqual(summary(actual),summary(expected))
  const assigned = actual.bestResult.plan.targetsByEquipment.flat()
  assert.equal(assigned.length,4)
  assert.ok(assigned.reduce((sum,t)=>sum+local.statTierBasisPoints(t.stat,t.tier),0)>=2200)
  report.cases.push({name:'four equipment candidate allocation',rule:calculationRule,...summary(actual)})
}

for (const input of [
  {name:'empty targets',initialInput:[line(),line(),line()],targetInput:[]},
  {name:'duplicate input',initialInput:[line('攻击力增加',1),line('攻击力增加',2),line()],targetInput:[line('攻击力增加',1,true)]},
  {name:'forced below mandatory tier',initialInput:[line('攻击力增加',1,false,true),line(),line()],targetInput:[line('攻击力增加',10,true)]},
]) {
  let reference
  await assert.rejects(upstream.solveEquipment(input), error => { reference=error.message;return true })
  await assert.rejects(local.solveEquipment(input), error => error.message===reference)
  report.exceptions.push({name:input.name,message:reference})
}
const impossible = {activeEquipments:[{index:0,label:'头部',initialInput:[line(),line(),line()]}],config:{conditions:[{stat:'攻击力增加',minCount:2,minTotalBasis:0}],requiredLines:2}}
let errorText
await assert.rejects(upstream.solveGlobal(impossible),e=>{errorText=e.message;return true})
await assert.rejects(local.solveGlobal(impossible),e=>e.message===errorText)
report.exceptions.push({name:'impossible four-equipment condition',message:errorText})

// Fault injection exercises production guard branches without expensive runaway work.
// Only ephemeral data-URL test modules have reduced limits; shipped source remains byte-identical.
for (const [name, from, to, expected] of [
  ['state-limit guard (test-only reduced budget)','records.size > 24000','records.size > 1',/超过 24,000/],
  ['non-convergence guard (test-only zero iterations)','const maxIterations = 20000','const maxIterations = 0',/未收敛/],
]) {
  const messages=[]
  for (const file of [path.join(tool,'src/calculator/engine.js'),upstreamFile]) {
    let code=fs.readFileSync(file,'utf8')
    assert.ok(code.includes(from))
    code=code.replace(from,to).replace(/from "(\.\/[^"]+)"/g,(_,rel)=>`from "${pathToFileURL(path.resolve(path.dirname(file),rel)).href}"`)
    const injected=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
    await assert.rejects(injected.solveEquipment(fixtures[0]),e=>{messages.push(e.message);return expected.test(e.message)})
  }
  assert.equal(messages[0],messages[1])
  report.exceptions.push({name,message:messages[0],faultInjection:true})
}
fs.mkdirSync(cache,{recursive:true})
fs.writeFileSync(path.join(cache,'workshop-algorithm-report.json'),JSON.stringify(report,null,2))
console.log(`Workshop 对照通过：${report.cases.length} 组计算，${report.exceptions.length} 组异常；${report.unchangedModules.length} 个模块哈希与固定上游一致。`)
