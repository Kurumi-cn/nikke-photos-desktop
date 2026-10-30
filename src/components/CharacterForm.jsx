// 数据录入表单：字段与角色卡数据模型一一对应，改动即时反映到卡片预览
import { useEffect, useRef, useState } from 'react'
import { CUBES } from '../lib/cubes.js'
import { FUNCTION_LABELS, SLOT_LABELS } from '../lib/cardModel.js'
import { AFFIX_TIER_VALUES, affixTierText } from '../data/affixTiers.js'
import { loadOcrAssets } from '../lib/ocr/assets.js'
import { t, tData } from '../lib/i18n.js'
import { isCnCharacter } from '../lib/cnRoster.js'
import { equipmentIssue } from '../lib/equipmentRules.js'
import EquipmentOcrDialog from './EquipmentOcrDialog.jsx'
import NumField, { parseNumber } from './NumField.jsx'

const FUNCTION_OPTIONS = Object.entries(FUNCTION_LABELS)
// 收藏品品质：SSR（专属珍藏品）只对该角色是珍藏品版本时可选（见 favoriteCharacter）
const BASE_RARITIES = ['R', 'SR']

export default function CharacterForm({ character, value, onChange, synchroLevel, onSynchroLevelChange, classLevel, corporationLevel, classLabel, corporationLabel, onSyncSkills, hasStored, hasSample, favoriteCharacter, onClearStored, onRestoreSample }) {
  const limit = value.limitBreak || {}
  const skills = value.skills || {}
  const cube = value.cube || {}
  const favorite = value.favoriteItem || {}
  const equipments = value.equipments || []
  const isFavoriteSsr = favorite.rarity === 'SSR'
  // 三个技能都填齐（1~10）才允许同步给其他角色
  const skillsReady = [skills.skill1, skills.skill2, skills.burst]
    .every((raw) => { const n = Number(raw); return Number.isInteger(n) && n >= 1 && n <= 10 })
  // 收藏品等级：SSR 珍藏品界面按 1~3 显示（内部存储保持 0~2，界面 1 对应原 0）
  const favoriteLevelValue = isFavoriteSsr
    ? (favorite.level === null || favorite.level === undefined || favorite.level === '' ? null : Number(favorite.level) + 1)
    : favorite.level
  // 图像识别弹窗：记录正在识别的部位（null 表示关闭）
  const [ocrSlot, setOcrSlot] = useState(null)
  const [equipmentNotice, setEquipmentNotice] = useState('')
  useEffect(() => setEquipmentNotice(''), [character?.nameCode])
  const ocrAllowed = isCnCharacter(character)
  // 档位下拉的 ref（选中词条后自动跳过去）
  const tierSelectRefs = useRef(new Map())

  // 空闲时预热 OCR 字模（首次打开识别弹窗时不再等待模板加载）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadOcrAssets().catch(() => {})
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  const set = (patch) => onChange({ ...value, ...patch })
  const setLimit = (patch) => set({ limitBreak: { ...limit, ...patch } })
  const setSkills = (patch) => set({ skills: { ...skills, ...patch } })
  const setCube = (patch) => set({ cube: { ...cube, ...patch } })
  const setFavorite = (patch) => set({ favoriteItem: { ...favorite, ...patch } })

  /** 选中词条后把交互推进到档位下拉：优先尝试展开（showPicker），被浏览器拦截时退化为聚焦 */
  const focusTierSelect = (key) => {
    const element = tierSelectRefs.current.get(key)
    if (!element) return
    element.focus()
    try {
      if (typeof element.showPicker === 'function') element.showPicker()
    } catch {
      // 部分环境要求更强的用户手势才能展开，忽略即可（已聚焦，可直接键盘选择）
    }
  }

  const setAffix = (slot, lineIndex, patch) => {
    const current = equipments[slot] || []
    const type = patch?.functionType
    if (type && type !== current[lineIndex]?.functionType && current.some((line,i) => i !== lineIndex && line?.functionType === type)) {
      setEquipmentNotice('同件装备的非空词条不能重复。'); return
    }
    if (patch === null && lineIndex === 0 && current.slice(1).some(line => line?.functionType)) {
      setEquipmentNotice('后两条已有词条，不能单独清空第一条；可使用“清空本件”。'); return
    }
    if (lineIndex > 0 && type && !current[0]?.functionType && !current[lineIndex]?.functionType) {
      setEquipmentNotice('请先录入第一条词条。'); return
    }
    setEquipmentNotice('')
    const next = Array.from({ length: 4 }, (_, index) => {
      const lines = equipments[index]
      return Array.isArray(lines) ? [...lines] : [null, null, null]
    })
    if (patch === null) {
      next[slot][lineIndex] = null
    } else {
      next[slot][lineIndex] = {
        functionType: '',
        level: null,
        value: null,
        ...(next[slot][lineIndex] || {}),
        ...patch,
      }
      if (!next[slot][lineIndex].functionType) next[slot][lineIndex] = null
    }
    set({ equipments: next })
  }

  /** 识别结果写回：整块覆盖该部位 3 行（未获得行 → null 空行） */
  const applyOcr = (lines) => {
    if (ocrSlot === null || !ocrAllowed) return
    const issue = equipmentIssue(lines)
    if (issue) { setEquipmentNotice(issue); return }
    const next = Array.from({ length: 4 }, (_, index) => {
      const current = equipments[index]
      return Array.isArray(current) ? [...current] : [null, null, null]
    })
    next[ocrSlot] = Array.from({ length: 3 }, (_, index) => lines[index] || null)
    set({ equipments: next })
    setOcrSlot(null)
  }

  return (
    <div className="form">
      <div className="form-toolbar">
        <span className="form-note">{t('改动即时生效并自动保存到本机；留空表示暂无该项数据')}</span>
        <span className="form-toolbar-actions">
          {hasStored ? (
            <button type="button" className="btn btn-sm" onClick={onClearStored}>{t('清空该角色数据')}</button>
          ) : null}
          {hasSample ? (
            <button type="button" className="btn btn-sm" onClick={onRestoreSample}>{t('恢复示例数据')}</button>
          ) : null}
        </span>
      </div>

      <div className="form-grid">
        <section className="form-block">
          <h3>{t('基础')}</h3>
          <NumField
            label="等级（同步器）"
            value={synchroLevel}
            onChange={(next) => onSynchroLevelChange?.(next)}
            rangeKey="synchro"
            hint="全体妮姬共用，改动即同步"
          />
          <NumField label="突破（星）" value={limit.grade} onChange={(v) => setLimit({ grade: v })} rangeKey="grade" />
          <NumField label="核心" value={limit.core} onChange={(v) => setLimit({ core: v })} rangeKey="core" />
          <NumField label="好感度" value={value.affection} onChange={(v) => set({ affection: v })} rangeKey="affection" />
          <NumField label="战斗力" value={value.combat} onChange={(v) => set({ combat: v })} rangeKey="combat" />
        </section>

        <section className="form-block">
          <div className="form-block-head">
            <h3>{t('研究所与技能')}</h3>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!skillsReady}
              title={skillsReady ? t('把当前技能等级同步给已完善的角色') : t('先把技能 1 / 技能 2 / 爆裂技能 都填好')}
              onClick={() => onSyncSkills?.({
                skill1: Number(skills.skill1),
                skill2: Number(skills.skill2),
                burst: Number(skills.burst),
              })}
            >
              {t('同步技能等级')}
            </button>
          </div>
          <div className="form-row">
            <span className="form-label">{t('职业等级')}</span>
            <span className="form-static">{classLevel ?? '—'}</span>
            <span className="form-hint">{t('{label} · 在存档编辑中修改', { label: classLabel || t('职业') })}</span>
          </div>
          <div className="form-row">
            <span className="form-label">{t('企业等级')}</span>
            <span className="form-static">{corporationLevel ?? '—'}</span>
            <span className="form-hint">{t('{label} · 在存档编辑中修改', { label: corporationLabel || t('企业') })}</span>
          </div>
          <NumField label="技能 1" value={skills.skill1} onChange={(v) => setSkills({ skill1: v })} rangeKey="skill" />
          <NumField label="技能 2" value={skills.skill2} onChange={(v) => setSkills({ skill2: v })} rangeKey="skill" />
          <NumField label="爆裂技能" value={skills.burst} onChange={(v) => setSkills({ burst: v })} rangeKey="skill" />
        </section>

        <section className="form-block">
          <h3>{t('魔方与收藏品')}</h3>
          <label className="form-row">
            <span className="form-label">{t('魔方')}</span>
            <select
              className="inp"
              value={cube.resourceId ?? ''}
              onChange={(event) => {
                const resourceId = parseNumber(event.target.value)
                const found = CUBES.find((item) => item.resourceId === resourceId) || null
                setCube({ resourceId, nameCn: found?.nameCn || '', nameEn: found?.nameEn || '' })
              }}
            >
              <option value="">{t('未设置')}</option>
              {CUBES.map((item) => (
                <option key={item.resourceId} value={item.resourceId}>{tData(item.nameCn)}</option>
              ))}
            </select>
          </label>
          <NumField label="魔方等级" value={cube.level} onChange={(v) => setCube({ level: v })} rangeKey="cubeLevel" />
          <label className="form-row">
            <span className="form-label">{t('收藏品')}</span>
            <select
              className="inp"
              value={favorite.rarity || ''}
              onChange={(event) => setFavorite({ rarity: event.target.value })}
            >
              <option value="">{t('未设置')}</option>
              {BASE_RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>{rarity}</option>
              ))}
              {favoriteCharacter ? <option value="SSR">{t('SSR（专属珍藏品）')}</option> : null}
            </select>
          </label>
          <NumField
            label="收藏品等级"
            value={favoriteLevelValue}
            onChange={(v) => setFavorite({ level: isFavoriteSsr ? (v === null ? null : v - 1) : v })}
            rangeKey={isFavoriteSsr ? 'favoriteLevelSsr' : 'favoriteLevel'}
          />
          <p className="form-hint">
            {isFavoriteSsr ? t('将使用该角色专属的珍藏品图标') : t('将按武器类型显示该角色的收藏品玩偶')}
            {hasSample ? t('（示例档案含收藏品数据）') : ''}
          </p>
        </section>

        <section className="form-block form-block-wide">
          <h3>{t('四件装备与词条')}</h3>
          <p className="hint">同件装备的非空词条不能重复；有词条时第一条必填。整件未录入可保持全空。</p>
          {equipmentNotice && <p className="dlg-error" role="alert">{equipmentNotice}</p>}
          <div className="equip-grid">
            {SLOT_LABELS.map((slotLabel, slot) => {
              const lines = Array.isArray(equipments[slot]) ? equipments[slot] : [null, null, null]
              return (
                <div className="equip-block" key={slotLabel}>
                  <div className="equip-head">
                    <span className="equip-title">
                      <strong>{tData(slotLabel)}</strong>
                      <button
                        type="button"
                        className="mini-btn"
                        disabled={!ocrAllowed}
                        onClick={() => { if (ocrAllowed) setOcrSlot(slot) }}
                        title={t(ocrAllowed ? '从装备面板截图识别词条' : '该妮姬未加入国服名单，无法使用装备识别')}
                      >
                        {t('图像识别')}
                      </button>
                      <button type="button" className="mini-btn" disabled={!lines.some(line => line?.functionType)} onClick={() => {
                        const next = Array.from({length:4},(_,i) => Array.isArray(equipments[i]) ? [...equipments[i]] : [null,null,null])
                        next[slot] = [null,null,null]; setEquipmentNotice(''); set({equipments:next})
                      }}>清空本件</button>
                    </span>
                  </div>
                  {[0, 1, 2].map((lineIndex) => {
                    const lineValue = lines[lineIndex]
                    const tiers = lineValue?.functionType ? AFFIX_TIER_VALUES[lineValue.functionType] : null
                    // 数值只可能落在档位上：level 有效且与档位表一致（或缺值）时才回显选中，非法旧值显示为空
                    const selectedLevel = lineValue && tiers && Number.isFinite(lineValue.level)
                      && lineValue.level >= 1 && lineValue.level <= tiers.length
                      && (lineValue.value === null || lineValue.value === undefined
                        || Math.abs(lineValue.value - tiers[lineValue.level - 1]) < 1e-9)
                      ? lineValue.level
                      : ''
                    return (
                      <div className="affix-row" key={lineIndex}>
                        <select
                          className="inp inp-sm"
                          aria-label={`${slotLabel}第${lineIndex + 1}条词条`}
                          disabled={lineIndex > 0 && !lines[0]?.functionType && !lineValue?.functionType}
                          value={lineValue?.functionType || ''}
                          onChange={(event) => {
                            const functionType = event.target.value
                            if (!functionType) {
                              setAffix(slot, lineIndex, null)
                              return
                            }
                            const level = lineValue?.level ?? null
                            const nextTiers = AFFIX_TIER_VALUES[functionType]
                            setAffix(slot, lineIndex, {
                              functionType,
                              level,
                              value: level && nextTiers ? nextTiers[level - 1] : null,
                            })
                            // 选中词条后自动把交互推进到档位下拉（展开或聚焦）
                            window.setTimeout(() => focusTierSelect(`${slot}-${lineIndex}`), 0)
                          }}
                        >
                          <option value="" disabled={lineIndex === 0 && lines.slice(1).some(line => line?.functionType)}>{t('未获得')}</option>
                          {FUNCTION_OPTIONS.map(([code, label]) => (
                            <option key={code} value={code} disabled={code !== lineValue?.functionType && lines.some((line,i) => i !== lineIndex && line?.functionType === code)}>{tData(label)}</option>
                          ))}
                        </select>
                        <select
                          className="inp inp-sm"
                          ref={(element) => {
                            const key = `${slot}-${lineIndex}`
                            if (element) tierSelectRefs.current.set(key, element)
                            else tierSelectRefs.current.delete(key)
                          }}
                          value={selectedLevel}
                          disabled={!lineValue}
                          onChange={(event) => {
                            const level = event.target.value ? Number(event.target.value) : null
                            const nextTiers = lineValue?.functionType ? AFFIX_TIER_VALUES[lineValue.functionType] : null
                            setAffix(slot, lineIndex, {
                              level,
                              value: level && nextTiers ? nextTiers[level - 1] : null,
                            })
                          }}
                        >
                          <option value="">{lineValue ? t('请选择档位') : '—'}</option>
                          {tiers
                            ? tiers.map((_, index) => (
                              <option key={index} value={index + 1}>{t('第 {tier} 档 · {text}', { tier: index + 1, text: affixTierText(lineValue.functionType, index + 1) })}</option>
                            ))
                            : null}
                        </select>
                        <button
                          type="button"
                          className="mini"
                          title={t('清空该行')}
                          disabled={!lineValue || (lineIndex === 0 && lines.slice(1).some(line => line?.functionType))}
                          onClick={() => setAffix(slot, lineIndex, null)}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {equipmentIssue(lines) && <p className="dlg-error" role="alert">{equipmentIssue(lines)}；历史记录保持原样，请核对后修改。</p>}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <EquipmentOcrDialog
        character={character}
        open={ocrAllowed && ocrSlot !== null}
        slotLabel={ocrSlot !== null ? tData(SLOT_LABELS[ocrSlot]) : ''}
        onClose={() => setOcrSlot(null)}
        onApply={applyOcr}
      />
    </div>
  )
}
