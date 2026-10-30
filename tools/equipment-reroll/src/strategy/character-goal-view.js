// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only: decode the solver's per-gear thresholds without changing its plan.
import { ZBX_STAT_CODES } from './engine.js'
import { statTierText } from '../calculator/engine.js'

const statsByCode = Object.fromEntries(Object.entries(ZBX_STAT_CODES).map(([stat, code]) => [code, stat]))

export function describeGearGoals(subTargets, initialInput) {
  if (!subTargets?.trim()) return { state: 'unassigned', targets: [] }
  const targets = []
  for (const token of subTargets.split(',')) {
    const match = token.trim().match(/^([a-z]{2})(\d+)$/)
    const stat = match && statsByCode[match[1]], tier = Number(match?.[2])
    if (!stat || !Number.isInteger(tier) || tier < 1 || tier > 15 || targets.some(t => t.stat === stat)) {
      return { state: 'unknown', targets: [] }
    }
    const index = initialInput?.findIndex(row => row.stat === stat) ?? -1
    const currentTier = !Array.isArray(initialInput) ? null : index < 0 ? 0 : initialInput[index].tier
    targets.push({ stat, tier, value: statTierText(stat, tier), currentTier,
      currentValue: currentTier > 0 ? statTierText(stat, currentTier) : null,
      slot: index < 0 ? null : index + 1,
      met: currentTier === null ? null : currentTier >= tier })
  }
  return { state: targets.every(t => t.met === true) ? 'met' : 'pending', targets }
}
