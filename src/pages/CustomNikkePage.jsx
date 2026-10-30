import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { TAXONOMY, labelFor } from '../lib/roster.js'
import { customFieldErrors } from '../lib/customNikkeModel.js'
import { getCustomNikkes, getDeletedCustomNikkes, getCustomNikkeError, getCustomNikkeRevision, initializeCustomNikkes, readCustomImage, saveCustomNikke, setCustomNikkeDeleted, subscribeCustomNikkes } from '../lib/customNikkeStore.js'
import { t } from '../lib/i18n.js'
import '../styles/customNikke.css'

const draftCache = new Map()
const blank = () => ({ nameCn: '', element: '', corporation: '', class: '', use_burst_skill: '', original_rare: '', weapon_type: '', avatarImage: null, artworkImage: null })
function useImageUrl(image) {
  const [preview, setPreview] = useState({ blob: null, url: '' })
  useEffect(() => {
    if (!image?.blob) { setPreview({ blob: null, url: '' }); return undefined }
    const next = URL.createObjectURL(image.blob); setPreview({ blob: image.blob, url: next })
    return () => URL.revokeObjectURL(next)
  }, [image?.blob])
  // Never render an old image URL alongside a newly cleared image record.
  return image?.blob && image.blob === preview.blob ? preview.url : ''
}
function ImagePicker({ kind, label, value, onChange, onBusy, disabled }) {
  const input = useRef(null), sequence = useRef(0)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const url = useImageUrl(value)
  useEffect(() => () => { sequence.current++ }, [])
  const load = async file => {
    if (!file || disabled) return
    const id = ++sequence.current
    setLoading(true); onBusy(true); setError('')
    try { const image = await readCustomImage(file); if (id === sequence.current) onChange(image) }
    catch (failure) { if (id === sequence.current) setError(failure.message) }
    finally { if (id === sequence.current) { setLoading(false); onBusy(false) } }
  }
  return <section className="custom-upload" aria-label={t(label)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); load(event.dataTransfer.files?.[0]) }}>
    <div className={`custom-upload-preview ${kind}`}>{url ? <img src={url} width={value.width} height={value.height} alt={t('{name}预览', { name: label })} /> : <span>{t('未上传')}</span>}</div>
    <div className="custom-upload-copy"><h3>{t(label)} <span>{t('选填')}</span></h3><p>{value ? `${value.width}×${value.height} · ${(value.blob.size / 1024 / 1024).toFixed(2)} MB` : t('可选择文件或拖入图片')}</p>
      <input ref={input} data-image={kind} type="file" aria-label={t(label)} accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; load(file) }} />
      <div className="custom-upload-actions"><button className="btn btn-sm" type="button" aria-label={t(value ? '替换{name}' : '选择{name}', { name: t(label) })} disabled={loading || disabled} onClick={() => input.current.click()}>{loading ? t('读取中…') : value ? t('替换图片') : t('选择图片')}</button>{value ? <button className="btn btn-sm" type="button" onClick={() => { sequence.current++; setLoading(false); onBusy(false); setError(''); onChange(null) }}>{t('移除')}</button> : null}</div>
      {error ? <p className="custom-field-error" role="alert">{t(error)}</p> : null}
    </div>
  </section>
}

export default function CustomNikkePage() {
  useSyncExternalStore(subscribeCustomNikkes, getCustomNikkeRevision)
  const [params] = useSearchParams(), navigate = useNavigate(), editId = params.get('edit') || ''
  const cacheKey = editId || 'new'
  const loadDraft = () => draftCache.get(cacheKey)?.draft || getCustomNikkes().find(record => record.id === editId) || blank()
  const [draft, setDraft] = useState(loadDraft), [dirty, setDirty] = useState(Boolean(draftCache.get(cacheKey))), [errors, setErrors] = useState({})
  const [message, setMessage] = useState(''), [saving, setSaving] = useState(false), [saved, setSaved] = useState(null), [pendingLeave, setPendingLeave] = useState(null)
  const [imageBusy, setImageBusy] = useState({})
  const [deleteTarget, setDeleteTarget] = useState(null), [libraryBusy, setLibraryBusy] = useState(false), [libraryMessage, setLibraryMessage] = useState('')
  const avatar = useImageUrl(draft.avatarImage), artwork = useImageUrl(draft.artworkImage)
  const storageError = getCustomNikkeError(), formRef = useRef(null)
  useEffect(() => { setDraft(loadDraft()); setDirty(Boolean(draftCache.get(cacheKey))); setErrors({}); setMessage(''); setSaved(null); setImageBusy({}) }, [editId])
  useEffect(() => { if (dirty) draftCache.set(cacheKey, { draft }); else draftCache.delete(cacheKey) }, [cacheKey, draft, dirty])
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    const guard = event => {
      const anchor = event.target.closest?.('a[href]'), href = anchor?.getAttribute('href')
      if (!dirty || event.button !== 0 || event.ctrlKey || event.metaKey || !href?.startsWith('#/')) return
      event.preventDefault(); event.stopPropagation(); setPendingLeave(href.slice(1))
    }
    window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true) }
  }, [dirty])
  const change = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value })); setDirty(true); setMessage('')
    if (errors[key]) setErrors(previous => ({ ...previous, [key]: customFieldErrors({ ...draft, [key]: value })[key] }))
  }
  const blur = key => setErrors(previous => ({ ...previous, [key]: customFieldErrors(draft)[key] }))
  const submit = async event => {
    event.preventDefault()
    if (saving || Object.values(imageBusy).some(Boolean)) return
    const nextErrors = customFieldErrors(draft); setErrors(nextErrors); setMessage('')
    const first = Object.keys(nextErrors)[0]
    if (first) { formRef.current.elements.namedItem(first)?.focus?.(); return }
    setSaving(true)
    try { const result = await saveCustomNikke(draft); draftCache.delete(cacheKey); setDraft(result); setSaved(result); setDirty(false) }
    catch (failure) {
      setMessage(failure.message)
      if (failure.message.includes('同名')) { setErrors(previous => ({ ...previous, nameCn: failure.message })); formRef.current.elements.namedItem('nameCn')?.focus() }
    }
    finally { setSaving(false) }
  }
  const continueAdding = () => { draftCache.delete(cacheKey); draftCache.delete('new'); setDraft(blank()); setDirty(false); setSaved(null); setErrors({}); setMessage(''); navigate('/custom-nikke/new') }
  const cancel = () => { if (dirty) setPendingLeave('/my'); else navigate('/my') }
  const changeDeleted = async (record, deleted) => {
    setLibraryBusy(true); setLibraryMessage('')
    try {
      await setCustomNikkeDeleted(record, deleted)
      if (deleted) {
        draftCache.delete(record.id)
        if (editId === record.id || saved?.id === record.id) { setDirty(false); setDraft(blank()); setSaved(null); navigate('/custom-nikke/new') }
      }
      setDeleteTarget(null)
      setLibraryMessage(t(deleted ? '已删除自定义妮姬，可在“已删除妮姬”中恢复；已有录入数据已保留。' : '已恢复自定义妮姬，原有录入数据可继续使用。'))
    } catch (failure) { setLibraryMessage(failure.message); setDeleteTarget(null) }
    finally { setLibraryBusy(false) }
  }
  const validEdit = !editId || getCustomNikkes().some(record => record.id === editId)
  return <main className="page custom-nikke-page">
    <button type="button" className="back" onClick={cancel}>{t('返回更多')}</button>
    <div className="page-head"><div><h1>{t(editId ? '编辑自定义妮姬' : '新增妮姬')}</h1><div className="desc">{t('补充尚未收录的角色，添加后可在本机使用。')}</div></div><span className="custom-local-badge">{t('仅本机使用')}</span></div>
    <p className="custom-scope-note">{t('本地角色库由当前客户端或浏览器内的各存档共用，不参与分享。')} {t('标有')} <span className="custom-required" aria-hidden="true">*</span> {t('的项目为必填。')}</p>
    {storageError ? <div className="custom-store-error" role="alert">{t(storageError)} <button type="button" className="btn btn-sm" onClick={() => initializeCustomNikkes().catch(() => {})}>{t('重新加载角色库')}</button></div> : null}
    {!validEdit ? <p role="alert">{t('未找到这位自定义妮姬，请从下方列表重新选择。')}</p> : <div className="custom-nikke-layout">
      <div>
        {saved ? <section className="custom-success" role="status"><h2>{t(editId ? '已保存修改：{name}' : '已添加：{name}', { name: saved.nameCn })}</h2><p>{t('现在可以在角色列表中搜索，或直接开始录入数据。')}</p><div className="custom-actions"><Link className="btn btn-primary" to={`/data?code=${saved.id}`}>{t('去录入数据')}</Link><Link className="btn" to={`/character/${saved.id}`}>{t('查看角色')}</Link><button className="btn" type="button" onClick={continueAdding}>{t('继续添加')}</button></div></section> :
        <form ref={formRef} className="custom-nikke-form" onSubmit={submit} noValidate>
          <fieldset disabled={saving}><legend>{t('基本资料')}</legend>
            <label className="custom-field"><span>{t('妮姬名称')} <span className="custom-required" aria-hidden="true">*</span></span><input className="inp" name="nameCn" value={draft.nameCn} maxLength={120} autoComplete="off" aria-required="true" aria-invalid={Boolean(errors.nameCn)} aria-describedby="custom-name-error" onChange={event => change('nameCn', event.target.value)} onBlur={() => blur('nameCn')} placeholder={t('请输入妮姬名称')} /><span id="custom-name-error" className="custom-field-error">{t(errors.nameCn || '')}</span></label>
            <fieldset className="custom-rarity"><legend>{t('品质')} <span className="custom-required" aria-hidden="true">*</span></legend><div>{['R', 'SR', 'SSR'].map(value => <label key={value} data-rarity={value}><input type="radio" name="original_rare" value={value} checked={draft.original_rare === value} onChange={() => change('original_rare', value)} aria-required="true" aria-describedby="custom-rarity-error" />{value}</label>)}</div><span className="custom-field-error" id="custom-rarity-error">{t(errors.original_rare || '')}</span></fieldset>
            <div className="custom-field-grid">{['element', 'corporation', 'class', 'use_burst_skill', 'weapon_type'].map(key => {
              const group = TAXONOMY.filters.find(item => item.key === key)
              return <label className="custom-field" key={key}><span>{t(group.label)} {key === 'weapon_type' ? `（${t('选填')}）` : <span className="custom-required" aria-hidden="true">*</span>}</span><select className="inp" name={key} value={draft[key]} onChange={event => change(key, event.target.value)} onBlur={() => blur(key)} aria-required={key !== 'weapon_type'} aria-invalid={Boolean(errors[key])} aria-describedby={`custom-error-${key}`}><option value="">{t(key === 'weapon_type' ? '暂不设置' : '请选择')}</option>{group.options.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select><span className="custom-field-error" id={`custom-error-${key}`}>{t(errors[key] || '')}</span></label>
            })}</div>
          </fieldset>
          <fieldset disabled={saving}><legend>{t('角色图片')} <span>（{t('选填')}）</span></legend><p className="custom-image-hint">{t('PNG、JPEG 或 WebP，单张不超过10 MB。立绘支持透明背景，原图会完整保留。')}</p>
            {['avatarImage', 'artworkImage'].map((key, index) => <ImagePicker key={`${cacheKey}-${key}`} kind={index ? 'artwork' : 'avatar'} label={index ? '角色立绘' : '角色头像'} value={draft[key]} disabled={saving} onChange={value => change(key, value)} onBusy={value => setImageBusy(previous => ({ ...previous, [key]: value }))} />)}
          </fieldset>
          {message ? <p className="custom-field-error" role="alert">{t(message)}</p> : null}
          <div className="custom-actions"><button className="btn" type="button" onClick={cancel} disabled={saving}>{t('取消')}</button><button className="btn btn-primary" type="submit" disabled={saving || Boolean(storageError) || Object.values(imageBusy).some(Boolean)}>{saving ? t('保存中…') : t(editId ? '保存修改' : '添加妮姬')}</button></div>
        </form>}
      </div>
      <aside className="custom-character-preview" aria-label={t('角色预览')}><h2>{t('角色预览')}</h2><div className="custom-preview-name">{avatar ? <img src={avatar} alt={t('头像预览')} width="56" height="56" /> : <span className="custom-avatar-placeholder">{t('头像')}</span>}<div><strong>{draft.nameCn.trim() || t('妮姬名称')}</strong><span className="custom-local-badge">{t('自定义')}</span></div></div><div className="custom-preview-tags">{['original_rare', 'element', 'class', 'corporation', 'use_burst_skill', 'weapon_type'].map(key => <span key={key}>{labelFor(key, draft[key])}</span>)}</div><div className="custom-preview-art">{artwork ? <img src={artwork} width={draft.artworkImage.width} height={draft.artworkImage.height} alt={t('立绘预览')} /> : <span>{t('上传立绘后在此预览')}</span>}</div><p>{t('预览随填写更新，保存后才会加入角色列表。')}</p></aside>
    </div>}
    <section className="custom-library"><h2>{t('已添加的妮姬')} <span>({getCustomNikkes().length})</span></h2>{getCustomNikkes().length ? <ul>{getCustomNikkes().map(record => <li key={record.id} data-custom-id={record.id}><div><b>{record.nameCn}</b><span>{labelFor('original_rare', record.original_rare)} / {labelFor('element', record.element)} / {labelFor('class', record.class)}</span></div><div className="custom-library-actions"><Link className="btn btn-sm" to={`/custom-nikke/new?edit=${record.id}`} onClick={() => { if (editId === record.id && !dirty) { setSaved(null); setDraft(record) } }}>{t('编辑资料')}</Link><button type="button" className="btn btn-sm custom-delete" aria-label={t('删除{name}', { name: record.nameCn })} disabled={libraryBusy || saving} onClick={() => setDeleteTarget(record)}>{t('删除')}</button></div></li>)}</ul> : <p>{t('还没有自定义妮姬，填写上方资料即可添加。')}</p>}
      {libraryMessage ? <p role="status">{t(libraryMessage)}</p> : null}
      {getDeletedCustomNikkes().length ? <details className="custom-deleted"><summary>{t('已删除妮姬')} ({getDeletedCustomNikkes().length})</summary><p>{t('这里只保存用户删除的自定义妮姬，可恢复原资料、图片与本地身份。内置角色不在此列。')}</p><ul>{getDeletedCustomNikkes().map(record => <li key={record.id} data-deleted-id={record.id}><b>{record.nameCn}</b><button type="button" className="btn btn-sm" disabled={libraryBusy} onClick={() => changeDeleted(record, false)}>{t('恢复')}</button></li>)}</ul></details> : null}
      <p className="custom-scope-note">{t('自定义资料与图片单独保存在本机角色库中，现有存档 JSON 备份不包含该角色库。')}</p></section>
    {deleteTarget ? <ConfirmDialog title="删除自定义妮姬" message={t('确定删除“{name}”吗？只会移除你创建的这位自定义妮姬，可在本页恢复。内置角色与各存档已有录入数据不会被删除。', { name: deleteTarget.nameCn })} confirmText={libraryBusy ? '处理中…' : '删除此自定义妮姬'} danger onConfirm={() => { if (!libraryBusy) changeDeleted(deleteTarget, true) }} onClose={() => { if (!libraryBusy) setDeleteTarget(null) }} /> : null}
    {pendingLeave ? <ConfirmDialog title="尚有未保存的资料" message="离开后会保留本次草稿，返回本页可以继续填写。" confirmText="离开并保留草稿" onConfirm={() => { const destination = pendingLeave; setPendingLeave(null); navigate(destination) }} onClose={() => setPendingLeave(null)} /> : null}
  </main>
}
