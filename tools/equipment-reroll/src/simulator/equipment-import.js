// SPDX-License-Identifier: GPL-3.0-or-later
// Only receive an explicitly selected snapshot, never a profile or storage bridge.
const CODES={'优越代码伤害增加':'uy','攻击力增加':'gj','最大装弹数增加':'dr','暴击伤害增加':'bs','暴击率增加':'bj','防御力增加':'fy','命中率增加':'mz','蓄力速度增加':'xs','蓄力伤害增加':'xl','空词条':'wd'}
export function simulatorGears(payload,scope) {
  const count=scope==='single'?1:scope==='character'?4:0
  if(!count || payload?.version!==1 || !Array.isArray(payload.equipments) || payload.equipments.length!==count)throw Error('模拟装备快照数量无效')
  if(scope==='single'&&(!Number.isInteger(payload.slot)||payload.slot<0||payload.slot>3))throw Error('所选装备部位无效')
  return payload.equipments.map(rows=>{
    if(!Array.isArray(rows)||rows.length!==3)throw Error('装备必须包含三个栏位')
    const seen=new Set()
    const slots=rows.map(r=>{
      const effect=Object.hasOwn(CODES,r?.stat)?CODES[r.stat]:null
      if(!effect||!Number.isInteger(r.tier)||(effect==='wd'?r.tier!==0:r.tier<1||r.tier>15))throw Error('装备词条或档位无效')
      if(effect!=='wd'&&seen.has(effect))throw Error('装备词条重复')
      seen.add(effect)
      return {effect,tier:r.tier}
    })
    if(slots[0].effect==='wd' && slots.slice(1).some(s=>s.effect!=='wd'))throw Error('第一条词条不能为空，请先核对装备数据')
    return {slots,locks:{},want:{}}
  })
}
export function requestSimulatorEquipment(scope) {
  const requestId=crypto.randomUUID(),origin=location.protocol==='nikke:'?'nikke://app':location.origin
  let cancel
  const promise=new Promise((resolve,reject)=>{
    if(parent===window){reject(Error('请从妮姬工具中的模拟器入口选择角色装备'));return}
    const finish=(error,value)=>{window.removeEventListener('message',receive);clearTimeout(timer);error?reject(error):resolve(value)}
    const receive=event=>{
      if(event.source!==parent||event.origin!==origin||event.data?.type!=='nikke-simulator:import-result'||event.data.requestId!==requestId)return
      if(event.data.canceled){finish(null,null);return}
      try {finish(null,{gears:simulatorGears(event.data.payload,scope),name:event.data.payload.name,slot:event.data.payload.slot})}catch(error){finish(error)}
    }
    cancel=()=>{parent.postMessage({type:'nikke-simulator:cancel-import',requestId},origin);finish(null,null)}
    const timer=setTimeout(()=>{parent.postMessage({type:'nikke-simulator:cancel-import',requestId},origin);finish(Error('角色选择已超时，请重试'))},300000)
    window.addEventListener('message',receive)
    parent.postMessage({type:'nikke-simulator:request-import',requestId,scope},origin)
  })
  return {promise,cancel:()=>cancel?.()}
}
