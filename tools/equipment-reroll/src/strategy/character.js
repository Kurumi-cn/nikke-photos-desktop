// SPDX-License-Identifier: GPL-3.0-or-later
// Boundary for the pinned MIT character solver; no probability/solver changes.
import { solveCharacter } from '../simulator/affix_4gear_solver.mjs'
import { solve } from '../zbx/affix_solver.mjs'
import { prepareSettings, checkBoard, encodeZbx, assertZbxResult, describeZbxAction } from './engine.js'

export const CHARACTER_NOTE = '近似结果：zbx 角色级候选分配，不是联合 MDP，不保证全局最优。目标为四件装备的档位之和，不等同于 Workshop 的最低条数或合计百分比。'

export function prepareCharacter(input) {
  if (input.scope !== 'character' || input.strategy !== 'zbx-keys') throw new Error('四装备增强模式必须使用自订秘钥策略')
  if (!Array.isArray(input.equipments) || input.equipments.length !== 4) throw new Error('必须提供四件装备')
  if (!Array.isArray(input.characterTargets) || input.characterTargets.length < 1 || input.characterTargets.length > 3) throw new Error('zbx 四装备只支持 1～3 个全部达成目标；不支持候选选 3、合并目标或 Workshop 全局条件')
  const targets = structuredClone(input.characterTargets)
  if (new Set(targets.map(t => t.stat)).size !== targets.length) throw new Error('角色目标词条不能重复')
  for (const t of targets) if (!Number.isInteger(t.totalTier) || t.totalTier < 1 || t.totalTier > 60) throw new Error('角色目标总档位必须为 1～60 的整数')
  const settings = prepareSettings({...input, scope:'single', targetInput:targets.map(t => ({stat:t.stat,tier:1,flagged:true}))})
  const current = input.equipments.map(e => {
    if (e.skipped) throw new Error('zbx 角色求解不支持“不跑”约束，请取消勾选或使用 Workshop')
    checkBoard(e.initialInput, settings)
    return encodeZbx(e.initialInput, settings).current
  }).join('/')
  const target = targets.map(t => encodeZbx(input.equipments[0].initialInput, {...settings,targets:[{stat:t.stat,tier:t.totalTier}]}).target).join(',')
  return {settings:{...settings,scope:'character',characterTargets:targets},current,target}
}

export function solveResourceCharacter(input, onProgress = () => {}, dependencies = {}) {
  const {settings,current,target} = prepareCharacter(input)
  // The upstream character path explicitly asks for bandTier:false. Preserve the
  // existing global-rule guard instead of silently accepting its averaged model.
  if (settings.zbxRule === 'global') throw new Error('zbx 四装备新规则会使用档位平均近似，当前限制仍保留；本次无法计算。可明确切换旧规则或 Workshop。')
  let calls = 0
  const checkedSolve = (...args) => {
    if (++calls > 32) throw new Error('四装备候选求解超过 32 次预算，本次无法完成；请降低目标。未切换其他算法。')
    const raw = (dependencies.solve || solve)(...args)
    assertZbxResult(raw, settings)
    return raw
  }
  onProgress({text:'正在计算 zbx 四装备候选分配近似…'})
  const raw = (dependencies.solveCharacter || solveCharacter)(current,target,{
    epsilon:1e-9,maxIterations:10000,digits:6,p:settings.p,ruleVersion:settings.zbxRule,
    exact:false,usePrecise:true,maxGlobalStates:24000,maxTransitionsPerAction:300000,
    solve:checkedSolve,onProgress:p => onProgress({...p,text:p.gear ? `近似求解：装备 ${p.gear}/4` : '正在比较候选分配…'}),
  })
  assertZbxResult(raw, settings)
  const alreadyMet=settings.characterTargets.every(t=>input.equipments.reduce((sum,e)=>sum+e.initialInput.filter(r=>r.stat===t.stat).reduce((n,r)=>n+r.tier,0),0)>=t.totalTier)
  const completed=alreadyMet && raw.action==='d0' && Object.values(raw.expected).every(v=>v===0)
  if (!completed && (raw.approx !== true || raw.graph?.mode !== 'decomposed')) throw new Error('角色求解路径与预期不符，本次结果不可使用')
  return {settings,approx:!completed,note:completed?'当前四件装备已达成全部总档位目标，无需洗练；剩余资源为 0。':CHARACTER_NOTE,expected:raw.expected,graph:raw.graph,current,target,
    gears:raw.gearActions.map(g => ({...g,nextAction:describeCharacterTokens(g.keyTokens),stoneAction:describeCharacterTokens(g.stoneTokens)}))}
}

export function describeCharacterTokens(tokens) {
  return (tokens || []).map(t => {
    if (t === 'd0') return '该件子目标已完成，无需洗练'
    const unlock = t.match(/^([1-4])u([1-3])$/)
    if (unlock) return `装备 ${unlock[1]}：免费解除 ${unlock[2]} 号位永久石头锁`
    const action = t.match(/^([1-4])(s[1-3]|S[1-3]|xg|sz)$/)
    if (!action) throw new Error('未知四装备动作：'+t)
    return `装备 ${action[1]}：${describeZbxAction(action[2])}`
  }).join(' → ')
}
