// SPDX-License-Identifier: GPL-3.0-or-later
// GPL integration adapter around the separately attributed MIT zbx solver.
import { solveEquipment, validateInputs, STAT_NAMES } from '../calculator/engine.js'
import { solve as zbxSolve } from '../zbx/affix_solver.mjs'

export const STRATEGIES = Object.freeze({ STONE:'workshop-stone', KEYS:'zbx-keys' })
const CODES = Object.freeze({ '优越代码伤害增加':'uy', '攻击力增加':'gj', '最大装弹数增加':'dr',
  '暴击伤害增加':'bs', '暴击率增加':'bj', '防御力增加':'fy', '命中率增加':'mz', '蓄力速度增加':'xs', '蓄力伤害增加':'xl' })
const clone = value => structuredClone(value)

function validateLines(rows, count, label) {
  if (!Array.isArray(rows) || rows.length !== count) throw new Error(`${label}必须有 ${count} 个槽位`)
  for (const row of rows) {
    if (!row || !STAT_NAMES.includes(row.stat)) throw new Error(`${label}包含未知词条`)
    if (!Number.isInteger(row.tier) || (row.stat === '空词条' ? row.tier !== 0 : row.tier < 1 || row.tier > 15)) throw new Error(`${label}档位无效`)
  }
}
export function prepareSettings(input) {
  if (input.scope && input.scope !== 'single') throw new Error('本轮策略与变更对比仅支持单装备；四装备继续使用原 Workshop 全石头规划。')
  if (!Object.values(STRATEGIES).includes(input.strategy)) throw new Error('未知资源策略')
  if (!['cn-legacy','global-current'].includes(input.calculationRule)) throw new Error('未知游戏规则')
  if (!Array.isArray(input.targetInput) || input.targetInput.length < 1 || input.targetInput.length > 5) throw new Error('目标池应为 1～5 个槽位')
  validateLines(input.targetInput, input.targetInput.length, '目标池')
  const targets = input.targetInput.filter(row => row.stat !== '空词条').map(row => ({...row}))
  if (!targets.length) throw new Error('请至少设置 1 个目标词条。')
  const p = input.strategy === STRATEGIES.KEYS ? input.p : null
  if (input.strategy === STRATEGIES.KEYS && (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) throw new Error('秘钥阈值 p 必须是 0～1 的有效数字')
  return { strategy:input.strategy, calculationRule:input.calculationRule,
    zbxRule:input.calculationRule === 'global-current' ? 'global' : 'cn', p, targetInput:clone(input.targetInput),
    targets, targetSemantics:input.strategy === STRATEGIES.KEYS ? '所有非空目标必须达成' : 'Workshop 候选池与必选约束',
    objective:input.strategy === STRATEGIES.KEYS ? '字典序：先最小化石头，再在石头相同时最小化秘钥；不合并资源' : '最小化 Workshop 期望石头',
    ruleNote:input.strategy === STRATEGIES.KEYS
      ? (input.calculationRule === 'cn-legacy'
        ? 'zbx cn：允许重复抽取，也允许保留结果；不同于 Workshop 旧规则直接覆盖。秘钥收益只对照 zbx 同模型全石头基准。'
        : 'zbx global：排除原效果与原档位的完全重复，允许保留结果；采用上游压缩状态模型。')
      : (input.calculationRule === 'cn-legacy' ? 'Workshop 旧规则：直接覆盖' : 'Workshop 新规则：防完全重复，候选可保留'),
  }
}
export function checkBoard(initialInput, settings) {
  validateLines(initialInput, 3, '当前装备')
  const invalid = validateInputs(initialInput, settings.targetInput)
  if (invalid) throw new Error(invalid)
  if (settings.strategy === STRATEGIES.KEYS) {
    if (initialInput.some(row => row.forceKeep)) throw new Error('zbx 没有强制保留输入，本模式不能忽略该约束；请使用 Workshop 全石头模式。')
    if (settings.targets.length > 3) throw new Error('zbx 单装备只支持至多 3 个全部达成目标，不支持 Workshop 4～5 个候选选 3 个；请使用全石头模式。')
    if (initialInput.filter(row => row.flagged && row.stat !== '空词条').length > 2) throw new Error('zbx 最多支持 2 个永久石头锁')
  }
}
export function encodeZbx(initialInput, settings) {
  checkBoard(initialInput, settings)
  return { current:initialInput.map(row => row.stat === '空词条' ? '0wd0' : `${row.flagged ? 1 : 0}${CODES[row.stat]}${row.tier}`).join(','),
    target:settings.targets.map(row => `${CODES[row.stat]}${row.tier}`).join(',') }
}
export function describeZbxAction(action, unlock = []) {
  const pieces = unlock.map(slot => `免费解除 ${slot} 号位永久石头锁`)
  for (const token of String(action || '').split(',').filter(Boolean)) {
    if (/^s[1-3]$/.test(token)) pieces.push(`本次使用秘钥锁定 ${token.slice(1)} 号位（洗练后解除）`)
    else if (/^S[1-3]$/.test(token)) pieces.push(`使用石头永久锁定 ${token.slice(1)} 号位`)
    else if (token === 'xg') pieces.push('变更词条效果（洗名称）')
    else if (token === 'sz') pieces.push('变更词条数值')
    else throw new Error('未知上游动作：'+token)
  }
  return pieces.join(' → ') || '目标已经完成，无需继续消耗资源'
}
export function assertZbxResult(raw, settings) {
  const values = [raw?.expected?.stoneOnly, raw?.expected?.withKeysStone, raw?.expected?.withKeysKeys]
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('zbx 未返回有效的有限资源期望，本次结果不可使用')
  if (settings.zbxRule === 'global' && raw.modelInfo?.bandTierUsed !== true) throw new Error('zbx 已触发档位平均退化；本次不静默接受该近似，请降低目标或使用 Workshop。')
}

export async function solveResourceSingle(input, onProgress = () => {}, dependencies = {}) {
  const settings = prepareSettings(input)
  const board = clone(input.initialInput)
  checkBoard(board, settings)
  onProgress({ phase:'workshop', text:'正在计算 Workshop 全石头基准…' })
  const workshop = await (dependencies.workshopSolve || solveEquipment)({ initialInput:clone(board), targetInput:clone(settings.targetInput), calculationRule:settings.calculationRule })
  const baseline = { stones:workshop.exactSolution.value, keys:0, action:workshop.exactSolution.firstActionText }
  if (!Number.isFinite(baseline.stones)) throw new Error('Workshop 基准计算失败：没有有限期望')
  if (settings.strategy === STRATEGIES.STONE) return { settings, resources:{stones:baseline.stones,keys:0}, nextAction:baseline.action, workshop:baseline }

  const encoded = encodeZbx(board, settings)
  onProgress({ phase:'zbx', text:'正在按 zbx 阈值与字典序目标计算秘钥策略…' })
  const raw = (dependencies.zbxSolve || zbxSolve)(encoded.current, encoded.target, {epsilon:1e-9,maxIterations:10000,digits:6,ruleVersion:settings.zbxRule,p:settings.p})
  assertZbxResult(raw, settings)
  return { settings, resources:{stones:raw.expected.withKeysStone,keys:raw.expected.withKeysKeys},
    nextAction:describeZbxAction(raw.action,raw.preUnlock), workshop:baseline,
    zbx:{ stoneOnly:raw.expected.stoneOnly, stoneOnlyAction:describeZbxAction(raw.stoneOnlyAction,raw.stoneOnlyPreUnlock),
      action:raw.action, preUnlock:raw.preUnlock, expected:raw.expected, modelInfo:raw.modelInfo,
      stateCount:raw.stateCount, iterations:raw.iterations, current:encoded.current, target:encoded.target },
  }
}
export async function compareResourceSingle(input, onProgress = () => {}, dependencies = {}) {
  const fixed = clone(input)
  const settings = prepareSettings(fixed)
  checkBoard(fixed.beforeInput, settings)
  checkBoard(fixed.afterInput, settings)
  // Both fresh solves share this exact frozen configuration; never reuse old UI costs.
  const common = {scope:'single',strategy:settings.strategy,calculationRule:settings.calculationRule,p:settings.p,targetInput:clone(settings.targetInput)}
  const before = await solveResourceSingle({...clone(common),initialInput:clone(fixed.beforeInput)}, p => onProgress({...p,phase:'before',text:'洗练前：'+p.text}),dependencies)
  const after = await solveResourceSingle({...clone(common),initialInput:clone(fixed.afterInput)}, p => onProgress({...p,phase:'after',text:'洗练后：'+p.text}),dependencies)
  return {settings:clone(settings),before,after,delta:{stones:after.resources.stones-before.resources.stones,keys:after.resources.keys-before.resources.keys},
    note:'差值 = 洗练后剩余期望 − 洗练前剩余期望；不含已经花掉的石头或秘钥。',beforeInput:clone(fixed.beforeInput),afterInput:clone(fixed.afterInput)}
}
