import {useEffect,useRef,useState} from 'react'
import {BUILTIN_CHARACTERS,displayName,labelFor,matchesSearch,iconFor,assetUrl} from '../lib/roster.js'
import {isCnCharacter} from '../lib/cnRoster.js'
import {applyFilters,countActiveFilters} from '../lib/roster.js'
import FilterBar from './FilterBar.jsx'
import CharacterAvatar from './CharacterAvatar.jsx'
import ScreenshotSettings from './ScreenshotSettings.jsx'
import CollectionResults from './CollectionResults.jsx'
import {pinyin} from 'pinyin-pro'

const slots=[['head','头部'],['chest','胸甲'],['hands','手部'],['legs','腿部']]
const collectionCharacters=BUILTIN_CHARACTERS.filter(isCnCharacter)
const collectionCodes=new Set(collectionCharacters.map(c=>c.nameCode))
const byCode=new Map(BUILTIN_CHARACTERS.map(c=>[c.nameCode,c]))
const fullPinyin=new Map(BUILTIN_CHARACTERS.map(c=>[c.nameCode,pinyin(c.nameCn,{toneType:'none'}).replace(/\s+/g,'').toLowerCase()]))
function CollectionRoleIcons({character}) {
 return <span className="collection-role-icons">{[['element',character.element],['use_burst_skill',character.use_burst_skill]].map(([key,value])=>{
  const path=iconFor(key,value),label=labelFor(key,value)
  return path?<img key={key} className={key==='element'?'collection-element-icon':'collection-burst-icon'} src={assetUrl(path)} alt={label} title={label}/>:<span key={key}>{label}</span>
 })}</span>
}
const stages={idle:'准备采集',starting:'正在启动',completed:'采集完成',failed:'采集中断',canceled:'已停止',interrupted:'有未完成的任务'}
const stateLabel={complete:'已完成',skipped:'已跳过',collecting:'正在截图',recognizing:'后台识别中'}
const emptyLabel={non_overload:'非T10装备',unequipped:'未装备',unearned:'未获得效果'}
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`}
const rowText=row=>row.status==='empty'?emptyLabel[row.reason]||'空词条':row.status==='ok'?`${row.name} ${Number(row.value).toFixed(2)}%`:'未识别，待核对'

export default function CollectionPanel({bridge,disabled,hwnd,onActive,includeScreenshots=false}){
 const [tab,setTab]=useState('select'),[query,setQuery]=useState(''),[selected,setSelected]=useState({}),[toggles,setToggles]=useState({collectible:false,overSpec:false}),[onlySelected,setOnlySelected]=useState(false)
 const [codes,setCodes]=useState([]),[status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false)
 const [keys,setKeys]=useState({pause:'F8',stop:'F9'}),[now,setNow]=useState(Date.now()),[resultFilter,setResultFilter]=useState('all'),[saveNote,setSaveNote]=useState(''),[archiveNotice,setArchiveNotice]=useState('')
 const revision=useRef(0),polling=useRef(false),activeCallback=useRef(onActive)
 activeCallback.current=onActive
 useEffect(()=>{
  let alive=true
  async function initialize(){
   if(!bridge)return
   try{
    const [v,p]=await Promise.all([bridge.request('collectionStatus'),bridge.request('collectionPreferences')])
    if(!alive)return
    setStatus(v);activeCallback.current?.(!!v.active)
    setCodes((v.active?v.nameCodes:p.nameCodes).filter(code=>collectionCodes.has(code)));setKeys(v.active?v.keys:p.keys);setReady(true)
    if(v.active)setTab('progress')
   }catch(e){if(alive)setError('无法读取采集状态：'+e.message)}
  }
  initialize()
  const timer=setInterval(async()=>{
   setNow(Date.now());if(!bridge||polling.current)return
   const token=revision.current;polling.current=true
   try{const v=await bridge.request('collectionStatus');if(alive&&token===revision.current){setStatus(v);activeCallback.current?.(!!v.active)}}
   catch(e){if(alive)setError('进度连接异常，任务可能仍在运行：'+e.message)}
   finally{polling.current=false}
  },1000)
  return()=>{alive=false;clearInterval(timer)}
 },[bridge])
 const active=!!status?.active,locked=active||busy||disabled
 useEffect(()=>{
  if(!ready||locked||!keys.pause.trim()||!keys.stop.trim()||keys.pause===keys.stop)return
  const timer=setTimeout(()=>{
   bridge.request('collectionPreferences',{nameCodes:codes,keys}).then(()=>setSaveNote('选择与快捷键已保存')).catch(e=>setError('保存设置失败：'+e.message))
  },450)
  return()=>clearTimeout(timer)
 },[bridge,ready,locked,codes,keys])
 const filtered=applyFilters(collectionCharacters,{selected,toggles}).filter(c=>(matchesSearch(c,query)||fullPinyin.get(c.nameCode).includes(query.toLowerCase().replace(/\s+/g,'')))&&(!onlySelected||codes.includes(c.nameCode)))
 const activeCount=countActiveFilters(selected,toggles)
 const toggleOption=(key,value)=>setSelected(old=>({...old,[key]:(old[key]||[]).includes(value)?old[key].filter(v=>v!==value):[...(old[key]||[]),value]}))
 const clearFilters=()=>{setSelected({});setToggles({collectible:false,overSpec:false})}
 const records=(status?.nameCodes||[]).map(code=>status?.draft?.[code]).filter(Boolean)
 const complete=records.filter(c=>c.status==='complete').length,skipped=records.filter(c=>c.status==='skipped')
 const unread=records.flatMap(c=>slots.flatMap(([slot,label])=>(c.equipment?.[slot]?.rows||[]).filter(r=>r.status==='unreadable').map(r=>`${c.name} · ${label} · 第${r.position}条`)))
 const equipmentCount=records.reduce((sum,c)=>sum+Object.keys(c.equipment||{}).length,0)
 const total=status?.nameCodes?.length||0,finished=complete+skipped.length
 const percentage=total?Math.round(finished/total*100):0
 const terminal=status&&['failed','canceled','interrupted'].includes(status.stage)
 const currentName=status?.progress?.currentName||status?.currentName
 const statusText=status?.paused?'已暂停':active?(status.stage==='recognizing'?'已返回大厅，后台识别中':status.progress?.phase||'等待 UAC / 初始化'):stages[status?.stage]||'准备采集'
 const visibleRecords=records.filter(c=>resultFilter==='all'||resultFilter==='skipped'&&c.status==='skipped'||resultFilter==='unreadable'&&Object.values(c.equipment||{}).some(s=>s.rows?.some(r=>r.status==='unreadable')))

 function receiveResults(v){
  revision.current++;setStatus(v);onActive?.(!!v.active)
  if(v.archiveSaved){
   setCodes([]);setTab('select');setQuery('');setSelected({});setToggles({collectible:false,overSpec:false});setOnlySelected(false);setResultFilter('all');setSaveNote('');setError('')
   setArchiveNotice(`已写入「${v.archiveSaved.profileName}」：${v.archiveSaved.count} 名角色。本轮采集记录已清空。`)
  }
 }
 async function act(command,args){
  revision.current++;setBusy(true);setError('');setArchiveNotice('')
  try{
   if(command==='collectionStart')await bridge.request('collectionPreferences',{nameCodes:args.nameCodes,keys})
   const v=await bridge.request(command,args);setStatus(v);activeCallback.current?.(!!v.active)
   if(command==='collectionStart'){setCodes(args.nameCodes);setTab('progress')}
  }catch(e){setError(e.message)}finally{revision.current++;setBusy(false)}
 }
 function select(code){setSaveNote('');setCodes(old=>old.includes(code)?old.filter(v=>v!==code):[...old,code])}
 function move(index,delta){setCodes(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next})}
 function exportDraft(){
  const url=URL.createObjectURL(new Blob([JSON.stringify(status?.draft||{},null,2)],{type:'application/json'}))
  const a=document.createElement('a');a.href=url;a.download=`NIKKE-装备采集草稿-${status.runId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 const start=()=>act('collectionStart',{nameCodes:codes,hwnd:hwnd||undefined,keys})
 const resume=()=>act('collectionStart',{nameCodes:status.nameCodes,resumeRunId:status.runId,hwnd:hwnd||undefined,keys})

 return <section className="collection-workspace" aria-label="角色装备采集">
  <div className="collection-summary"><div><span className="collection-eyebrow">角色装备采集</span><h2>{statusText}</h2><p>{active?`${currentName||'正在准备游戏连接'} · 进度会自动保存`:'先选择角色，再启动采集。结果保存为草稿，供你核对。'}</p></div><div className="collection-summary-actions"><span>已选 {codes.length} / {collectionCharacters.length}</span><button className="collection-primary" disabled={!bridge||!ready||locked||!codes.length} onClick={start}>启动所选角色采集（UAC）</button></div></div>
  <div className="collection-tabs" role="tablist" aria-label="采集工作区">{[['select','选择角色'],['progress','执行进度'],['results','结果核对'],['settings','采集设置']].map(([id,label])=><button key={id} id={`collection-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`collection-panel-${id}`} onClick={()=>setTab(id)}>{label}{id==='results'&&records.length>0?<span className="collection-count">{records.length}</span>:null}</button>)}</div>
  {archiveNotice&&<p role="status" className="collection-notice">{archiveNotice}</p>}
  {error&&<p role="alert" className="collection-notice maa-error">{error}</p>}
  {terminal&&!active&&<div className="collection-notice"><strong>{stages[status.stage]}</strong><p>{status.error||'进度已保存。已完成的角色不会重复累计，中断角色将重新核对并读取。'}</p><button disabled={!bridge||busy||disabled||!ready} onClick={resume}>从中断角色继续（UAC）</button></div>}
  {status?.stage==='completed'&&!active&&<div className="collection-notice"><strong>本轮已完成{status.returnedToLobby?'，已返回大厅':''}</strong><p>完成 {complete} 名，跳过 {skipped.length} 名；{unread.length} 条词条需要核对。</p><button onClick={()=>setTab('results')}>查看本轮结果</button></div>}

  <div role="tabpanel" id="collection-panel-select" aria-labelledby="collection-tab-select" hidden={tab!=='select'}>
   <div className="collection-select-layout"><section className="maa-card collection-browser"><h3>角色库 <span className="collection-muted">{filtered.length} 名</span></h3>
    <p className="collection-muted">仅显示国服名单中的角色，当前共 {collectionCharacters.length} 名。</p>
    <label className="collection-search collection-roster-search">搜索角色<input aria-label="采集角色搜索" disabled={locked} value={query} onChange={e=>setQuery(e.target.value)} placeholder="中文名 / 英文名 / 资源号 / 拼音 / 别名"/></label>
    <fieldset className="collection-shared-filters" disabled={locked} aria-label="采集角色筛选">
      <FilterBar selected={selected} toggles={toggles} activeCount={activeCount} onToggleOption={toggleOption} onToggleSwitch={key=>setToggles(old=>({...old,[key]:!old[key]}))} onClear={clearFilters} hiddenSwitches={['cnPublished']}/>
    </fieldset>
    <div className="collection-list-actions"><label><input type="checkbox" disabled={locked} checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/>只看已选</label><button disabled={locked||!filtered.length} onClick={()=>setCodes(old=>[...new Set([...old,...filtered.map(c=>c.nameCode)])])}>选择当前筛选</button><button disabled={locked||!codes.length} onClick={()=>setCodes([])}>清空选择</button></div>
    <div className="maa-roster" aria-label="采集角色列表">{filtered.map(c=><label className={`maa-roster-item${codes.includes(c.nameCode)?' selected':''}`} key={c.nameCode}><input aria-label={`采集 ${c.nameCn}`} type="checkbox" checked={codes.includes(c.nameCode)} disabled={locked} onChange={()=>select(c.nameCode)}/><CharacterAvatar path={c.avatar} alt=""/><span><strong>{displayName(c)}</strong><CollectionRoleIcons character={c}/></span></label>)}</div>
    {!filtered.length&&<div className="collection-empty">没有符合条件的角色。<button onClick={()=>{setQuery('');clearFilters();setOnlySelected(false)}} disabled={locked}>重置筛选</button></div>}
   </section><aside className="maa-card collection-queue"><h3>采集顺序 <span className="collection-muted">{codes.length} 名</span></h3><p>按顺序逐个读取，可调整先后。</p>{!codes.length?<div className="collection-empty">从左侧勾选需要采集的角色</div>:<ol aria-label="采集顺序">{codes.map((code,index)=>{const c=byCode.get(code);return <li key={code}><span className="collection-order">{index+1}</span><CharacterAvatar path={c?.avatar} alt=""/><strong>{displayName(c)}</strong><div><button disabled={locked||index===0} aria-label={`上移 ${c.nameCn}`} onClick={()=>move(index,-1)}>↑</button><button disabled={locked||index===codes.length-1} aria-label={`下移 ${c.nameCn}`} onClick={()=>move(index,1)}>↓</button><button disabled={locked} aria-label={`移除 ${c.nameCn}`} onClick={()=>select(code)}>×</button></div></li>})}</ol>}<small className="collection-muted">{saveNote||'本次打开期间保留选择，重开软件后清空。'}</small></aside></div>
  </div>

  <div role="tabpanel" id="collection-panel-progress" aria-labelledby="collection-tab-progress" hidden={tab!=='progress'}>
   <section className="maa-card"><div className="collection-progress-heading"><div><h3>{statusText}</h3><p>{currentName?`当前角色：${currentName}`:'启动后会先确认游戏处于大厅。'}{status?.returnedToLobby?' · 已返回大厅':''}</p></div><span>{status?.createdAt?duration((active?now:status.finishedAt||now)-status.createdAt):'尚未开始'}</span></div>
    <progress aria-label="采集总进度" max="100" value={percentage}/><div className="collection-metrics"><div><strong>{finished} / {total}</strong><span>已处理角色</span></div><div><strong>{complete}</strong><span>完成</span></div><div><strong>{skipped.length}</strong><span>跳过</span></div><div><strong>{equipmentCount}</strong><span>已截图部位</span></div><div><strong>{unread.length}</strong><span>待核对词条</span></div></div>
    {status?.pendingOCR>0&&<p role="status">后台待识别 {status.pendingOCR} 件装备{status.returnedToLobby?'，游戏操作已结束，正在保存结果':'，游戏截图继续进行'}。</p>}
    <div role="status" className="maa-collection-status">{statusText} · 已完成 {complete} / {total} · 跳过 {skipped.length}{status?.returnedToLobby?' · 已返回大厅':''}</div>
    <div className="maa-actions"><button disabled={!active||busy||status?.stage==='recognizing'} onClick={()=>act('collectionPause')}>{status?.paused?'继续采集':'暂停采集'}</button><button className="collection-stop" disabled={!active||busy} onClick={()=>act('collectionCancel')}>停止采集并保存进度</button><span className="collection-muted">{status?.keys?.pause||keys.pause} 暂停 / 继续 · {status?.keys?.stop||keys.stop} 停止</span></div>
    <ol className="collection-task-queue" aria-label="任务角色进度">{(status?.nameCodes||[]).map(code=>{const entry=status.draft?.[code];return <li key={code} data-state={entry?.status||'pending'}><span>{byCode.get(code)?.nameCn}</span><span>{stateLabel[entry?.status]||'等待采集'}{entry?.status==='collecting'?` · ${Object.keys(entry.equipment||{}).length}/4`:''}</span></li>})}</ol>
   </section><section className="maa-card"><h3>任务日志</h3><pre aria-label="采集任务日志">{status?.logs?.join('\n')||'暂无任务日志'}</pre><p>暂停与停止会保留进度。恢复时重新核对页面、角色和装备部位。</p></section>
  </div>

  <div role="tabpanel" id="collection-panel-results" aria-labelledby="collection-tab-results" hidden={tab!=='results'}>
   <section className="maa-card"><div className="collection-progress-heading"><div><h3>采集结果与核对</h3><p>点击词条修改，核对后确认写入当前本地档案。</p></div><button disabled={active||!records.length} onClick={exportDraft}>导出结果草稿 JSON</button></div>
    {skipped.length>0&&<div role="alert" className="collection-notice"><strong>跳过 {skipped.length} 名角色</strong><ul>{skipped.map(c=><li key={c.nameCode}>{c.name}：{c.reason}</li>)}</ul></div>}
    {unread.length>0&&<div role="alert" className="collection-notice"><strong>{unread.length} 条词条需核对，候选尚未写入档案</strong><ul>{unread.map(v=><li key={v}>{v}</li>)}</ul></div>}
    <div className="collection-result-filters" aria-label="结果筛选">{[['all','全部结果'],['unreadable','需要核对'],['skipped','已跳过']].map(([id,label])=><button key={id} aria-pressed={resultFilter===id} onClick={()=>setResultFilter(id)}>{label}</button>)}</div>
    {!visibleRecords.length&&<div className="collection-empty">{records.length?'此分类没有结果':'完成采集后，这里会显示每名角色的四件装备词条。'}</div>}
    {records.length>0&&<CollectionResults status={status} records={records} visibleRecords={visibleRecords} bridge={bridge} onStatus={receiveResults}/>}
    {status?.folder&&<details className="collection-file-detail"><summary>结果保存位置</summary><p>{status.folder}\draft.json</p><small>草稿和进度独立保存；截图清理不会删除这些结果。</small></details>}
   </section>
  </div>

  <div role="tabpanel" id="collection-panel-settings" aria-labelledby="collection-tab-settings" hidden={tab!=='settings'}>
   <section className="maa-card"><h3>快捷键与采集规则</h3><div className="maa-actions"><label>暂停 / 继续快捷键<input aria-label="采集暂停快捷键" disabled={locked} value={keys.pause} onChange={e=>setKeys({...keys,pause:e.target.value})}/></label><label>停止快捷键<input aria-label="采集停止快捷键" disabled={locked} value={keys.stop} onChange={e=>setKeys({...keys,stop:e.target.value})}/></label></div><p>默认 F8 暂停 / 继续，F9 停止。支持如 Ctrl+F8 的组合键；快捷键被占用时会提示并取消启动。</p><ul className="collection-rules"><li>无法判别的角色跳过，在结果中列出原因。</li><li>非T10、未装备、未获得效果分别记录为空；看不清的词条留空并提醒。</li><li>遇到未知页面时停止并保存进度，不自动补点。</li><li>本次打开期间可以从中断角色继续；关闭软件后清空采集记录，已写入档案保留。</li></ul></section>
   {includeScreenshots&&<ScreenshotSettings bridge={bridge} disabled={locked}/>}
  </div>
 </section>
}
