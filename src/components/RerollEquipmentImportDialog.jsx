import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CharacterAvatar from './CharacterAvatar.jsx'
import { CHARACTERS, displayName, findCharacter, matchesSearch } from '../lib/roster.js'
import { fullyRecordedCodes, getCurrentProfile, getCurrentProfileId, loadRecord, subscribeProfiles } from '../lib/profileStore.js'
import { EQUIPMENT_IMPORT_SLOTS, toRerollEquipmentSnapshot } from '../lib/rerollEquipmentImport.js'
import { FUNCTION_LABELS, affixTierText } from '../data/affixTiers.js'
import { overloadIconAsset } from '../lib/cardAssets.js'
import { t } from '../lib/i18n.js'
import '../styles/rerollImport.css'

const STAT_FUNCTION=Object.fromEntries(Object.entries(FUNCTION_LABELS).map(([code,label])=>[label,code]))
const SLOT_KEYS=['head','body','arms','legs']
function EquipmentPreviewIcon({character,index}) {
  const [failed,setFailed]=useState(false)
  const src=overloadIconAsset(character.class,SLOT_KEYS[index])
  return <span className="reroll-import-equipment-art" title={t(EQUIPMENT_IMPORT_SLOTS[index])}>
    {src&&!failed?<img src={src} alt={t('{slot}装备图标',{slot:t(EQUIPMENT_IMPORT_SLOTS[index])})} onError={()=>setFailed(true)} />:<span>{t('暂无图标')}</span>}
  </span>
}

export default function RerollEquipmentImportDialog({ onClose, onImport, purpose='expectation' }) {
  const single=purpose==='simulator-single',simulation=purpose.startsWith('simulator-')
  const [equipmentIndex,setEquipmentIndex]=useState(-1)
  const dialog = useRef(null), [selected, setSelected] = useState(''), [search, setSearch] = useState(''), [message, setMessage] = useState(''), [, refresh] = useState(0)
  const [profileId, setProfileId] = useState(getCurrentProfileId)
  useEffect(() => { dialog.current.showModal(); return () => { if (dialog.current?.open) dialog.current.close() } }, [])
  useEffect(() => subscribeProfiles(() => { setProfileId(getCurrentProfileId()); setSelected(''); setMessage(t('存档或角色数据已更新，请重新选择。')); refresh(value => value + 1) }), [])
  const candidates = fullyRecordedCodes(profileId).map(findCharacter).filter(item => item && CHARACTERS.includes(item))
  const visible = candidates.filter(character => matchesSearch(character, search))
  const character = CHARACTERS.find(item => item.nameCode === selected)
  let snapshot = null, validationError = ''
  if (character) { try { snapshot = toRerollEquipmentSnapshot(loadRecord(selected)) } catch (error) { validationError = error.message } }
  const submit = event => {
    event.preventDefault()
    if (!character || !snapshot || (single && equipmentIndex<0)) return
    if (getCurrentProfileId() !== profileId) { setProfileId(getCurrentProfileId()); setSelected(''); setMessage(t('当前存档已变化，请重新选择。')); return }
    try {
      if (!fullyRecordedCodes(profileId).includes(selected) || !CHARACTERS.some(item => item.nameCode === selected)) throw Error('角色不再属于已完善名单，请重新选择')
      const latest = toRerollEquipmentSnapshot(loadRecord(selected))
      if (JSON.stringify(latest) !== JSON.stringify(snapshot)) { setMessage(t('装备数据已更新，请确认最新预览后再次导入。')); refresh(value => value + 1); return }
      onImport({ ...latest, equipments:single?[latest.equipments[equipmentIndex]]:latest.equipments, ...(single?{slot:equipmentIndex}:{}), name: displayName(character) })
    }
    catch (error) { setMessage(error.message) }
  }
  return createPortal(<dialog ref={dialog} className="dlg reroll-import-dialog" aria-labelledby="reroll-import-title" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}>
    <form onSubmit={submit}>
      <div className="dlg-head"><h2 id="reroll-import-title">{t(single?'选择角色的一件装备':simulation?'选择角色的四件装备':'导入已完善角色的装备')}</h2><button type="button" className="dlg-x" aria-label={t('取消导入')} onClick={onClose}>×</button></div>
      <div className="reroll-import-note"><strong>{t('当前存档：')}{getCurrentProfile().name}</strong><p>{t(simulation?`仅将${single?'所选的一件':'四件'}装备复制到模拟初始状态，保留模拟目标和规则，清空初始锁定。模拟与正式角色档案相互独立。`:'仅替换四件装备的当前词条，保留目标、规则与全局条件。不改变角色存档；当前装备的锁定及“不跑”状态会清除。')}</p></div>
      <label className="reroll-import-search">{t('选择已完善的角色')}<input className="inp" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('搜索妮姬名称…')} /></label>
      <div className="reroll-import-body"><div className="reroll-import-list" role="group" aria-label={t('已完善角色')}>
        {visible.map(item => <label key={item.nameCode} className="reroll-import-option"><input type="radio" name="reroll-import-character" value={item.nameCode} checked={selected === item.nameCode} onChange={() => { setSelected(item.nameCode); setEquipmentIndex(-1); setMessage('') }} /><CharacterAvatar path={item.avatar} alt="" /><span>{displayName(item)}{item.isCustom ? <small>{t('自定义')}</small> : null}</span></label>)}
        {!visible.length ? <p className="reroll-import-empty">{t(candidates.length ? '没有匹配的角色，请更换搜索词。' : '当前存档暂无已完善角色，请先在数据录入中完善四件装备。')}</p> : null}
      </div><div className="reroll-import-preview" aria-label={t('待导入装备预览')}>
        {snapshot ? snapshot.equipments.map((rows, index) => <section key={index}><h3>{single?<label className="reroll-import-slot"><input type="radio" name="reroll-import-equipment" value={index} checked={equipmentIndex===index} onChange={()=>setEquipmentIndex(index)} />{t(EQUIPMENT_IMPORT_SLOTS[index])}</label>:t(EQUIPMENT_IMPORT_SLOTS[index])}</h3><div className="reroll-import-equipment-content">
          <EquipmentPreviewIcon key={`${character.class}-${index}`} character={character} index={index} />
          <table className="reroll-import-affixes" aria-label={t('{slot}装备词条',{slot:t(EQUIPMENT_IMPORT_SLOTS[index])})}><thead><tr><th scope="col">{t('词条')}</th><th scope="col">{t('数值')}</th><th scope="col">{t('档位')}</th></tr></thead><tbody>{rows.map((row,rowIndex)=><tr key={rowIndex}><td>{rowIndex+1}. {t(row.stat)}</td><td className="reroll-import-value">{row.tier?affixTierText(STAT_FUNCTION[row.stat],row.tier)||'—':'—'}</td><td>{row.tier?t('第{tier}档',{tier:row.tier}):'—'}</td></tr>)}</tbody></table>
        </div></section>) : <p className="reroll-import-empty">{validationError ? t(validationError) : t('选择角色后预览四件装备的词条与档位。')}</p>}
      </div></div>
      <p className="reroll-import-status" role="status">{t(message || validationError || (snapshot ? single&&equipmentIndex<0?'请选择一件装备':`将导入：${displayName(character)}${single?' · '+EQUIPMENT_IMPORT_SLOTS[equipmentIndex]:''}` : '请选择一位角色'))}</p>
      <div className="dlg-foot"><button type="button" className="btn" onClick={onClose}>{t('取消')}</button><button type="submit" className="btn btn-primary" disabled={!snapshot || (single&&equipmentIndex<0)}>{t(simulation?'载入模拟初始装备':'导入并替换当前装备')}</button></div>
    </form>
  </dialog>, document.body)
}
