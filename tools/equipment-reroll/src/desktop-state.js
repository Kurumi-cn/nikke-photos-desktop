// SPDX-License-Identifier: GPL-3.0-or-later
// Desktop integration only. This module never changes solver inputs or probabilities.
import { STAT_NAMES } from './calculator/engine.js'
import { normalizeCalculationRule } from './calculator/calculationRules.js'
import { installCharacterImport } from './character-import.js'

export const DRAFT_KEY = 'nikke-tools:workshop:draft:v1'
const MODES = ['single-equipment', 'manual-four-equipment']
const lines = (value, count) => Array.from({ length: count }, (_, i) => {
  const row = value?.[i]
  const stat = STAT_NAMES.includes(row?.stat) ? row.stat : '空词条'
  return { stat, tier: stat === '空词条' ? 0 : Math.max(1, Math.min(15, Math.trunc(Number(row?.tier) || 10))),
    flagged: !!row?.flagged, forceKeep: !!row?.forceKeep }
})
const fill = (api, element, value, count) => api.fillRows(element, lines(value, count).map(line => ({ ...line, locked: line.flagged })))

export async function installDesktopState(api) {
  let draft = {}
  let restoring = true
  let currentMode = 'single-equipment'
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {} } catch { /* Bad drafts use defaults. */ }
  if (typeof draft !== 'object' || Array.isArray(draft)) draft = {}

  function restoreFour() {
    const sections = [...api.characterEquipmentMode.querySelectorAll('.character-equipment-slot')]
    sections.forEach((section, index) => {
      const item = draft.four?.[index]
      if (!item) return
      fill(api, section.querySelector('.equipment-current-rows'), item.initialInput, 3)
      fill(api, section.querySelector('.equipment-target-rows'), item.targetInput, 5)
      const skipped = section.querySelector('.equipment-skip-input')
      skipped.checked = !!item.skipped
      api.setEquipmentSkipped(section, skipped.checked)
    })
  }
  function restoreConditions() {
    if (!Array.isArray(draft.conditions)) return
    api.globalConditionRows.replaceChildren()
    draft.conditions.slice(0, 6).filter(item => STAT_NAMES.includes(item?.stat) && item.stat !== '空词条')
      .forEach(item => api.addGlobalCondition({ stat:item.stat, minCount:Number(item.minCount) || 0, minTotal:Number(item.minTotal) || 0 }))
  }
  function capture() {
    if (restoring) return
    draft.version = 1
    draft.mode = currentMode
    draft.rule = api.calculationRuleSelect.value
    draft.submode = api.calculationModeSelect.value
    if (currentMode === 'manual-four-equipment') draft.fourMode = api.calculationModeSelect.value
    draft.single = { initial:api.readRows(api.initialRows), targets:api.readRows(api.targetRows) }
    if (api.characterEquipmentMode.querySelector('.character-equipment-slot')) draft.four = api.readCharacterEquipmentInputs()
    draft.conditions = [...api.globalConditionRows.querySelectorAll('.global-condition-row')].map(row => ({
      stat:row.querySelector('.global-stat-select').value,
      minCount:row.querySelector('.global-min-count').value,
      minTotal:row.querySelector('.global-min-total').value,
    }))
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* Storage is optional. */ }
  }

  await api.loadRunRecords()
  api.calculationRuleSelect.value = normalizeCalculationRule(draft.rule)
  if (draft.single) {
    fill(api, api.initialRows, draft.single.initial, 3)
    fill(api, api.targetRows, draft.single.targets, 5)
  }
  currentMode = MODES.includes(draft.mode) ? draft.mode : 'single-equipment'
  api.collectionSelect.value = currentMode
  api.refreshCharacterSelect()
  if (currentMode === 'manual-four-equipment') {
    restoreFour()
    api.setCalculationMode((draft.fourMode || draft.submode) === 'equipment' ? 'equipment' : 'global')
  }
  restoreConditions()
  restoring = false

  // Save outgoing manual boards before upstream replaces their DOM on a mode switch.
  api.collectionSelect.addEventListener('change', () => {
    capture()
    restoring = true
    queueMicrotask(() => {
      currentMode = api.collectionSelect.value
      if (currentMode === 'manual-four-equipment') {
        restoreFour()
        api.setCalculationMode(draft.fourMode === 'equipment' ? 'equipment' : 'global')
      }
      restoring = false
      capture()
    })
  }, true)
  for (const type of ['change', 'input', 'click']) document.addEventListener(type, () => queueMicrotask(capture))
  // Upstream enforces the cap but its following status update hides the reason.
  document.addEventListener('click', event => {
    if (event.target.closest('#add-global-condition') && api.globalConditionRows.children.length >= 6) {
      queueMicrotask(() => { document.querySelector('#message').textContent = '上游计算限制：全局条件最多 6 个，请先合并或删除条件。' })
    }
  }, true)
  window.addEventListener('pagehide', capture)
  installCharacterImport(api,capture)
  parent.postMessage({ type:'nikke-tools:ready' }, location.protocol === 'nikke:' ? 'nikke://app' : location.origin)
}
