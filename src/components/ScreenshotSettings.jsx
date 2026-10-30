import {useEffect,useState} from 'react'
const size=bytes=>`${(bytes/1024/1024).toFixed(2)} MB`
export default function ScreenshotSettings({bridge,disabled}){
 const [stats,setStats]=useState(null),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 useEffect(()=>{let alive=true;bridge?.screenshots?.('stats').then(v=>{if(alive){setStats(v);setDraft(v.settings)}}).catch(e=>{if(alive)setError(e.message)});const timer=setInterval(()=>bridge?.screenshots?.('stats').then(v=>{if(alive)setStats(v)}).catch(()=>{}),2000);return()=>{alive=false;clearInterval(timer)}},[bridge])
 async function act(command,args){
  setSaving(true);setError('');setMessage('')
  try{const value=await bridge.screenshots(command,args);setStats(value);setDraft(value.settings);if(command==='clean')setMessage(`已清理 ${value.deleted} 张，释放 ${size(value.freedBytes)}${value.protectedBytes?'；任务或断点需要的图片已保留':''}`);else if(command==='settings')setMessage('截图设置已保存')}
  catch(e){setError(e.message)}finally{setSaving(false)}
 }
 const locked=disabled||saving||stats?.activeTasks>0
 return <section className="maa-card" aria-label="截图管理">
  <h2>截图管理</h2>
  <p>过程图在任务结束时清理。待核对的装备图暂时保留，点击结果页“结束核对”后按下方规则清理；识别结果和角色档案会保留。</p>
  {stats&&<><p aria-live="polite">当前截图：{stats.count} 张 · {size(stats.bytes)} / 上限 {stats.settings.maxMiB} MB{stats.protectedBytes>0?` · 任务或断点保留 ${size(stats.protectedBytes)}`:''}</p>
   <p className="maa-screenshot-path">新截图存放位置：{stats.settings.directory}</p>
   {stats.locations.filter(v=>v.directory!==stats.settings.directory).map(v=><p className="maa-screenshot-path" key={v.directory}>原位置：{v.directory} · {size(v.bytes)}</p>)}
   <div className="maa-actions">
    <label>装备结果图清理<select aria-label="装备结果图清理" disabled={locked} value={draft.equipmentCleanup} onChange={e=>setDraft({...draft,equipmentCleanup:e.target.value})}><option value="task">每次任务结束</option><option value="character">每个角色完成后</option></select></label>
    <label>异常截图保留<select aria-label="异常截图保留" disabled={locked} value={draft.exceptionDays} onChange={e=>setDraft({...draft,exceptionDays:Number(e.target.value)})}><option value={0}>任务结束清理</option><option value={1}>1 天</option><option value={3}>3 天（默认）</option><option value={7}>7 天</option></select></label>
    <label>容量上限（MB）<input aria-label="截图容量上限" type="number" min="16" max="102400" step="1" disabled={locked} value={draft.maxMiB} onChange={e=>setDraft({...draft,maxMiB:Number(e.target.value)})}/></label>
    <button disabled={locked||!draft} onClick={()=>act('settings',{equipmentCleanup:draft.equipmentCleanup,exceptionDays:draft.exceptionDays,maxMiB:draft.maxMiB})}>保存截图设置</button>
   </div>
   <p>异常图从截图保存时计时，下次启动自动清理过期图片。容量满时提示，不强删运行中或保留期内的图片。</p>
   <div className="maa-actions"><button disabled={locked} onClick={()=>act('directory')}>更改截图存放位置</button><button disabled={saving} onClick={()=>act('stats')}>刷新截图占用</button><button disabled={locked} onClick={()=>act('clean')}>一键清理截图</button></div>
   <p>更改位置用于后续截图；原位置的受管理图片仍计入统计，也可以一键清理。</p>
   {stats.errors.length>0&&<p role="alert">{stats.errors.join('；')}</p>}
  </>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="maa-error">{error}</p>}
 </section>
}
