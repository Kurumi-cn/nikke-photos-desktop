// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit, one-shot host transfer. No host storage access or solver changes.
import { STAT_NAMES } from './calculator/engine.js'
export function validateEquipmentImport(payload) {
  if(payload?.version!==1 || !Array.isArray(payload.equipments) || payload.equipments.length!==4)throw Error('导入的装备数量无效')
  return payload.equipments.map(rows=>{
    if(!Array.isArray(rows) || rows.length!==3)throw Error('导入的词条数量无效')
    if(rows[0]?.stat==='空词条' && rows.slice(1).some(row=>row?.stat!=='空词条'))throw Error('第一条词条不能为空')
    const seen=new Set()
    return rows.map(row=>{
      if(!STAT_NAMES.includes(row?.stat) || !Number.isInteger(row.tier) || (row.stat==='空词条'?row.tier!==0:row.tier<1||row.tier>15))throw Error('导入词条或档位无效')
      if(row.stat!=='空词条' && seen.has(row.stat))throw Error('单件装备包含重复词条')
      seen.add(row.stat)
      return {stat:row.stat,tier:row.tier,locked:false,forceKeep:false}
    })
  })
}
export function installCharacterImport(api,capture) {
  const button=document.querySelector('#import-completed-character'),status=document.querySelector('#import-character-status')
  const hostOrigin=location.protocol==='nikke:'?'nikke://app':location.origin
  let pending=null
  const available=()=>api.collectionSelect.value==='manual-four-equipment' && api.app.getAttribute('aria-busy')!=='true'
  const sync=()=>{button.hidden=parent===window || api.collectionSelect.value!=='manual-four-equipment';button.disabled=!available() || !!pending}
  api.collectionSelect.addEventListener('change',()=>queueMicrotask(sync))
  new MutationObserver(sync).observe(api.app,{attributes:true,attributeFilter:['aria-busy']})
  button.addEventListener('click',()=>{
    if(!available() || pending)return
    pending=crypto.randomUUID();sync()
    parent.postMessage({type:'nikke-reroll:request-import',requestId:pending},hostOrigin)
  })
  window.addEventListener('message',event=>{
    if(event.source!==parent || event.origin!==hostOrigin || event.data?.type!=='nikke-reroll:import-result' || !pending || event.data.requestId!==pending)return
    pending=null;sync()
    if(event.data.canceled){status.textContent='已取消导入，当前盘面保持不变。';return}
    try {
      if(!available())throw Error('当前计算模式或运行状态已变化，请重新导入')
      const equipments=validateEquipmentImport(event.data.payload)
      const sections=[...api.characterEquipmentMode.querySelectorAll('.character-equipment-slot')]
      if(sections.length!==4 || sections.some(section=>section.querySelectorAll('.equipment-current-rows .form-row').length!==3))throw Error('四装备面板尚未准备好，请重试')
      sections.forEach((section,index)=>{
        const skip=section.querySelector('.equipment-skip-input');skip.checked=false;api.setEquipmentSkipped(section,false)
        api.fillRows(section.querySelector('.equipment-current-rows'),equipments[index])
      })
      api.clearImportedOutputs();capture()
      const name=typeof event.data.payload.name==='string'?event.data.payload.name.slice(0,120):'所选角色'
      status.textContent=`已导入 ${name} 的四件装备。请确认目标条件后重新计算。`
    } catch(error){status.textContent=`导入失败：${error.message}`}
  })
  sync()
}
