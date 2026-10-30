import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../lib/i18n.js'
import '../styles/capture-source.css'

export default function CaptureSourceDialog() {
  const [request, setRequest] = useState(null)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const currentId = useRef(null)
  const bridge = window.nikkeDesktop?.sourcePicker

  useEffect(() => bridge?.subscribe(next => {
    currentId.current = next.id
    setSelected(null); setBusy(false); setError(''); setRequest(next)
  }), [bridge])
  useEffect(() => {
    if (!request) return undefined
    const dialog = dialogRef.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [request?.id])

  if (!request) return null
  const validSelection = request.entries.find(entry => entry.key === selected)
  const finish = async key => {
    if (busy && key !== null) return
    try {
      const accepted = await bridge.finish(request.id, key)
      if (accepted) { currentId.current = null; setRequest(null) }
      else setError(t('窗口列表已变化，请刷新后重新选择。'))
    } catch { setError(t('无法完成选择，请重试或关闭对话框。')) }
  }
  const refresh = async () => {
    setBusy(true); setError('')
    try {
      const entries = await bridge.refresh(request.id)
      if (currentId.current !== request.id) return
      setSelected(key => entries.some(entry => entry.key === key) ? key : null)
      setRequest(previous => ({ ...previous, entries }))
    } catch {
      if (currentId.current === request.id) setError(t('刷新失败，请检查窗口状态后重试。'))
    } finally { if (currentId.current === request.id) setBusy(false) }
  }

  return createPortal(
    <dialog ref={dialogRef} className="dlg capture-source-dialog" aria-labelledby="capture-source-title" aria-describedby="capture-source-reason"
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}
      onCancel={event => { event.preventDefault(); finish(null) }}>
      <form onSubmit={event => { event.preventDefault(); if (validSelection && !busy) finish(selected) }}>
        <div className="dlg-head">
          <h2 id="capture-source-title">{t('选择 OCR 截图来源')}</h2>
          <button type="button" className="dlg-x" aria-label={t('取消选择')} onClick={() => finish(null)}>×</button>
        </div>
        <div className="capture-source-intro">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M12 8v3m0 2v1" /></svg>
          <div><p id="capture-source-reason">{t(request.reason)}</p><span>{t('请选择要识别的窗口，截图将继续使用该窗口的完整画面。')}</span></div>
        </div>
        <div className="capture-source-toolbar"><h3>{t('可用窗口')} <span>({request.entries.length})</span></h3><button type="button" className="btn btn-sm" onClick={refresh} disabled={busy}>{busy ? t('刷新中…') : t('刷新窗口列表')}</button></div>
        <div className="capture-source-list" role="group" aria-label={t('截图来源窗口')} aria-busy={busy}>
          {request.entries.length ? request.entries.map(entry => (
            <label key={entry.key} className="capture-source-item">
              <input type="radio" name="capture-source" value={entry.key} checked={selected === entry.key} onChange={() => setSelected(entry.key)} disabled={busy} />
              <span className="capture-source-copy"><span className="capture-source-name" title={entry.name}>{entry.name || t('未命名窗口')}</span><span className="capture-source-meta">{entry.process || t('进程信息不可用')}{entry.pid ? ` · PID ${entry.pid}` : ''}</span></span>
              <span className="capture-source-selected" aria-hidden="true">{selected === entry.key ? t('已选中') : ''}</span>
            </label>
          )) : <div className="capture-source-empty"><b>{t('暂无可选窗口')}</b><p>{t('请启动游戏或恢复已最小化的窗口，然后点击“刷新窗口列表”。')}</p></div>}
        </div>
        <div className="capture-source-status" role="status" aria-live="polite">{error || (busy ? t('正在更新可用窗口…') : validSelection ? t('已选择：{name}', { name: validSelection.name }) : t('选择一个窗口后继续。'))}</div>
        <div className="dlg-foot"><button type="button" className="btn" onClick={() => finish(null)}>{t('取消')}</button><button type="submit" className="btn btn-primary" disabled={!validSelection || busy}>{t('选择此窗口')}</button></div>
      </form>
    </dialog>, document.body,
  )
}
