<template>
  <main class="calculator">
    <header class="calculator-head">
      <div><div class="eyebrow">妮姬工具 / 前哨基地</div><h1>红球计算器<span class="local-badge">本地计算</span></h1>
        <p>选择已通关的战役进度，查看资源产出与下一档芯尘提升。</p></div>
    </header>
    <div v-if="loading" class="status" role="status">正在读取本地关卡与产出数据…</div>
    <div v-if="loadError" class="status error" role="alert">{{ loadError }} <el-button @click="loadData">重试</el-button></div>
    <div class="calculator-columns" :aria-busy="loading">
      <section class="panel input-panel" aria-labelledby="input-title">
        <div class="section-label">01 / 输入</div><h2 id="input-title">战役进度</h2>
        <p class="section-hint">选择关卡即表示已通关。修改后，右侧产出和下方参考表会同步更新。</p>
        <label class="field-label" for="normal-stage">普通战役</label>
        <el-cascader id="normal-stage" v-model="selectedEasyMode" :options="easyModeOptions" :props="cascaderProps"
          :disabled="loading || !!loadError || keepLatestChapter" placeholder="请选择普通战役关卡" @change="handleEasyModeChange" />
        <div class="latest-row"><el-checkbox v-model="keepLatestChapter" :disabled="loading || !!loadError" @change="handleKeepLatestChange">保持最新章节</el-checkbox>
          <el-radio-group v-model="latestServer" size="small" :disabled="!keepLatestChapter || loading || !!loadError" @change="handleLatestServerChange">
            <el-radio-button value="cn">国服</el-radio-button><el-radio-button value="global">国际服</el-radio-button>
          </el-radio-group></div>
        <p class="field-help">“最新”以随应用提供的数据为准，不会在线更新。</p>
        <label class="field-label" for="hard-stage">困难战役</label>
        <el-cascader id="hard-stage" v-model="selectedHardMode" :options="hardModeOptions" :props="cascaderProps"
          :disabled="loading || !!loadError" placeholder="请选择困难战役关卡" @change="handleHardModeChange" />
        <label class="field-label" for="level-correction">国服等级修正
          <el-tooltip content="上游默认修正为 3 关。请对照游戏中的基地等级和进度调整；国际服可从 0 开始核对。" placement="top"><el-icon><QuestionFilledIcon /></el-icon></el-tooltip>
        </label>
        <el-select id="level-correction" v-model="selectedCnLevelCorrection" :disabled="loading || !!loadError" @change="handleCnLevelCorrectionChange">
          <el-option v-for="item in cnLevelCorrectionOptions" :key="item.value" :label="item.label + ' 关'" :value="item.value" />
        </el-select>
        <p class="field-help">此修正会同时影响基地等级、每小时产出和参考表。默认沿用上游的 3 关。</p>
        <div class="storage-note">仅在本机记住计算器设置，与角色存档独立。</div>
      </section>
      <section class="panel result-panel" aria-labelledby="result-title" aria-live="polite">
        <div class="section-label">02 / 计算结果</div><h2 id="result-title">前哨基地资源产出</h2>
        <template v-if="!loading && !loadError">
          <div class="level-summary"><div><span class="muted">基地防御等级</span><div class="level-value">Lv. <span id="levelDisplay">{{ baseDefenseLevel }}</span></div></div>
            <div class="level-progress"><span>下一等级进度 <b id="progressText">{{ progressCurrent }}/5</b></span>
              <div class="segments" role="progressbar" :aria-valuenow="progressCurrent" aria-valuemin="0" aria-valuemax="5" aria-label="基地升级进度"><i v-for="n in 5" :key="n" :class="{ active: n <= progressCurrent }" /></div></div></div>
          <h3>基础每 1 小时产出</h3>
          <div class="resources"><div><span>信用点</span><b id="creditValue">{{ resourceOutput.credit }}</b></div><div><span>战斗数据辑</span><b id="battleValue">{{ resourceOutput.battle_data_set }}</b></div><div><span>芯尘（红球）</span><b id="chipValue">{{ resourceOutput.core_dust }}</b></div></div>
          <h3>战术学院满级 · 每 1 小时产出</h3>
          <div class="resources enhanced"><div><span>信用点</span><b id="creditMulValue">{{ resourceOutput.credit_mul }}</b></div><div><span>战斗数据辑</span><b id="battleMulValue">{{ resourceOutput.battle_data_set_mul }}</b></div><div class="core-resource"><span>芯尘（红球）</span><b id="chipMulValue">{{ resourceOutput.core_dust_mul }}</b></div></div>
          <p class="section-hint" v-if="resourceOutput.core_dust === '-'">此进度超出当前产出数据覆盖范围，暂无对应产出。</p>
          <p class="section-hint" v-else>普通 / 困难战役与等级修正共同决定基地等级，再按本地产出表查询。数值可能有 ±0.01 显示误差。</p>
        </template>
        <p v-else class="section-hint">数据加载完成后显示计算结果。</p>
      </section>
    </div>
    <section class="panel reference-panel" aria-labelledby="table-title">
      <div class="reference-heading"><div><div class="section-label">03 / 进度参考</div><h2 id="table-title">芯尘参考表<span class="small-label">战术学院满级</span></h2>
        <p class="section-hint">以当前普通战役进度为基准，列出困难战役推进中的芯尘速率提升节点；困难进度影响上方产出，不改变本表基准。</p></div>
        <div class="table-controls"><label for="display-order">排序</label><el-select id="display-order" v-model="displayMode" @change="updateTableData"><el-option value="desc" label="升序" /><el-option value="asc" label="降序" /></el-select>
          <label for="half-points">显示 .5 档</label><el-select id="half-points" v-model="showHalfPoints" @change="updateTableData"><el-option value="true" label="显示" /><el-option value="false" label="隐藏" /></el-select></div></div>
      <div class="table-wrap"><table><thead><tr><th>困难章节</th><th>基地等级</th><th>芯尘 / 小时</th></tr></thead>
        <tbody><tr v-for="item in tableData" :key="item.hardChapter + item.level"><td>{{ item.hardChapter }}</td><td>{{ item.level }}</td><td class="dust-rate">{{ item.coreDust }}</td></tr>
          <tr v-if="!tableData.length"><td colspan="3" class="empty">{{ loading ? '正在加载数据…' : '当前进度与显示条件下暂无提升节点。' }}</td></tr></tbody></table></div>
      <p class="table-note">共 {{ tableData.length }} 个提升节点 · 普通战役修改后自动刷新；数据覆盖范围外的关卡不列入。</p>
    </section>
    <footer class="calculator-footer"><span>本地数据版本 {{ dataVersion || '—' }}</span></footer>
  </main>
</template>
<script setup>

// Adapted from zbxzbx98 (MIT); the unmodified source is in ../vendor.

import { ref, onMounted, computed, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'

/**
 * 国服「普通模式」最新进度关卡（章节前缀，如 '40-36'）。
 * ★ 每次国服更新章节后，只需要修改这一处。
 */
const CN_LATEST_EASY_STAGE = '40-36'

// 数据引用
const selectedCnLevelCorrection = ref(3)
const selectedEasyMode = ref([])
const selectedHardMode = ref([])
const selectedEasyModeTable = ref([])
const keepLatestChapter = ref(false)   // 保持最新章节（普通关自动跟踪最新进度）
const latestServer = ref('cn')         // 跟踪进度：'cn' = 国服 / 'global' = 国际服
const displayMode = ref('asc')
const showHalfPoints = ref('true')
const baseDefenseLevel = ref(1)
const progressCurrent = ref(0)
const tableData = ref([])
const chaptersData = ref([])
const outpostData = ref({})
const resourceOutput = ref({
  credit: '-',
  battle_data_set: '-',
  core_dust: '-',
  credit_mul: '-',
  battle_data_set_mul: '-',
  core_dust_mul: '-'
})

const QuestionFilledIcon = QuestionFilled

// 国服等级修正选项
const cnLevelCorrectionOptions = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' }
]

// 级联选择器属性
const cascaderProps = {
  value: 'id',
  label: 'label',
  children: 'children',
  expandTrigger: 'hover'
}

// 分组数据
const easyModeGroups = computed(() => groupChaptersByType('easy'))
const hardModeGroups = computed(() => groupChaptersByType('hard'))
const easyModeTableGroups = computed(() => groupChaptersByType('easyTable'))

// 级联选项
const easyModeOptions = computed(() => generateCascaderOptions('easy'))
const hardModeOptions = computed(() => generateCascaderOptions('hard'))
const easyModeTableOptions = computed(() => generateCascaderOptions('easyTable'))

// 生成级联选项
function generateCascaderOptions(mode) {
  const groups = mode === 'easy' ? easyModeGroups.value : 
                 mode === 'hard' ? hardModeGroups.value : 
                 easyModeTableGroups.value
  const options = []
  
  Object.keys(groups).forEach(groupName => {
    const group = {
      id: groupName,
      label: groupName,
      children: []
    }
    
    groups[groupName].forEach(item => {
      group.children.push({
        id: item.id,
        label: item.section
      })
    })
    
    // 只有当子项存在时才添加组
    if (group.children.length > 0) {
      options.push(group)
    }
  })
  
  return options
}

// Tool-only preferences. Never use profileStore, cloud storage, or upstream's generic keys.
const STORAGE_KEY = 'nikke-tools:core-dust:v1'
const savedEasy = ref({ bn: '', id: '' })
const savedHard = ref({ bn: '', id: '' })
const loading = ref(true)
const loadError = ref('')
const dataVersion = ref('')
async function readSavedState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  } catch { return {} }
}
async function writeSavedState() {
  if (loading.value) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ebn: savedEasy.value.bn, ebid: savedEasy.value.id,
      hbn: savedHard.value.bn, hbid: savedHard.value.id,
      cnlv: selectedCnLevelCorrection.value, klc: keepLatestChapter.value ? '1' : '0',
      lsv: latestServer.value, order: displayMode.value, half: showHalfPoints.value,
    }))
  } catch { /* Calculation still works when storage is unavailable. */ }
}
watch([displayMode, showHalfPoints], () => writeSavedState())

/* ---------------- 保持最新章节（普通关自动跟踪最新进度） ---------------- */

// 按追踪目标取「最新普通关卡进度」的章节前缀
function latestEasyPrefix() {
  if (latestServer.value === 'global') {
    // 国际服：当前关卡列表最后一关
    const last = chaptersData.value[chaptersData.value.length - 1]
    return last ? last.section : ''
  }
  // 国服：手动维护的常量（CN_LATEST_EASY_STAGE）
  return CN_LATEST_EASY_STAGE
}

// 在章节数据中按前缀查找关卡
function findChapterByPrefix(prefix) {
  if (!prefix) return null
  return chaptersData.value.find(c => c.section && (c.section === prefix || c.section.startsWith(prefix))) || null
}

// 把两个「普通模式」选择器设为最新进度
function applyLatestEasy() {
  const entry = findChapterByPrefix(latestEasyPrefix())
  if (!entry) return false
  selectedEasyMode.value = [entry.chapterName, entry.id]
  selectedEasyModeTable.value = [entry.chapterName, entry.id]
  return true
}

// 勾选/取消「保持最新章节」
function handleKeepLatestChange() {
  if (keepLatestChapter.value) {
    applyLatestEasy()
  } else if (savedEasy.value.id) {
    // 取消勾选：恢复之前保存的普通关进度，之后可继续手动选择
    selectedEasyMode.value = [savedEasy.value.bn, savedEasy.value.id]
    selectedEasyModeTable.value = [savedEasy.value.bn, savedEasy.value.id]
  }
  calculateBaseDefenseLevel()
  updateTableData()
  writeSavedState()
}

// 切换追踪服（国服 / 国际服）
function handleLatestServerChange() {
  if (keepLatestChapter.value) {
    applyLatestEasy()
    calculateBaseDefenseLevel()
    updateTableData()
  }
  writeSavedState()
}

// 处理普通模式变更
function handleEasyModeChange(value) {
  if (!value || value.length !== 2) return
  selectedEasyMode.value = [...value]
  selectedEasyModeTable.value = [...value]
  savedEasy.value = { bn: value[0], id: value[1] }
  calculateBaseDefenseLevel()
  updateTableData()
  writeSavedState()
}
function handleHardModeChange(value) {
  if (!value || value.length !== 2) return
  selectedHardMode.value = [...value]
  savedHard.value = { bn: value[0], id: value[1] }
  calculateBaseDefenseLevel()
  writeSavedState()
}

// 处理国服等级修正变更
function handleCnLevelCorrectionChange() {
  calculateBaseDefenseLevel()
  updateTableData()
  writeSavedState()
}

// 分组章节数据
function groupChaptersByType(type) {
  const groups = {}
  const chapters = chaptersData.value

  if (type === 'easy') {
    // 简单模式数据 (2-12 开始)
    const startIndex = chapters.findIndex(chapter => chapter.section && chapter.section.startsWith('2-12'))
    if (startIndex !== -1) {
      const easyChapters = chapters.slice(startIndex)
      easyChapters.forEach(chapter => {
        const groupName = chapter.chapterName || '其他'
        if (!groups[groupName]) {
          groups[groupName] = []
        }
        groups[groupName].push(chapter)
      })
    }
  } else if (type === 'hard') {
    // 困难模式数据 (0-1 开始)
    const startIndex = chapters.findIndex(chapter => chapter.section && chapter.section.startsWith('0-1'))
    if (startIndex !== -1) {
      const hardChapters = chapters.slice(startIndex)
      hardChapters.forEach(chapter => {
        const groupName = chapter.chapterName || '其他'
        if (!groups[groupName]) {
          groups[groupName] = []
        }
        groups[groupName].push(chapter)
      })
    }
  } else if (type === 'easyTable') {
    // 表格用简单模式数据 (2-12 开始)
    const startIndex = chapters.findIndex(chapter => chapter.section && chapter.section.startsWith('2-12'))
    if (startIndex !== -1) {
      const easyChapters = chapters.slice(startIndex)
      easyChapters.forEach(chapter => {
        const groupName = chapter.chapterName || '其他'
        if (!groups[groupName]) {
          groups[groupName] = []
        }
        groups[groupName].push(chapter)
      })
    }
  }

  return groups
}

// 计算基地防御等级
function calculateBaseDefenseLevel() {
  // 确保获取正确的值，无论是字符串还是数组形式
  let easyModeValue = selectedEasyMode.value;
  let hardModeValue = selectedHardMode.value;
  
  // 如果是数组（来自级联选择器），取最后一个元素
  if (Array.isArray(easyModeValue)) {
    easyModeValue = easyModeValue[easyModeValue.length - 1] || 0;
  }
  
  if (Array.isArray(hardModeValue)) {
    hardModeValue = hardModeValue[hardModeValue.length - 1] || 0;
  }
  
  const easyModeId = parseInt(easyModeValue) || 0
  const hardModeId = parseInt(hardModeValue) || 0

  // 找到基准ID
  const easyBaseEntry = chaptersData.value.find(chapter => chapter.section && chapter.section.startsWith('2-12'))
  const hardBaseEntry = chaptersData.value.find(chapter => chapter.section && chapter.section.startsWith('0-1'))

  const easyBaseId = easyBaseEntry ? parseInt(easyBaseEntry.id) : 0
  const hardBaseId = hardBaseEntry ? parseInt(hardBaseEntry.id) : 0

  const easyDiff = Math.max(0, easyModeId - easyBaseId)
  const hardDiff = Math.max(0, hardModeId - hardBaseId + 1)

  const totalDiff = easyDiff + hardDiff + selectedCnLevelCorrection.value
  const level = Math.floor(totalDiff / 5) + 1
  const progress = totalDiff % 5

  baseDefenseLevel.value = level
  progressCurrent.value = progress

  // 更新资源产出
  updateResourceOutput(level)
}

// 更新资源产出
function updateResourceOutput(level) {
  const outpost = outpostData.value[level]
  if (outpost) {
    resourceOutput.value = { ...outpost }
  } else {
    resourceOutput.value = {
      credit: '-',
      battle_data_set: '-',
      core_dust: '-',
      credit_mul: '-',
      battle_data_set_mul: '-',
      core_dust_mul: '-'
    }
  }
}

// 更新表格数据
function updateTableData() {
  // 确保获取正确的值，无论是字符串还是数组形式
  let easyModeTableValue = selectedEasyModeTable.value;
  
  // 如果是数组（来自级联选择器），取最后一个元素
  if (Array.isArray(easyModeTableValue)) {
    easyModeTableValue = easyModeTableValue[easyModeTableValue.length - 1] || 0;
  }
  
  const easyModeTableId = parseInt(easyModeTableValue) || 0
  
  if (easyModeTableId === 0) {
    tableData.value = []
    return
  }

  // 找到基准ID
  const easyBaseEntry = chaptersData.value.find(chapter => chapter.section && chapter.section.startsWith('2-12'))
  const hardBaseEntry = chaptersData.value.find(chapter => chapter.section && chapter.section.startsWith('0-1'))

  const easyBaseId = easyBaseEntry ? parseInt(easyBaseEntry.id) : 0
  const hardBaseId = hardBaseEntry ? parseInt(hardBaseEntry.id) : 0

  const easyDiff = Math.max(0, easyModeTableId - easyBaseId)+selectedCnLevelCorrection.value

  const hardChapters = chaptersData.value.slice(hardBaseId - 1)
  const seenLevels = new Set()
  const data = []

  let lastValue = null

  hardChapters.forEach(chapter => {
    const chapterId = parseInt(chapter.id)
    if (chapterId > easyModeTableId) return

    const diff = Math.max(0, chapterId - hardBaseId + 1)
    const totalDiff = easyDiff + diff
    const level = Math.floor(totalDiff / 5) + 1

    const outpost = outpostData.value[level]
    if (outpost && outpost.core_dust_mul) {
      const value = parseFloat(outpost.core_dust_mul)

      if (lastValue !== null) {
        const floorLast = Math.floor(lastValue)
        const floorCurrent = Math.floor(value)

        if (floorCurrent > floorLast && !seenLevels.has(floorCurrent)) {
          seenLevels.add(floorCurrent)
          data.push({
            hardChapter: `HARD ${chapter.section}`,
            level: `lv.${level}`,
            coreDust: outpost.core_dust_mul
          })
        }

        // 处理半点显示
        if (showHalfPoints.value === 'true') {
          const halfLast = Math.floor(lastValue * 2) / 2
          const halfCurrent = Math.floor(value * 2) / 2

          if (halfCurrent > halfLast && !seenLevels.has(halfCurrent)) {
            seenLevels.add(halfCurrent)
            data.push({
              hardChapter: `HARD ${chapter.section}`,
              level: `lv.${level}`,
              coreDust: outpost.core_dust_mul
            })
          }
        }
      }

      lastValue = value
    }
  })

  // 根据显示顺序排序
  if (displayMode.value === 'asc') {
    tableData.value = data.slice().reverse()
  } else {
    tableData.value = data
  }
}

// Local-only data loading; all files are shipped with this sub-application.
async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const [chaptersJson, outpostJson] = await Promise.all(['chapters', 'outpost'].map(async name => {
      const response = await fetch(new URL('./json/' + name + '.json', document.baseURI).href)
      if (!response.ok) throw new Error('无法读取本地数据：' + name)
      return response.json()
    }))
    if (!Array.isArray(chaptersJson.Chapters) || !Array.isArray(outpostJson.outpost)) throw new Error('本地数据格式错误')
    chaptersData.value = chaptersJson.Chapters.flatMap(group => group.Sections.map(section => ({id:section.id, section:section.Section, chapterName:group.Chapter})))
    outpostData.value = Object.fromEntries(outpostJson.outpost.map(item => [item.level, item]))
    dataVersion.value = String(chaptersJson.version) + ' / ' + String(outpostJson.version)
    const easy = findChapterByPrefix(CN_LATEST_EASY_STAGE) || findChapterByPrefix('2-12')
    const hard = findChapterByPrefix('0-1')
    if (!easy || !hard) throw new Error('缺少基准关卡')
    selectedEasyMode.value = [easy.chapterName, easy.id]
    selectedEasyModeTable.value = [...selectedEasyMode.value]
    selectedHardMode.value = [hard.chapterName, hard.id]
    savedEasy.value = {bn:easy.chapterName,id:easy.id}
    savedHard.value = {bn:hard.chapterName,id:hard.id}
    const saved = await readSavedState()
    const findSaved = (id, min) => chaptersData.value.find(c => String(c.id) === String(id) && Number(c.id) >= min)
    const savedNormal = findSaved(saved.ebid, Number(findChapterByPrefix('2-12').id))
    const savedDifficult = findSaved(saved.hbid, Number(hard.id))
    if (savedNormal) {
      savedEasy.value = {bn:savedNormal.chapterName,id:savedNormal.id}
      selectedEasyMode.value = [savedNormal.chapterName,savedNormal.id]
      selectedEasyModeTable.value = [...selectedEasyMode.value]
    }
    if (savedDifficult) {
      savedHard.value = {bn:savedDifficult.chapterName,id:savedDifficult.id}
      selectedHardMode.value = [savedDifficult.chapterName,savedDifficult.id]
    }
    if ([0,1,2,3].includes(Number(saved.cnlv))) selectedCnLevelCorrection.value = Number(saved.cnlv)
    keepLatestChapter.value = saved.klc === '1'
    latestServer.value = saved.lsv === 'global' ? 'global' : 'cn'
    if (keepLatestChapter.value) applyLatestEasy()
    displayMode.value = saved.order === 'desc' ? 'desc' : 'asc'
    showHalfPoints.value = saved.half === 'false' ? 'false' : 'true'
    calculateBaseDefenseLevel()
    updateTableData()
    parent.postMessage({type:'nikke-tools:ready'}, location.protocol === 'nikke:' ? 'nikke://app' : location.origin)
  } catch (error) {
    loadError.value = error.message || '本地数据加载失败'
    parent.postMessage({type:'nikke-tools:error'}, location.protocol === 'nikke:' ? 'nikke://app' : location.origin)
  } finally { loading.value = false }
}
onMounted(loadData)

</script>
