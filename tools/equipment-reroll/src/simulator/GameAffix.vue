<script setup>
defineProps({name:String,value:String,tier:Number,empty:Boolean})
</script>
<template><span class="game-affix" :class="{'game-affix-empty':empty,'game-affix-blue':!empty && tier>=12 && tier<15,'game-affix-black':!empty && tier>=15}"><template v-if="empty"><span class="game-affix-name">未获取效果</span></template><template v-else><span class="game-affix-name">{{ name }}</span><span class="game-affix-details"><span class="game-affix-value">{{ value }}</span><span class="game-affix-tier">（阶数<span class="game-affix-number">{{ tier }}</span>）</span></span></template></span></template>
