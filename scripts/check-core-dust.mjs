import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const base = path.resolve(import.meta.dirname, '../tools/core-dust')
const chapters = JSON.parse(fs.readFileSync(path.join(base, 'public/json/chapters.json')))
const outpost = JSON.parse(fs.readFileSync(path.join(base, 'public/json/outpost.json')))
const flat = chapters.Chapters.flatMap(g => g.Sections.map(s => ({ id: s.id, section: s.Section, chapterName: g.Chapter })))
const outputs = Object.fromEntries(outpost.outpost.map(item => [item.level, item]))
const normalBase = flat.find(c => c.section.startsWith('2-12'))
const fixture = name => JSON.parse(JSON.stringify(name === 'chapters' ? chapters : outpost))

function calculator(file, initialStorage = {}) {
  const source = fs.readFileSync(path.join(base, file), 'utf8').split('<script setup>')[1].split('</script>')[0]
    .replace(/^import .*$/gm, '')
  const writes = new Map(Object.entries(initialStorage))
  const context = vm.createContext({
    ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }),
    watch() {}, onMounted() {}, onUnmounted() {}, QuestionFilled: {}, license: '',
    localStorage: { getItem: key => writes.get(key) ?? null, setItem: (key, value) => writes.set(key, value) },
    document: { baseURI: 'nikke://tools/core-dust/index.html' },
    location: { protocol: 'nikke:', origin: 'nikke://tools' }, parent: { postMessage() {} },
    fetch: async url => ({ ok: true, json: async () => fixture(url.includes('chapters') ? 'chapters' : 'outpost') }),
    URL, console, setTimeout, clearTimeout,
  })
  vm.runInContext(source + `\nglobalThis.api = {
    selectedEasyMode, selectedHardMode, selectedEasyModeTable, selectedCnLevelCorrection,
    displayMode, showHalfPoints, chaptersData, outpostData, baseDefenseLevel, progressCurrent,
    resourceOutput, tableData, calculateBaseDefenseLevel, updateTableData,
    handleEasyModeChange, handleHardModeChange, handleCnLevelCorrectionChange, loadData,
    ${file.includes('upstream') ? '' : 'loading, loadError, latestServer, keepLatestChapter, handleKeepLatestChange, handleLatestServerChange,'}
  };`, context)
  context.api.chaptersData.value = flat
  context.api.outpostData.value = outputs
  return { api: context.api, writes }
}
const upstream = calculator('vendor/NikkeCalc.upstream.vue').api
const { api: adapted } = calculator('src/App.vue')
const normalize = value => JSON.parse(JSON.stringify(value))

let comparisons = 0
for (const easy of [normalBase, ...flat.filter((_, i) => i % 173 === 0 && i >= Number(normalBase.id)), flat.at(-1)]) {
  for (const hard of [flat[0], flat[75], flat[400], flat.at(-1)]) {
    for (const correction of [0, 1, 2, 3]) {
      for (const api of [upstream, adapted]) {
        api.selectedEasyMode.value = [easy.chapterName, easy.id]
        api.selectedHardMode.value = [hard.chapterName, hard.id]
        api.selectedCnLevelCorrection.value = correction
        api.calculateBaseDefenseLevel()
      }
      assert.equal(adapted.baseDefenseLevel.value, upstream.baseDefenseLevel.value)
      assert.equal(adapted.progressCurrent.value, upstream.progressCurrent.value)
      assert.deepEqual(normalize(adapted.resourceOutput.value), normalize(upstream.resourceOutput.value))
      comparisons++
    }
  }
}
console.log(`上游等级 / 进度 / 六项产出一致：${comparisons} 组（含超出产出覆盖范围）`)

let tableComparisons = 0
for (const easy of [normalBase, flat[400], flat[1000], flat.at(-1)]) {
  for (const correction of [0, 3]) for (const order of ['asc', 'desc']) for (const half of ['true', 'false']) {
    for (const api of [upstream, adapted]) {
      api.selectedEasyModeTable.value = easy.id
      api.selectedCnLevelCorrection.value = correction
      api.displayMode.value = order
      api.showHalfPoints.value = half
      api.updateTableData()
    }
    assert.deepEqual(normalize(adapted.tableData.value), normalize(upstream.tableData.value))
    const rates = adapted.tableData.value.map(row => Number(row.coreDust))
    assert.ok(rates.every((rate, i) => i === 0 || (order === 'desc' ? rate >= rates[i - 1] : rate <= rates[i - 1])))
    tableComparisons++
  }
}
console.log(`上游参考表一致、排序正确：${tableComparisons} 组（含 .5 显示 / 隐藏）`)

const instance = calculator('src/App.vue', { 'nikke-photos-profile-index': 'sentinel', 'nikke-tools:core-dust:v1': '{bad json' })
await instance.api.loadData()
console.log('默认表格行数:', instance.api.tableData.value.length);
assert.equal(instance.api.loadError.value, '')
assert.equal(instance.api.selectedCnLevelCorrection.value, 3)
const stage = flat.find(c => c.section.startsWith('10-10'))
instance.api.handleEasyModeChange([stage.chapterName, stage.id])
assert.deepEqual(normalize(instance.api.selectedEasyMode.value), normalize(instance.api.selectedEasyModeTable.value))
assert.ok(Array.isArray(instance.api.selectedEasyMode.value))
const stored = JSON.parse(instance.writes.get('nikke-tools:core-dust:v1'))
assert.equal(stored.ebid, stage.id)
assert.equal(instance.writes.get('nikke-photos-profile-index'), 'sentinel')
assert.deepEqual([...instance.writes.keys()].sort(), ['nikke-photos-profile-index', 'nikke-tools:core-dust:v1'])
const restored = calculator('src/App.vue', Object.fromEntries(instance.writes))
await restored.api.loadData()
assert.deepEqual(normalize(restored.api.selectedEasyMode.value), [stage.chapterName, stage.id])
const invalid = calculator('src/App.vue', { 'nikke-tools:core-dust:v1': JSON.stringify({ ebid: '-1', hbid: 'missing', cnlv: 99, order: 'invalid', half: 'invalid' }) })
await invalid.api.loadData()
assert.equal(invalid.api.selectedCnLevelCorrection.value, 3)
assert.equal(invalid.api.loadError.value, '')
console.log('普通进度与参考表同步、完整选择路径、坏设置回退、独立存储与恢复通过')

// Source update: selectable stages, saved preferences and "latest" must reach the new final chapter.
assert.equal(flat.at(-1).section, '50-36 BOSS')
assert.equal(flat.length, 1875)
assert.equal(new Set(flat.map(c => c.id)).size, flat.length)
assert.ok(flat.some(c => c.section === '49-36 BOSS'))
for (const stageName of ['49-36 BOSS','50-36 BOSS']) {
  const entry = flat.find(c => c.section === stageName)
  instance.api.handleEasyModeChange([entry.chapterName, entry.id])
  const restored = calculator('src/App.vue', Object.fromEntries(instance.writes))
  await restored.api.loadData()
  assert.deepEqual(normalize(restored.api.selectedEasyMode.value), [entry.chapterName,entry.id])
}
instance.api.latestServer.value = 'global'
instance.api.keepLatestChapter.value = true
instance.api.handleKeepLatestChange(true)
assert.equal(instance.api.selectedEasyMode.value[1], flat.at(-1).id)
instance.api.latestServer.value = 'cn'
instance.api.handleLatestServerChange('cn')
assert.equal(instance.api.selectedEasyMode.value[1], flat.find(c => c.section.startsWith('40-36')).id)
for (const [level, dust] of [[204,'39.66'],[214,'40.23'],[542,'71.1'],[641,'77.46'],[659,'78.57']]) assert.equal(outputs[level].core_dust,dust)
console.log('49/50章选择与恢复、国际服最新50-36、国服独立进度与来源数据修正通过')
