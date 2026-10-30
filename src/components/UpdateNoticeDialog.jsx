// 「版本更新」提示：存在更新条目且已读版本与当前版本不一致时显示。
// 勾了「不再提醒」才记录已读版本号（见 lib/updateNotice.js），没勾下次还会弹。
import { useEffect, useState } from 'react'
import { CHANGELOG, CURRENT_VERSION, displayDate } from '../data/changelog.js'
import { markVersionSeen } from '../lib/updateNotice.js'
import { t } from '../lib/i18n.js'
import '../styles/changelog.css'

export default function UpdateNoticeDialog({ onClose }) {
  const [mute, setMute] = useState(false)
  const entry = CHANGELOG[0]

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!entry) return null

  const close = () => {
    if (mute) markVersionSeen(CURRENT_VERSION)
    onClose()
  }

  return (
    <div
      className="dlg-mask"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="dlg" role="dialog" aria-label={t('版本更新')}>
        <div className="dlg-head">
          <h2>{t('版本更新')}</h2>
          <button type="button" className="dlg-x" onClick={close} aria-label={t('关闭')}>×</button>
        </div>

        <div className="dlg-body dlg-body-scroll">
          <p className="cl-range">v{CURRENT_VERSION}</p>
          <ol className="cl-items">
            {entry.items.map((item, index) => (
              <li key={item}>{index + 1}、{item}</li>
            ))}
          </ol>
          <div className="cl-date">{displayDate(entry.date)}</div>

          <label className="cl-mute">
            <input
              type="checkbox"
              checked={mute}
              onChange={(event) => setMute(event.target.checked)}
            />
            <span>{t('不再提醒（有新版本时仍会提示）')}</span>
          </label>
        </div>

        <div className="dlg-foot">
          <button type="button" className="btn btn-primary" onClick={close}>{t('知道了')}</button>
        </div>
      </div>
    </div>
  )
}
