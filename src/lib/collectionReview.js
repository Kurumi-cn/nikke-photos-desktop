import {AFFIX_TIER_VALUES,FUNCTION_LABELS} from '../data/affixTiers.js'
import {assertEquipmentChanges} from './equipmentRules.js'
export const COLLECTION_SLOTS=[['head','头部'],['chest','胸甲'],['hands','手部'],['legs','腿部']]
export function rowFunction(row){return row?.functionType||Object.keys(FUNCTION_LABELS).find(k=>FUNCTION_LABELS[k]===row?.name)||''}
// Only confirmed rows are replaced. Unreadable/missing rows preserve local data.
export function collectionPatch(characters,draft,codes){
 const result={characters:{...characters},nameCodes:[],writtenRows:0,emptyRows:0,preservedRows:0}
 for(const code of [...new Set(codes)]){
  const captured=draft[code];if(captured?.status!=='complete')continue
  const original=characters[code]||{},equipments=Array.from({length:4},(_,slot)=>Array.from({length:3},(_,i)=>original.equipments?.[slot]?.[i]??null));let changed=false
  COLLECTION_SLOTS.forEach(([slot],index)=>{
   for(let position=1;position<=3;position++){
    const row=captured.equipment?.[slot]?.rows?.find(r=>r.position===position)
    if(row?.status==='empty'){equipments[index][position-1]=null;result.emptyRows++;changed=true;continue}
    const type=rowFunction(row),tiers=AFFIX_TIER_VALUES[type],tier=tiers?.findIndex(v=>typeof row?.value==='number'&&Math.abs(v-row.value)<1e-6)
    if(row?.status==='ok'&&tier!==undefined&&tier>=0&&!row.needsConfirm){equipments[index][position-1]={functionType:type,level:tier+1,value:tiers[tier]};result.writtenRows++;changed=true}
    else result.preservedRows++
   }
  })
  if(changed){const next={...original,equipments,updatedAt:new Date().toISOString()};assertEquipmentChanges({[code]:original},{[code]:next});result.characters[code]=next;result.nameCodes.push(code)}
 }
 return result
}
