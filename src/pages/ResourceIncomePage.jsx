import {useEffect,useState} from 'react'
import {localToday,validateRecord,resourceStatistics} from '../../electron/resource-income-model.mjs'
import '../styles/resourceIncome.css'
import moduleImage from '../assets/resources/custom-module.png'
import keyImage from '../assets/resources/custom-lock.png'
const RESOURCE_IMAGES={stones:moduleImage,keys:keyImage}
function ResourceLabel({type,label,iconOnly=false}){
  return <span className={`income-resource-label${iconOnly?' icon-only':''}`} title={label}><img src={RESOURCE_IMAGES[type]} alt={iconOnly?label:''}/>{!iconOnly&&<span>{label}</span>}</span>
}
const empty=()=>({date:localToday(),stones:'',keys:''})
const average=value=>value===null?'—':value.toLocaleString('zh-CN',{maximumFractionDigits:2})
export default function ResourceIncomePage(){
  const api=window.nikkeDesktop?.resourceIncome
  const [records,setRecords]=useState([]),[form,setForm]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[deleting,setDeleting]=useState(null),[path,setPath]=useState('')
  async function load(){
    setLoading(true);setError('')
    try{if(!api)throw Error('请在桌面客户端使用此工具，以确保记录保存到正式数据目录。');const [doc,info]=await Promise.all([api.read(),window.nikkeDesktop.getInfo()]);setRecords(doc.records);setPath(info.dataRoot+'/tools/resource-income.json')}
    catch(e){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])
  const today=localToday(),stats=resourceStatistics(records,today),existing=records.some(r=>r.date===form.date)
  function choose(date){const row=records.find(r=>r.date===date);setForm(row?{date,stones:row.stones??'',keys:row.keys??''}:{date,stones:'',keys:''});setNotice('');setDeleting(null)}
  async function save(event){
    event.preventDefault();setError('');setNotice('');setBusy(true)
    try{const doc=await api.save(validateRecord(form,today));setRecords(doc.records);setNotice(existing?'已更新该日记录。':'已保存当日收入。')}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function remove(){
    const date=deleting;setBusy(true);setError('');setNotice('')
    try{const doc=await api.remove(date);setRecords(doc.records);if(form.date===date)setForm({date,stones:'',keys:''});setDeleting(null);setNotice('已删除 '+date+' 的记录。')}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function exportBackup(){setBusy(true);setError('');setNotice('');try{const result=await api.exportBackup();if(!result.canceled)setNotice('JSON 备份已导出。')}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="resource-income" aria-label="订制模组记录">
    <header className="income-heading"><div><h1>订制模组记录</h1><p>记录每天实际获得的订制模组和自订秘钥，仅统计收入。</p></div><button type="button" onClick={exportBackup} disabled={!api||loading||busy||!!error}>导出 JSON 备份</button></header>
    {loading&&<p role="status">正在读取正式数据…</p>}
    {error&&<div className="income-error" role="alert">{error}<button type="button" disabled={busy} onClick={load}>重新读取</button></div>}
    {notice&&<p className="income-notice" role="status">{notice}</p>}
    <form onSubmit={save} className="income-card income-form">
      <h2>{existing?'编辑该日收入':'补录 / 记录当日收入'}</h2>
      <fieldset disabled={!api||loading||busy}>
        <label>日期<input id="income-date" type="date" min="1900-01-01" max={today} value={form.date} required onChange={e=>choose(e.target.value)}/></label>
        <label><ResourceLabel type="stones" label="订制模组"/><input id="income-stones" type="number" min="0" step="1" value={form.stones} placeholder="未填写" onChange={e=>setForm({...form,stones:e.target.value})}/></label>
        <label><ResourceLabel type="keys" label="自订秘钥"/><input id="income-keys" type="number" min="0" step="1" value={form.keys} placeholder="未填写" onChange={e=>setForm({...form,keys:e.target.value})}/></label>
        <button type="submit" id="income-save">{busy?'处理中…':existing?'更新该日记录':'保存记录'}</button>
        <button type="button" onClick={()=>choose(today)}>回到今天</button>
      </fieldset>
      <p>每天一条，选择已有日期会载入原记录。至少填写一种；空白为未填写，0 为确认零收入。</p>
    </form>
    <div className="income-statistics">
      {[[stats.all,'累计记录收入'],[stats.week,'最近 7 天'],[stats.month,'最近 30 天']].map(([summary,title])=><section className="income-card" key={title} aria-label={title}>
        <h2>{title}</h2><p>{summary.recordedDays} 个已记录日期{summary.calendarDays!==null&&` / ${summary.calendarDays} 个日历日（含今天）`}</p>
        <dl>{[['stones','订制模组'],['keys','自订秘钥']].map(([key,label])=><div key={key}><dt><ResourceLabel type={key} label={label} iconOnly/></dt><dd><strong>{summary[key].total}</strong> {summary.calendarDays!==null?'期间收入':'累计收入'}<small>已填写 {summary[key].days} 天{summary.calendarDays!==null&&` · 日均 ${average(summary[key].average)}`}</small></dd></div>)}</dl>
      </section>)}
    </div>
    <p className="income-explanation">日均 = 窗口内该资源的记录收入 ÷ 该资源已填写天数。未记录日期、该资源留空均不按零计入；没有填写时显示“—”。两种资源单独计算，不代表库存。</p>
    <section className="income-card"><h2>历史记录 <small>共 {records.length} 天</small></h2>
      {deleting&&<div className="income-delete" role="alert">删除 {deleting} 的收入记录？<button id="income-delete-confirm" type="button" disabled={busy} onClick={remove}>确认删除</button><button type="button" disabled={busy} onClick={()=>setDeleting(null)}>取消</button></div>}
      <div className="income-table-wrap"><table><thead><tr><th>日期</th><th><ResourceLabel type="stones" label="订制模组"/></th><th><ResourceLabel type="keys" label="自订秘钥"/></th><th>操作</th></tr></thead><tbody>
        {records.map(row=><tr key={row.date} data-income-date={row.date}><td>{row.date}</td><td>{row.stones??'未填写'}</td><td>{row.keys??'未填写'}</td><td><button type="button" disabled={busy} onClick={()=>choose(row.date)}>编辑</button><button type="button" disabled={busy} onClick={()=>{setDeleting(row.date);setNotice('')}}>删除</button></td></tr>)}
        {!records.length&&<tr><td colSpan="4">{loading?'正在读取…':'暂无收入记录，未记录日期不会自动补零。'}</td></tr>}
      </tbody></table></div>
    </section>
    {path&&<p className="income-storage">正式数据：{path}；每次更新前保留上一版 .bak 文件。可导出 JSON 作为独立备份。本工具记录独立于角色存档。</p>}
  </section>
}

