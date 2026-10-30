import { useEffect, useRef, useState } from 'react'
import {Link} from 'react-router-dom'
import '../styles/automationLab.css'
import ScreenshotSettings from '../components/ScreenshotSettings'
import CollectionPanel from '../components/CollectionPanel'

export default function MaaNikkeLabPage() {
 const bridge=window.nikkeDesktop?.maanikke
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[info,setInfo]=useState(null),[windows,setWindows]=useState([])
 const [selected,setSelected]=useState(''),[connected,setConnected]=useState(null),[capture,setCapture]=useState(null)
 const [result,setResult]=useState(null),[input,setInput]=useState(null),[admin,setAdmin]=useState(null),[logs,setLogs]=useState([])
 const generation=useRef(0),mounted=useRef(true)
 const [collectionActive,setCollectionActive]=useState(false)
 useEffect(()=>{mounted.current=true;const timer=setInterval(()=>bridge?.logs().then(v=>{if(mounted.current)setLogs(v.lines)}).catch(()=>{}),1500);return()=>{mounted.current=false;generation.current++;clearInterval(timer)}},[bridge])
 async function run(command,args){
  const token=++generation.current;setBusy(command);setError('')
  try{
   const value=await bridge.request(command,args)
   if(!mounted.current||token!==generation.current)return
   if(command==='initialize')setInfo(value)
   if(command==='windows'){setWindows(value.windows);setSelected(value.windows[0]?.hwnd||'');if(!value.count)setError('未检测到国服游戏窗口。请手动启动游戏并进入大厅，再检测。')}
   if(command==='connect'){setConnected(value.target);setCapture(null);setResult(null)}
   if(command==='capture'){setCapture(value);setResult(null)}
   if(command==='analyze'){setCapture(value.capture);setResult(value)}
   if(command==='inputTest')setInput(value)
   if(command==='adminEnterNikke'){
    setAdmin(value);setInfo(null);setConnected(null)
    const final=value.after?.at(-1)
    if(final&&value.image){setCapture({...final.capture,image:value.image});setResult(final)}
   }
  }catch(e){if(mounted.current&&token===generation.current)setError(e.message)}
  finally{if(mounted.current&&token===generation.current)setBusy('')}
 }
 async function stop(){generation.current++;setBusy('stopping');try{await bridge.stop();setInfo(null);setConnected(null);setCapture(null);setResult(null);setError('模块已停止，可重新初始化。')}catch(e){setError(e.message)}finally{setBusy('')}}
 return <main className="page maa-lab">
  <h1>自动化实验室</h1><p>MaaNikke 集成测试模式 · 国服《胜利女神：新的希望》</p>
  <Link className="collection-entry" to="/equipment-collection">打开装备采集 → 选择角色、查看进度与结果</Link>
  <div className="maa-card">完整装备采集请使用上方入口。下面保留普通截图识别、独立输入窗口与管理员单次导航，供连接诊断使用。</div>
  {!bridge&&<p role="alert">请使用自动化开发副本的 Electron 客户端打开。</p>}
  <CollectionPanel bridge={bridge} disabled={!!busy} hwnd={selected} onActive={setCollectionActive}/>
  <div className="maa-actions">
   <button disabled={!bridge||!!busy||collectionActive} onClick={()=>run('initialize')}>初始化 MaaNikke</button>
   <button disabled={!info||!!busy||collectionActive} onClick={()=>run('windows')}>检测国服窗口</button>
   <button disabled={!bridge||busy==='stopping'} onClick={stop}>停止并断开</button>
  </div>
  <div className="maa-card" role="status">{busy?`运行中：${({initialize:'初始化资源和 Agent',windows:'检测窗口',connect:'建立连接',capture:'获取截图',analyze:'识别大厅 / 妮姬列表',inputTest:'独立窗口单次输入验证',adminEnterNikke:'等待 UAC 与单次测试，请确认后切回游戏',stopping:'停止'})[busy]}`:info?`已初始化 · Python / 原生 ${info.binding} / ${info.native} · Agent ${info.agentConnected?'已连接':'未连接'}`:'尚未初始化'}</div>
  {error&&<div className="maa-card maa-error" role="alert">{error}</div>}
  <div className="maa-actions"><label>国服窗口 <select aria-label="国服窗口" disabled={!!busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">请选择</option>{windows.map(w=><option key={w.hwnd} value={w.hwnd}>{w.title} · PID {w.pid} · HWND {w.hwnd}</option>)}</select></label>
   <button disabled={!selected||!!busy||!info} onClick={()=>run('connect',{hwnd:selected})}>连接所选窗口</button>
   <button disabled={!connected||!!busy} onClick={()=>run('capture')}>获取游戏截图</button>
   <button disabled={!connected||!!busy} onClick={()=>run('analyze')}>新截图并识别大厅 / 妮姬</button>
  </div>
  {connected&&<p>已连接：{connected.title} · PID {connected.pid} · FramePool / SendMessageWithCursorPos（游戏输入关闭）</p>}
  {capture&&<section className="maa-card"><h2>游戏截图</h2><p>原图 {capture.width}×{capture.height} · {new Date(capture.capturedAt*1000).toLocaleTimeString()}</p><div style={{position:'relative'}}><img style={{width:'100%',display:'block'}} src={capture.image} alt="MaaNikke实时游戏截图"/>{result?.nikkeBox&&<div aria-label="妮姬按钮命中框" style={{position:'absolute',pointerEvents:'none',border:'2px solid #00d58c',left:`${result.nikkeBox[0]/capture.width*100}%`,top:`${result.nikkeBox[1]/capture.height*100}%`,width:`${result.nikkeBox[2]/capture.width*100}%`,height:`${result.nikkeBox[3]/capture.height*100}%`}}/>}</div></section>}
  {result&&<section className="maa-card" aria-label="MaaNikke识别结果"><h2>识别结果</h2><p>大厅：{result.lobby?'命中':'未确认'} · 妮姬按钮：{result.nikkeLocated?'已定位':'未定位'} · 原图坐标：{JSON.stringify(result.nikkeBox)}</p><p>妮姬列表：{result.listPage?.verified?'已确认':'未确认'} · 左上标题：{result.listPage?.title?'命中':'未命中'} · 标题/信息图标：{result.listPage?.header?'命中':'未命中'} · 筛选栏：{result.listPage?.toolbar?'命中':'未命中'}</p>{result.listPage&&<p>控件：{Object.entries(result.listPage.controls).map(([name,hit])=>`${({Search:'搜索',BurstI:'I',BurstII:'II',BurstIII:'III',Favorite:'收藏',Circle:'圆形筛选',Sort:'战斗力排序'})[name]} ${hit?'✓':'未命中'}`).join(' · ')}</p>}<p>Agent RotatedOCR：{result.agentRotatedOCR.hit?'命中':'未命中'}。模板分数表示匹配程度，不代表正确概率；首阶段仅支持16:9，识别基准1280×720。</p><details><summary>节点结果与匹配详情</summary><pre>{JSON.stringify({...result,capture:undefined},null,2)}</pre></details></section>}
  <section className="maa-card"><h2>管理员单次进入妮姬</h2><p>请先手动返回游戏大厅。点击后本人确认 Windows UAC，并切回游戏；等待8秒及两帧预检后最多点击一次。点击后先等3秒，再最多观察6帧，连续两帧匹配列表标题和筛选栏才判成功。失败不补点，不操作列表内按钮。</p><button disabled={!selected||!info||!!busy} onClick={()=>run('adminEnterNikke',{hwnd:selected})}>请求提权并单次进入妮姬</button>{admin&&<p role="status">{admin.passed?'已进入并确认妮姬列表':admin.canceled?'已取消 UAC':admin.error||admin.note||'未通过'} · 输入请求 {admin.inputRequests} 次</p>}</section>
  <section className="maa-card"><h2>独立 Windows 输入验证</h2><p>新建测试窗口后发送一次 MaaNikke 同款输入，核对接收端 down / up / 按钮激活次数；测试后自动关闭窗口。不会向游戏发送输入。</p><button disabled={!info||!!busy} onClick={()=>run('inputTest')}>启动独立窗口并验证一次输入</button>{input&&<p role="status">{input.passed?'验证通过':'验证未通过'} · API {String(input.apiSucceeded)} · down {input.received.down} / up {input.received.up} / 激活 {input.received.activated}</p>}</section>
  <ScreenshotSettings bridge={bridge} disabled={!!busy||collectionActive}/>
  <section className="maa-card"><h2>运行与错误日志</h2><pre aria-label="自动化运行日志" style={{maxHeight:280,overflow:'auto',whiteSpace:'pre-wrap'}}>{logs.join('\n')||'暂无日志'}</pre></section>
  <details className="maa-card"><summary>采集接口说明</summary><p>当前加载15个无动作识别节点和只读 Agent；管理员单次导航在独立模块受限执行。角色/装备结果进入待确认草稿，再由现有档案入口保存。</p></details>
 </main>
}
