export const RESOURCE_INCOME_VERSION = 1
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
export function validDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false
  const d = new Date(value+'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value
}
function quantity(value) {
  if(value === null || value === undefined || value === '') return null
  if(typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw Error('数量需为非负整数，或留空')
  const n=Number(value)
  if(!Number.isSafeInteger(n) || n<0) throw Error('数量需为有效范围内的非负整数')
  return n
}
export function validateRecord(input, today=localToday()) {
  if(!input || !validDate(input.date) || input.date>today) throw Error('请选择有效日期，不能记录未来收入')
  const stones=quantity(input.stones),keys=quantity(input.keys)
  if(stones===null && keys===null) throw Error('请至少填写一种资源的实际收入')
  return {date:input.date,stones,keys}
}
export function validateDocument(doc) {
  if(!doc || doc.version!==RESOURCE_INCOME_VERSION || !Array.isArray(doc.records)) throw Error('资源记录格式或版本不受支持，未覆盖原文件')
  const seen=new Set()
  const records=doc.records.map(row=>{
    // Future-dated files are rejected instead of silently used by statistics.
    const value=validateRecord(row)
    if(seen.has(value.date)) throw Error('资源记录中存在重复日期，未覆盖原文件')
    seen.add(value.date);return value
  })
  return {version:RESOURCE_INCOME_VERSION,records:records.sort((a,b)=>b.date.localeCompare(a.date))}
}
export function resourceStatistics(records,today=localToday()) {
  if(!validDate(today)) throw Error('无效统计日期')
  function summarize(rows,calendarDays=null) {
    const out={recordedDays:rows.length,calendarDays}
    for(const name of ['stones','keys']) {
      const filled=rows.filter(r=>r[name]!==null && r[name]!==undefined)
      const total=filled.reduce((s,r)=>s+BigInt(r[name]),0n)
      // Totals stay exact even when many safe-integer records exceed Number.MAX_SAFE_INTEGER.
      out[name]={total:total.toString(),days:filled.length,average:filled.length ? Number(total)/filled.length : null}
    }
    return out
  }
  const end=new Date(today+'T00:00:00Z')
  const window=days=>{
    const begin=new Date(end);begin.setUTCDate(begin.getUTCDate()-days+1)
    const start=begin.toISOString().slice(0,10)
    return summarize(records.filter(r=>r.date>=start&&r.date<=today),days)
  }
  return {all:summarize(records.filter(r=>r.date<=today)),week:window(7),month:window(30)}
}
