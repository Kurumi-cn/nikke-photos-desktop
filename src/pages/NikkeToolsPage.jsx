import { useEffect, useRef, useState } from 'react'
import { currentLocale, t } from '../lib/i18n.js'
import { DEFAULT_NIKKE_TOOL, NIKKE_TOOLS } from '../lib/nikkeTools.js'
import '../styles/nikkeTools.css'
import ResourceIncomePage from './ResourceIncomePage.jsx'
import RerollEquipmentImportDialog from '../components/RerollEquipmentImportDialog.jsx'

function ToolFrame({ tool, active }) {
  const frame = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [importRequest, setImportRequest] = useState(null)
  const locale = currentLocale()
  // Separate Electron origin: calculators cannot read the host's character localStorage.
  const entry = location.protocol === 'nikke:'
    ? `nikke://${tool.origin}/${tool.entry.replace('tools/', '')}`
    : `${import.meta.env.BASE_URL}${tool.entry}`
  const src = `${entry}?theme=${theme}&locale=${locale}`

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme || 'light'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    const receive = (event) => {
      if (event.source !== frame.current?.contentWindow) return
      const expectedOrigin = new URL(src, location.href).origin
      if (event.origin !== expectedOrigin) return
      if (activeRef.current && ['nikke-tools:file-drop', 'nikke-tools:file-drag'].includes(event.data?.type)) {
        window.dispatchEvent(new CustomEvent('nikke:tool-file-drop', { detail:event.data }))
      }
      const simulatorRequest=tool.id==='equipment-simulator' && event.data?.type==='nikke-simulator:request-import' && ['single','character'].includes(event.data.scope)
      const calculatorRequest=tool.id==='equipment-reroll' && event.data?.type==='nikke-reroll:request-import' && (!event.data.purpose || event.data.purpose==='expectation')
      if ((simulatorRequest || calculatorRequest) && activeRef.current && typeof event.data.requestId === 'string' && event.data.requestId.length <= 80) {
        const purpose=simulatorRequest ? 'simulator-'+event.data.scope : 'expectation'
        const resultType=simulatorRequest ? 'nikke-simulator:import-result' : 'nikke-reroll:import-result'
        setImportRequest({ requestId: event.data.requestId, target: event.source, origin: event.origin, purpose, resultType })
      }
      if (event.data?.type === (tool.id==='equipment-simulator' ? 'nikke-simulator:cancel-import' : 'nikke-reroll:cancel-import'))setImportRequest(current => current?.requestId===event.data.requestId ? null : current)
      if (event.data?.type === 'nikke-tools:ready') { window.clearTimeout(timer); setLoaded(true); setFailed(false) }
      if (event.data?.type === 'nikke-tools:error') setFailed(true)
    }
    window.addEventListener('message', receive)
    const timer = window.setTimeout(() => setFailed(true), 20000)
    return () => { window.removeEventListener('message', receive); window.clearTimeout(timer) }
  }, [src, retry])
  useEffect(() => { setImportRequest(current => {
    if(current)current.target.postMessage({type:current.resultType,requestId:current.requestId,canceled:true},current.origin)
    return null
  }) }, [src, retry, active])
  const finishImport = payload => {
    importRequest?.target.postMessage({ type: importRequest.resultType, requestId: importRequest.requestId, ...(payload ? { payload } : { canceled: true }) }, importRequest.origin)
    setImportRequest(null)
  }

  // Stop the timeout after a successful ready message.
  useEffect(() => { if (loaded) setFailed(false) }, [loaded])

  return (
    <section className="nikke-tool-panel" hidden={!active} role="tabpanel" id={`panel-${tool.id}`} aria-labelledby={`tab-${tool.id}`}>
      {!loaded && !failed && <div className="tools-status" role="status">{t('正在加载{tool}…', { tool:t(tool.name) })}</div>}
      {failed && <div className="tools-status tools-error" role="alert">
        {t('计算器未能正常加载，请重试。')}
        <button type="button" onClick={() => setRetry(value => value + 1)}>{t('重新加载')}</button>
      </div>}
      <iframe key={retry} ref={frame} src={src} title={t(tool.name)} className="nikke-tool-frame"
        sandbox="allow-scripts allow-same-origin" onError={() => setFailed(true)} />
      {importRequest ? <RerollEquipmentImportDialog key={importRequest.requestId} purpose={importRequest.purpose} onClose={() => finishImport(null)} onImport={finishImport} /> : null}
    </section>
  )
}


export default function NikkeToolsPage() {
  const [selected, setSelected] = useState(DEFAULT_NIKKE_TOOL.id)
  const [visited, setVisited] = useState([DEFAULT_NIKKE_TOOL.id])
  const select = (id) => {
    setVisited(value => value.includes(id) ? value : [...value, id])
    setSelected(id)
  }
  return <main className="nikke-tools-page" aria-label={t('妮姬工具')}>
    <nav className="tools-switcher" role="tablist" aria-label={t('工具切换')}>
      {NIKKE_TOOLS.filter(tool => tool.status === 'ready').map(tool =>
        <button key={tool.id} type="button" role="tab" id={`tab-${tool.id}`} aria-controls={`panel-${tool.id}`}
          aria-selected={selected === tool.id} onClick={() => select(tool.id)}>{t(tool.name)}</button>)}
    </nav>
    {NIKKE_TOOLS.filter(tool => visited.includes(tool.id)).map(tool =>
      tool.kind === 'native' ? <section key={tool.id} hidden={selected !== tool.id} className="nikke-tool-panel" role="tabpanel" id={`panel-${tool.id}`} aria-labelledby={`tab-${tool.id}`}><ResourceIncomePage /></section> : <ToolFrame key={tool.id} tool={tool} active={selected === tool.id} />)}
  </main>
}
