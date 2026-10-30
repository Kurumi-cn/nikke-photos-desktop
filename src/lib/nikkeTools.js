// Each tool keeps its mounted state when switching top-level tabs.
export const NIKKE_TOOLS = Object.freeze([
  { id: 'core-dust', name: '红球计算器', status: 'ready', entry: 'tools/core-dust/index.html', origin: 'tools' },
  { id: 'equipment-reroll', name: '洗词条计算器', status: 'ready', entry: 'tools/equipment-reroll/index.html', origin: 'reroll' },
  { id:'equipment-simulator', name:'装备洗练模拟器', status:'ready', entry:'tools/equipment-reroll/simulator/index.html', origin:'reroll' },
  { id:'resource-income', name:'订制模组记录', status:'ready', kind:'native' },
])
export const DEFAULT_NIKKE_TOOL = NIKKE_TOOLS[0]
