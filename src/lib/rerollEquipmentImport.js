import { AFFIX_TIER_VALUES, FUNCTION_LABELS } from '../data/affixTiers.js'

export const EQUIPMENT_IMPORT_SLOTS = ['头部', '躯干', '臂部', '腿部']
/** Read-only snapshot: never attach the source record, profile, ID or images. */
export function toRerollEquipmentSnapshot(record) {
  if (!Array.isArray(record?.equipments) || record.equipments.length < 4) throw Error('四件装备尚未录入完整，请先完善角色数据')
  const equipments = record.equipments.slice(0, 4).map((slot, slotIndex) => {
    if (!Array.isArray(slot)) throw Error(`${EQUIPMENT_IMPORT_SLOTS[slotIndex]}装备数据无效`)
    const rows = Array.from({ length: 3 }, () => ({ stat: '空词条', tier: 0 })), positions = new Set(), stats = new Set()
    for (const [index, line] of slot.entries()) {
      if (!line?.functionType) continue
      const position = line.position == null ? index + 1 : Number(line.position)
      const tiers = AFFIX_TIER_VALUES[line.functionType], stat = FUNCTION_LABELS[line.functionType]
      const label = `${EQUIPMENT_IMPORT_SLOTS[slotIndex]}第${position}条`
      if (!Number.isInteger(position) || position < 1 || position > 3 || positions.has(position)) throw Error(`${label}位置重复或无效，请先核对录入数据`)
      if (!tiers || !stat || stats.has(stat)) throw Error(`${label}词条未知或重复，请先核对录入数据`)
      let tier
      const hasTier = line.level != null && String(line.level).trim() !== ''
      const hasValue = line.value != null && String(line.value).trim() !== ''
      if (hasTier) tier = Number(line.level)
      else if (hasValue) tier = tiers.findIndex(value => Math.abs(value - Number(line.value)) < 0.005) + 1
      if (!Number.isInteger(tier) || tier < 1 || tier > 15) throw Error(`${label}缺少有效档位，请先在数据录入中补全`)
      if (hasValue && (!Number.isFinite(Number(line.value)) || Math.abs(tiers[tier - 1] - Number(line.value)) >= 0.005)) throw Error(`${label}数值与档位不一致，请先核对`)
      positions.add(position); stats.add(stat); rows[position - 1] = { stat, tier }
    }
    if (!positions.size) throw Error(`${EQUIPMENT_IMPORT_SLOTS[slotIndex]}装备没有有效词条`)
    if (!positions.has(1)) throw Error(`${EQUIPMENT_IMPORT_SLOTS[slotIndex]}第一条词条不能为空，请先核对录入数据`)
    return rows
  })
  return { version: 1, equipments }
}
