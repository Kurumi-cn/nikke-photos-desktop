<script setup>
import {ref} from 'vue'
import AffixSimulator from './AffixSimulator.vue'
const rule=ref('cn')
</script>
<template>
<main>
  <header class="simulator-header">
    <div><h1>装备洗练模拟器</h1><p>自由尝试洗练与锁定策略，不修改角色档案。</p></div>
    <div class="rule-settings">
      <label for="simulator-rule">模拟规则</label>
      <select id="simulator-rule" v-model="rule" aria-describedby="rule-reset-note">
        <option value="cn">国服版 · 旧规则</option><option value="global">国际服版 · 新规则</option>
      </select>
      <small id="rule-reset-note">切换规则会重置本局</small>
    </div>
  </header>
  <details class="rule-details"><summary>规则说明</summary><p>旧规则允许同一栏位抽到完全相同的效果和数值。新规则下，同一栏位不会抽到完全相同的效果和数值，空词条仍可能重复。模拟结果不代表游戏中的实际结果。</p></details>
  <AffixSimulator :key="rule" :rule-version="rule"/>
</main>
</template>
