// SPDX-License-Identifier: GPL-3.0-or-later
import { startStrategyTask } from './client.js'
import { STRATEGIES } from './engine.js'
import { STAT_NAMES } from '../calculator/engine.js'
import { CHARACTER_NOTE } from './character.js'
import { describeGearGoals } from './character-goal-view.js'
import './ui.css'

const STORAGE_KEY = 'nikke-tools:workshop:strategy-compare:v1'
const clone = value => structuredClone(value)
const escape = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
const number = value => Number(value).toFixed(6).replace(/\.?0+$/,'') || '0'
const boardText = rows => rows.map((r,i)=>`${i+1}. ${r.stat} ${r.tier ? r.tier+'档' : ''}${r.flagged ? ' · 已锁' : ''}${r.forceKeep ? ' · 强制保留' : ''}`).join('\n')
const safeBoard = value => Array.isArray(value) && value.length === 3 && value.every(r=>r && STAT_NAMES.includes(r.stat) && Number.isInteger(r.tier) && (r.stat==='空词条' ? r.tier===0 : r.tier>=1 && r.tier<=15)) ? clone(value) : null

export function installStrategyUI(api) {
  const controls = document.createElement('div')
  controls.className = 'resource-controls'
  controls.innerHTML = `<label>资源策略 <select id="resource-strategy" aria-label="资源策略"><option value="workshop-stone">不使用自订秘钥</option><option value="zbx-keys">允许使用自订秘钥</option></select></label>
    <div class="threshold-field"><label for="key-threshold">秘钥使用阈值 p</label><button type="button" class="help-icon" aria-label="秘钥使用阈值说明" aria-describedby="key-threshold-help">?</button><input id="key-threshold" type="number" min="0" max="1" step="0.01" value="0.1" required aria-label="秘钥使用阈值 p"><p id="key-threshold-help" role="tooltip" class="strategy-note threshold-help">p 是算法决定是否使用自订秘钥的门槛。p 越低，越容易使用自订秘钥；p 越高，算法越倾向于节省自订秘钥。</p></div>
    <p id="resource-support" class="strategy-note"></p>`
  document.querySelector('.result-panel > .panel-header').after(controls)
  controls.append(controls.querySelector('#key-threshold-help'))
  const helpButton=controls.querySelector('.help-icon')
  // Focus events also work when focus enters this isolated document from its host.
  helpButton.addEventListener('focus',()=>controls.classList.add('help-focused'))
  helpButton.addEventListener('blur',()=>controls.classList.remove('help-focused'))
  helpButton.addEventListener('keydown',event=>{if(event.key==='Escape')helpButton.blur()})
  // Provenance and license documents are centralized in the host About page.
  const ruleHelp=document.createElement('p')
  ruleHelp.id='calculation-rule-help';ruleHelp.className='strategy-note rule-help';ruleHelp.setAttribute('aria-live','polite')
  api.calculationRuleSelect.setAttribute('aria-describedby',ruleHelp.id)
  document.querySelector('.result-panel > .panel-header').after(ruleHelp)
  const characterTargets=document.createElement('section')
  characterTargets.id='key-character-targets';characterTargets.className='form-section';characterTargets.hidden=true
  characterTargets.innerHTML=`<h3>秘钥模式 · 四装备角色目标</h3><p class="strategy-note">${CHARACTER_NOTE} 设置 1～3 个全部达成的独立词条目标；此模式不使用 Workshop 全局条件、单件候选池或“不跑”。</p><div class="character-target-rows">${[0,1,2].map(i=>`<div class="character-target-row"><label>目标 ${i+1}<select class="character-target-stat" aria-label="角色目标 ${i+1}">${STAT_NAMES.map(stat=>`<option>${stat}</option>`).join('')}</select></label><label>总档位 ≥ <input type="number" class="character-target-total" min="1" max="60" step="1" value="1" aria-label="角色目标 ${i+1} 总档位"></label></div>`).join('')}</div>`
  document.querySelector('#global-target-mode').after(characterTargets)
  const result = document.createElement('section')
  result.id = 'resource-result'
  result.className = 'resource-result'
  result.hidden = true
  result.setAttribute('aria-live','polite')
  document.querySelector('#result-panel').append(result)
  const compare = document.createElement('section')
  compare.id = 'compare-panel'
  compare.className = 'form-section compare-panel'
  compare.innerHTML = `<div class="section-heading"><div><h3>洗练前后 · 剩余期望对比</h3><p>保留原盘面，编辑实际洗练后的结果；两边使用同一组当前目标、规则、资源策略与 p 重新计算。</p></div><button type="button" class="button button-secondary" id="compare-capture">保留当前为原盘面</button></div>
    <p class="strategy-note">只比较从当前盘面继续洗练的剩余成本，不重复计入已经消耗的资源。应用与恢复只修改本工具盘面，不写角色存档。</p>
    <div class="compare-boards"><div><h4>洗练前（已保留）</h4><pre id="compare-before">尚未保留原盘面。</pre></div><div><h4>洗练后（可编辑）</h4><div class="rows" id="compare-after-rows"></div></div></div>
    <div class="compare-actions"><button type="button" class="button button-primary" id="compare-run">重新计算两边</button><button type="button" class="button button-secondary" id="compare-apply" disabled>应用新盘面</button><button type="button" class="button button-secondary" id="compare-restore" disabled>恢复原盘面</button><button type="button" class="button button-secondary" id="strategy-cancel" hidden>取消计算</button></div>
    <p id="compare-status" role="status" class="strategy-note">请先保留当前盘面。</p><div id="compare-output" aria-live="polite"></div>`
  document.querySelector('#classic-equipment-mode').after(compare)
  api.createRows(compare.querySelector('#compare-after-rows'),3,'initial')
  const find = id => document.querySelector('#'+id)
  const mode = find('resource-strategy')
  const p = find('key-threshold')
  const afterRows = find('compare-after-rows')
  const output = find('compare-output')
  const status = find('compare-status')
  const cancel = find('strategy-cancel')
  controls.append(cancel)
  let before = null, busy = false, task = null, comparison = null, comparisonSignature = '', currentSignature = ''
  let stored = {}
  try { stored=JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {} } catch {}
  if (stored.strategy === STRATEGIES.KEYS) mode.value = STRATEGIES.KEYS
  if (typeof stored.p === 'number' && Number.isFinite(stored.p) && stored.p>=0 && stored.p<=1) p.value=String(stored.p)
  before=safeBoard(stored.before)
  if(Array.isArray(stored.characterTargets)) for(const [i,t] of stored.characterTargets.slice(0,3).entries()) {
    const row=characterTargets.querySelectorAll('.character-target-row')[i]
    if(STAT_NAMES.includes(t.stat))row.querySelector('select').value=t.stat
    if(Number.isInteger(t.totalTier)&&t.totalTier>=1&&t.totalTier<=60)row.querySelector('input').value=t.totalTier
  }
  const fill = (container,rows) => api.fillRows(container,clone(rows).map(row=>({...row,locked:!!row.flagged})))
  if (safeBoard(stored.after)) fill(afterRows,stored.after)
  const isSingle = () => api.collectionSelect.value === 'single-equipment'
  if(!isSingle())mode.value=STRATEGIES.STONE
  const readCharacterTargets=()=>[...characterTargets.querySelectorAll('.character-target-row')].map(row=>({stat:row.querySelector('select').value,totalTier:Number(row.querySelector('input').value)})).filter(t=>t.stat!=='空词条')
  const settings = () => ({scope:isSingle()?'single':'character',strategy:mode.value,calculationRule:api.calculationRuleSelect.value,
    p:p.value.trim()==='' ? NaN : Number(p.value),targetInput:clone(api.readRows(api.targetRows)),characterTargets:readCharacterTargets()})
  const liveBoard=()=>isSingle()?api.readRows(api.initialRows):api.readCharacterEquipmentInputs()
  const currentFingerprint=()=>JSON.stringify({settings:settings(),live:liveBoard()})
  const fingerprint = () => JSON.stringify({settings:settings(),before,after:api.readRows(afterRows),live:api.readRows(api.initialRows)})
  function persist() {
    const value=p.value.trim()===''?NaN:Number(p.value)
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify({strategy:mode.value,p:Number.isFinite(value)&&value>=0&&value<=1?value:null,before,after:api.readRows(afterRows),characterTargets:readCharacterTargets()}))} catch {}
  }
  function clearCurrent() { result.hidden=true; result.replaceChildren(); currentSignature='' }
  function invalidate() {
    if (comparison && comparisonSignature!==fingerprint()) {
      comparison=null;comparisonSignature='';output.textContent='输入或设置已变更，上次对比已失效，请重新计算两边。'
    }
    if (currentSignature && currentSignature!==currentFingerprint()) clearCurrent()
    find('compare-apply').disabled=busy || !comparison
    find('compare-run').disabled=busy || !before || !isSingle()
    find('compare-restore').disabled=busy || !before || !isSingle()
  }
  function sync() {
    const single=isSingle()
    mode.disabled=busy
    p.disabled=busy || mode.value!==STRATEGIES.KEYS
    compare.hidden=!single
    const keys=mode.value===STRATEGIES.KEYS
    characterTargets.hidden=single || !keys
    if(!single) {
      find('setup-description').textContent=keys?'设置四件装备当前词条，以及跨装备的角色总档位目标。':api.calculationModeSelect.value==='global'?'设置跨四件装备的最低条数、合计数值和总目标词条数。':'词条不可重复；选择词条后，档位默认设为第 10 档。'
      find('global-target-mode').hidden=keys || api.calculationModeSelect.value!=='global'
      api.calculationModeSelect.disabled=busy || keys
      find('global-target-preset').hidden=keys || api.calculationModeSelect.value!=='global'
      api.characterEquipmentMode.querySelectorAll('.equipment-result-block').forEach(block=>{block.hidden=keys})
      api.characterEquipmentMode.querySelectorAll('.global-assignment-block').forEach(block=>{block.hidden=keys || api.calculationModeSelect.value!=='global'})
      api.characterEquipmentMode.querySelectorAll('.fixed-target-block').forEach(block=>{block.hidden=keys || api.calculationModeSelect.value==='global'})
    }
    find('classic-optimal-result-section').hidden=!single || keys
    find('result').hidden=keys
    find('details-tab').hidden=keys
    if(keys && find('details-tab').getAttribute('aria-selected')==='true') find('result-tab').click()
    ruleHelp.textContent=api.calculationRuleSelect.value==='cn-legacy'?'允许同一词条栏位再次出现完全相同的效果和数值':'同一词条栏位再次抽到完全相同的效果和数值时，会重新抽取；空词条仍可能重复'
    find('resource-support').textContent=!single && keys
      ? 'zbx 四装备候选分配近似：仅支持旧规则、1～3 个独立总档位目标；不支持强制保留、候选选 3、合并目标或“不跑”。60 秒超时或求解失败会明确报错，不切换算法。'
      : !single ? '默认使用 Workshop 原四装备规划，保留最低条数、合计百分比、单件目标与原有约束；可选择允许使用自订秘钥，单独设置角色总档位目标。'
      : keys
        ? `仅支持至多 3 个全部达成目标；不忽略强制保留约束。p 改善概率必须严格大于阈值，先最少石头、再最少秘钥。${api.calculationRuleSelect.value==='cn-legacy' ? 'zbx cn 允许保留结果，与 Workshop 旧规则直接覆盖不同；只以 zbx 自身全石头值衡量秘钥收益。' : 'zbx global 使用上游压缩状态，若触发档位平均退化将拒绝结果。'}`
        : '保留 Workshop 原求解器、规则、候选目标和强制保留；下方对比也可用原全石头模式。'
    if (!busy) api.calculateButton.textContent=keys ? '计算秘钥策略' : '开始计算'
    find('compare-before').textContent=before ? boardText(before) : '尚未保留原盘面。'
    invalidate()
  }
  function settingsText(value) {
    return `${value.strategy===STRATEGIES.KEYS?'允许秘钥锁 · zbx '+value.zbxRule:'Workshop 全石头'}；${value.ruleNote}；目标：${value.targets.map(t=>t.stat+'≥'+t.tier+'档'+(t.flagged?'（必选）':'')).join('、')}；p=${value.p===null?'不使用':value.p}。${value.objective}`
  }
  function renderCurrent(value) {
    const rows=[['Workshop 原求解器基准',value.workshop.stones,0,value.workshop.action]]
    if(value.zbx)rows.push(['zbx 同模型全石头',value.zbx.stoneOnly,0,value.zbx.stoneOnlyAction],['zbx 允许秘钥锁',value.resources.stones,value.resources.keys,value.nextAction])
    result.innerHTML=`<h3>当前盘面 · 剩余资源期望</h3><p class="strategy-note">${escape(settingsText(value.settings))}</p><div class="resource-table-wrap"><table class="resource-table"><thead><tr><th>模型 / 策略</th><th>预期洗练石</th><th>预期秘钥</th><th>下一步操作</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${escape(r[0])}</th><td>${number(r[1])}</td><td>${number(r[2])}</td><td>${escape(r[3])}</td></tr>`).join('')}</tbody></table></div><p class="strategy-note">不同模型单列，不把跨模型差异归因于秘钥，不合并石头与秘钥为总分。每执行一次后按实际盘面重新计算。</p>`
    result.hidden=false
  }
  function renderGearPlan(g, equipments) {
    const equipment = equipments[g.gear - 1]
    const goals = describeGearGoals(g.subTargets, equipment?.initialInput)
    const heading = `装备 ${g.gear}${equipment?.label ? ` · ${equipment.label}` : ''}`
    if (goals.state === 'unassigned') return `<section class="character-gear-plan"><h4>${escape(heading)}</h4><p class="strategy-note">本轮未给这件装备分配洗练目标，暂时不用操作。</p></section>`
    if (goals.state === 'unknown') return `<section class="character-gear-plan"><h4>${escape(heading)}</h4><p>本件目标暂时无法展示，请重新运行计算器。</p></section>`
    const next = g.nextAction.replaceAll(`装备 ${g.gear}：`, '').replace('该件子目标已完成', '本件目标已达成')
    return `<section class="character-gear-plan"><h4>${escape(heading)} <span class="gear-goal-status ${goals.state === 'met' ? 'is-met' : ''}">${goals.state === 'met' ? '本件目标已达成' : '本件目标尚未全部达成'}</span></h4><p class="gear-next-action"><b>本次操作（只执行一轮）：</b>${escape(next)}</p><div class="resource-table-wrap"><table class="resource-table gear-goals"><thead><tr><th>本件洗练目标（全部达成）</th><th>当前词条</th><th>进度</th></tr></thead><tbody>${goals.targets.map(t => `<tr><th>${escape(t.stat)} ≥ ${t.tier} 档（${escape(t.value)}）</th><td>${t.currentTier === null ? '请核对当前盘面' : t.currentTier === 0 ? '无该词条' : `第 ${t.slot} 栏 · ${t.currentTier} 档（${escape(t.currentValue)}）`}</td><td class="${t.met === true ? 'goal-met' : ''}">${t.met === null ? '待核对' : t.met ? '已达标' : t.currentTier === 0 ? '尚未洗出' : `还差 ${t.tier - t.currentTier} 档`}</td></tr>`).join('')}</tbody></table></div><p class="strategy-note gear-recalculate">达成后重新运行计算器。每次洗练后也请先更新实际盘面，再重新计算下一步。</p></section>`
  }
  function renderCharacter(value, equipments) {
    result.innerHTML=`<h3>四装备 · 剩余资源期望（近似）</h3><p class="strategy-note">${escape(value.note)}</p><p class="strategy-note">允许使用自订秘钥 · zbx ${escape(value.settings.zbxRule)}；p=${value.settings.p}；${value.settings.characterTargets.map(t=>escape(t.stat)+' 总档位≥'+t.totalTier).join('、')}</p><div class="resource-table-wrap"><table class="resource-table"><thead><tr><th>模型 / 策略</th><th>预期洗练石</th><th>预期秘钥</th></tr></thead><tbody><tr><th>zbx 同模型全石头（近似）</th><td>${number(value.expected.stoneOnly)}</td><td>0</td></tr><tr><th>允许使用自订秘钥（近似）</th><td>${number(value.expected.withKeysStone)}</td><td>${number(value.expected.withKeysKeys)}</td></tr></tbody></table></div><p class="strategy-note">上表是达成全部目标的平均剩余消耗；下面的操作建议只针对当前这一轮。</p>${value.gears.map(g=>renderGearPlan(g,equipments)).join('')}<p class="strategy-note">每执行一次后按实际四件盘面重新计算。结果只保留于本工具，不写角色档案；两种资源分别展示。</p>`
    result.hidden=false
  }
  const deltaText = value => `${value < -1e-8 ? '减少' : value > 1e-8 ? '增加' : '不变'}${Math.abs(value)>1e-8 ? ' '+number(Math.abs(value)) : ''}（后 − 前 ${value>1e-8?'+':''}${Math.abs(value)<1e-8?'0':number(value)}）`
  function renderCompare(value) {
    output.innerHTML=`<p class="strategy-note">${escape(settingsText(value.settings))}</p><div class="resource-table-wrap"><table class="resource-table"><thead><tr><th>剩余期望</th><th>洗练前</th><th>洗练后</th><th>变化</th></tr></thead><tbody><tr><th>洗练石</th><td>${number(value.before.resources.stones)}</td><td>${number(value.after.resources.stones)}</td><td>${deltaText(value.delta.stones)}</td></tr><tr><th>秘钥</th><td>${number(value.before.resources.keys)}</td><td>${number(value.after.resources.keys)}</td><td>${deltaText(value.delta.keys)}</td></tr></tbody></table></div><p><b>原盘面推荐：</b>${escape(value.before.nextAction)}</p><p><b>新盘面推荐：</b>${escape(value.after.nextAction)}</p><p class="strategy-note">${escape(value.note)} 两种资源分别展示，不作合成评分。</p>`
  }
  async function run(type,input,onSuccess) {
    if(busy)return
    find('result-tab').click()
    busy=true;comparison=null;comparisonSignature='';output.replaceChildren();clearCurrent()
    api.showMessage('');api.setCalculating(true);api.collectionSelect.disabled=true
    cancel.hidden=false;cancel.disabled=false;status.textContent='正在计算…'
    try {
      task=startStrategyTask(type,input,progress=>{status.textContent=progress.text;api.setBatchProgress(40,progress.text)})
      const value=await task.promise
      onSuccess(value)
      status.textContent=type==='compareSingle' ? '已按同一配置重新计算两边；应用仅影响本工具。' : '计算完成。'
    } catch(error) {
      comparison=null;comparisonSignature='';clearCurrent();output.textContent='本次未完成，没有可应用的有效对比结果。'
      status.textContent=error.message;api.showMessage(error.message,true)
    } finally {
      task=null;busy=false;api.setCalculating(false);api.collectionSelect.disabled=false;cancel.hidden=true;sync();persist()
    }
  }
  api.calculateButton.addEventListener('click',event=>{
    if(mode.value!==STRATEGIES.KEYS)return
    event.stopImmediatePropagation();event.preventDefault()
    const single=isSingle()
    const input={...settings(),...(single?{initialInput:clone(api.readRows(api.initialRows))}:{equipments:clone(api.readCharacterEquipmentInputs())})}
    const signature=currentFingerprint()
    run(single?'resourceSingle':'resourceCharacter',input,value=>{
      if(signature!==currentFingerprint())throw new Error('计算期间盘面或策略已变更，本次结果失效，请重算。')
      if(single)renderCurrent(value);else {
        renderCharacter(value,input.equipments)
        if(!value.approx) {
          result.querySelector('h3').textContent='四装备 · 剩余资源期望（已达标）'
          result.querySelectorAll('tbody th').forEach(cell=>{cell.textContent=cell.textContent.replace('（近似）','（已达标）')})
        }
      }
      currentSignature=signature
    })
  },true)
  find('compare-capture').addEventListener('click',()=>{
    before=clone(api.readRows(api.initialRows));fill(afterRows,before);comparison=null;comparisonSignature='';output.replaceChildren()
    status.textContent='原盘面已保留，可编辑洗练后盘面；两边共用当前规则、目标、策略和 p。';sync();persist()
  })
  find('compare-run').addEventListener('click',()=>{
    if(!before || !isSingle())return
    const signature=fingerprint()
    run('compareSingle',{...settings(),beforeInput:clone(before),afterInput:clone(api.readRows(afterRows))},value=>{
      if(signature!==fingerprint())throw new Error('计算期间输入已变更，本次对比失效，请重算。')
      comparison=value;comparisonSignature=signature;renderCompare(value)
    })
  })
  function apply(rows,message) {
    fill(api.initialRows,rows);api.clearSingleOutput();clearCurrent();comparison=null;comparisonSignature=''
    status.textContent=message;output.textContent='盘面已变更，继续洗练前请重新计算。';sync();persist()
  }
  find('compare-apply').addEventListener('click',()=>{
    if(comparison && comparisonSignature===fingerprint())apply(comparison.afterInput,'新盘面已应用到本工具，没有修改正式角色存档。')
  })
  find('compare-restore').addEventListener('click',()=>{if(before)apply(before,'已恢复保留的原盘面，没有修改正式角色存档。')})
  cancel.addEventListener('click',()=>task?.cancel())
  mode.addEventListener('change',()=>{clearCurrent();api.clearSingleOutput();api.clearGlobalPlanOutputs();sync();persist()})
  api.collectionSelect.addEventListener('change',()=>{mode.value=STRATEGIES.STONE;clearCurrent();queueMicrotask(sync)})
  for(const type of ['input','change'])document.addEventListener(type,event=>{
    if(busy)return
    if(event.target.closest('#compare-panel, #classic-equipment-mode, #character-equipment-mode, #key-character-targets') || event.target===api.calculationModeSelect || event.target===api.calculationRuleSelect || event.target===mode || event.target===p)queueMicrotask(()=>{invalidate();sync();persist()})
  })
  document.addEventListener('click',event=>{
    if(event.target.closest('.force-retain-toggle'))queueMicrotask(()=>{invalidate();sync();persist()})
  })
  document.addEventListener('nikke-reroll:board-changed',()=>{clearCurrent();invalidate();sync()})
  find('reset').addEventListener('click',()=>{before=null;comparison=null;comparisonSignature='';clearCurrent();output.replaceChildren();status.textContent='已重置，请重新保留原盘面。';sync();persist()})
  sync()
}
