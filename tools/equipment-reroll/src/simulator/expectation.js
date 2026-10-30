// SPDX-License-Identifier: GPL-3.0-or-later
// Desktop boundary; numerical solvers retain their MIT notices.
import { solve } from '../zbx/affix_solver.mjs'
import { solveCharacter } from './affix_4gear_solver.mjs'
export function simulationExpectation({type,current,target,options = {}}, onProgress = () => {}) {
  if (!['single','character'].includes(type)) throw new Error('未知模拟器模式')
  const ruleVersion = options.ruleVersion === 'global' ? 'global' : 'cn'
  const settings = { epsilon:1e-9, maxIterations:10000, digits:6, ruleVersion, p:0.1 }
  let calls=0
  const checkedSolve = (...args) => {
    if (++calls > 32) throw new Error('候选子求解超过 32 次预算，理论值不可用；仍可手动模拟，不切换其他算法')
    const result = solve(...args)
    if (ruleVersion === 'global' && result.modelInfo?.bandTierUsed !== true) throw new Error('上游触发档位平均近似，本次不采用理论值；仍可手动模拟')
    if (Object.values(result.expected || {}).some(v => !Number.isFinite(v) || v < 0)) throw new Error('期望资源无效')
    return result
  }
  const result = type === 'single' ? checkedSolve(current,target,settings) : solveCharacter(current,target,{...settings,maxGlobalStates:500000,maxTransitionsPerAction:500000,exact:false,usePrecise:true,solve:checkedSolve,onProgress})
  if (!result.expected || ['stoneOnly','withKeysStone','withKeysKeys'].some(k => !Number.isFinite(result.expected[k]) || result.expected[k] < 0)) throw new Error('没有有效的有限期望')
  return result
}
