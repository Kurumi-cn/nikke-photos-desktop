import {useEffect,useState} from 'react'
import CollectionPanel from '../components/CollectionPanel.jsx'
import '../styles/automationLab.css'

export default function EquipmentCollectionPage(){
 const bridge=window.nikkeDesktop?.maanikke
 const [windows,setWindows]=useState([]),[hwnd,setHwnd]=useState(''),[checking,setChecking]=useState(false),[active,setActive]=useState(false),[error,setError]=useState('')
 const [connection,setConnection]=useState(null)
 useEffect(()=>{if(active)setConnection(null)},[active])
 async function connect(){
  setChecking(true);setError('')
  try{const v=await bridge.request('prepareGame',{hwnd:hwnd||undefined});setWindows(v.windows);setHwnd(v.target?.hwnd||'');setConnection(v.connected?v.target:null);if(!v.connected)setError(v.error)}
  catch(e){setError(e.message)}finally{setChecking(false)}
 }
 return <main className="page maa-lab collection-page">
  <header className="collection-heading"><div><span className="collection-eyebrow">NIKKE PHOTOS · 自动化</span><h1>装备采集</h1><p>选择角色，读取装备词条，核对后写入本地档案。</p></div></header>
  {!bridge&&<p role="alert" className="maa-card">请使用完整版 Windows 桌面客户端打开此功能。</p>}
  <section className="collection-connection" aria-label="游戏连接设置"><div><strong>国服《胜利女神：新的希望》</strong><p>游戏保持1920×1080、未最小化。启动前请进入大厅；可以由其他窗口遮挡。</p><p role="status">{active?'采集任务运行中':checking?'正在初始化、检测并连接游戏…':connection?`已连接：${connection.title} · PID ${connection.pid}`:'点击右侧按钮，一次完成初始化、检测和连接。'}</p></div><div className="maa-actions"><button className="collection-primary" disabled={!bridge||active||checking} onClick={connect}>{checking?'正在连接…':connection?'重新连接游戏':'初始化并连接游戏'}</button>{windows.length>1&&<select aria-label="采集目标窗口" disabled={active||checking} value={hwnd} onChange={e=>{setHwnd(e.target.value);setConnection(null)}}><option value="">请选择游戏窗口</option>{windows.map(w=><option value={w.hwnd} key={w.hwnd}>{w.title} · PID {w.pid}</option>)}</select>}</div></section>
  {error&&<p role="alert" className="maa-error">{error}</p>}
  <CollectionPanel bridge={bridge} disabled={checking||windows.length>1&&!hwnd} hwnd={hwnd} onActive={setActive} includeScreenshots/>
 </main>
}
