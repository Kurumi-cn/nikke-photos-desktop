import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { AFFIX_TIER_VALUES } from '../src/data/affixTiers.js'
import { createValueTemplateLoader } from '../src/lib/ocr/equipment/valueTemplateLoader.js'
import { matchEquipmentValueTemplate,composeValueGlyphMasks,scoreSegmentedValueGlyphs } from '../src/lib/ocr/equipment/valueTemplate.js'
import { expectedOcrValueStyle,isBlueTextStyle } from '../src/lib/ocr/equipment/valueStyle.js'
const root=path.resolve(import.meta.dirname,'../public/ocr')
const loader=createValueTemplateLoader({loadImage:async relative=>PNG.sync.read(fs.readFileSync(path.join(root,relative)))})
let count=0
for(const [type,values] of Object.entries(AFFIX_TIER_VALUES))for(let i=0;i<values.length;i++){
 const valueStyle=expectedOcrValueStyle(i+1),value=values[i]
 const glyphs=await Promise.all([...value.toFixed(2)+'%'].map(c=>loader.loadGlyph(c==='.'?'dot':c==='%'?'percent':c,{valueStyle,blueText:isBlueTextStyle(valueStyle)})))
 const mask=composeValueGlyphMasks(glyphs)
 const result=await matchEquipmentValueTemplate(mask,type,{...loader,valueStyle})
 assert.equal(result?.value,value,`${type} tier ${i+1}`);assert.equal(result?.level,i+1);count++
}
const blank={data:new Uint8Array(60*20),width:60,height:20}
assert.equal(await matchEquipmentValueTemplate(blank,'StatCritical',{...loader,valueStyle:'light-black-text'}),null)
const short={data:new Uint8Array([1,1,1,1]),width:2,height:2}
assert.equal(await matchEquipmentValueTemplate(short,'StatCritical',{...loader,valueStyle:'light-black-text'}),null)
const two={data:new Uint8Array([1,0,1,1,0,1]),width:3,height:2}
assert.equal(scoreSegmentedValueGlyphs(short,two).score,1)
const five={data:Uint8Array.from({length:27},(_,i)=>i%9%2===0?1:0),width:9,height:3}
await assert.rejects(()=>matchEquipmentValueTemplate(five,'StatCritical',{valueStyle:'light-black-text',loadGlyph:async()=>{throw Error('load failure')}}),/load failure/)
console.log(`OCR value passed: ${count} legal template combinations across three styles, blank/short/segment mismatch rejection, loader errors remain explicit.`)
