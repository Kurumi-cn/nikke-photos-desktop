// Equipment structure only. Empty equipment is valid; no guessing or data repair.
export function equipmentIssue(lines) {
  const rows = Array.from({length:3}, (_,i) => lines?.[i]?.functionType || '')
  if (!rows[0] && rows.slice(1).some(Boolean)) return '第一条词条不能为空；请补齐第一条，或清空本件装备'
  const seen = new Map()
  for (const [i,type] of rows.entries()) {
    if (!type) continue
    if (seen.has(type)) return `第${seen.get(type)+1}条与第${i+1}条词条重复；同件装备的非空词条必须不同`
    seen.set(type,i)
  }
  return ''
}

export function assertEquipmentChanges(before = {}, after = {}) {
  for (const [code,record] of Object.entries(after || {})) {
    for (let slot=0;slot<4;slot++) {
      const lines = record?.equipments?.[slot]
      if (JSON.stringify(lines) === JSON.stringify(before?.[code]?.equipments?.[slot])) continue
      const issue = equipmentIssue(lines)
      if (issue) throw Error(`角色${code} · ${['头部','躯干','臂部','腿部'][slot]}：${issue}`)
    }
  }
}
