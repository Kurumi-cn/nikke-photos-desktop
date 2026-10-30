import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { locatePanelV2 } from '../src/lib/ocr/equipment/panelLogo.js'
import { locateEffectRowCenters } from '../src/lib/ocr/equipment/rowDetect.js'
import { createEffectRowRegions } from '../src/lib/ocr/equipment/rowRoi.js'
import { createValueTemplateLoader } from '../src/lib/ocr/equipment/valueTemplateLoader.js'
import { matchEquipmentValueTemplate, valueMaskFromRegion, composeValueGlyphMasks, scoreSegmentedValueGlyphs } from '../src/lib/ocr/equipment/valueTemplate.js'
import { AFFIX_TIER_VALUES } from '../src/data/affixTiers.js'
const project=path.resolve(import.meta.dirname,'..')
const root=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy/bugfix-2026-10-30')
fs.mkdirSync(root,{recursive:true})
const read=file=>PNG.sync.read(fs.readFileSync(file))
const image=read('E:/博哥/NIKKE Photos/文档/ocr_samples/equipment/装备_臂部_v金属护臂.png')
const panel=locatePanelV2(image).box
const regions=createEffectRowRegions(panel,locateEffectRowCenters(image,panel).centers,image)
const loader=createValueTemplateLoader({loadImage:async relative=>read(path.join(project,'public/ocr',relative))})
const observed=valueMaskFromRegion(image,regions[2].value)
const png=new PNG({width:observed.width*5,height:observed.height*5})
for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
 const k=(y*png.width+x)*4,v=observed.data[Math.floor(y/5)*observed.width+Math.floor(x/5)]?0:255
 png.data[k]=png.data[k+1]=png.data[k+2]=v;png.data[k+3]=255
}
fs.writeFileSync(path.join(root,'observed-mask.png'),PNG.sync.write(png))
console.log(JSON.stringify({panel,region:regions[2],match:await matchEquipmentValueTemplate(observed,'StatCritical',{...loader,valueStyle:'light-black-text',debug:true})},null,2))
for (const value of AFFIX_TIER_VALUES.StatCritical) {
 const glyphs=await Promise.all([...value.toFixed(2)+'%'].map(c=>loader.loadGlyph(c==='.'?'dot':c==='%'?'percent':c,{valueStyle:'light-black-text'})))
 console.log(value,scoreSegmentedValueGlyphs(observed,composeValueGlyphMasks(glyphs)))
}
