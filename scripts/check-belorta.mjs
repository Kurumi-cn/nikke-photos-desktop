import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {CHARACTERS,findCharacter,applyFilters,matchesSearch} from '../src/lib/roster.js'
import {toHant} from '../src/lib/hant.js'
import {encodeShareCode,decodeShareCode} from '../src/lib/shareCode.js'
const c=findCharacter('5184'),base=findCharacter('3007')
assert.equal(CHARACTERS.length,208);assert.equal(new Set(CHARACTERS.map(c=>c.nameCode)).size,208)
assert.deepEqual([c.nameCn,c.nameEn,c.resourceId,c.original_rare,c.class,c.element,c.weapon_type,c.corporation,c.use_burst_skill],['贝洛塔：南瓜女巫','Belorta: Pumpkin Witch','63','SSR','Supporter','Water','RL','TETRA','Step2'])
assert.equal(base.original_rare,'SR');assert.equal(base.resourceId,'60');assert.notEqual(c.avatar,base.avatar)
const old=JSON.parse(fs.readFileSync('E:/博哥/NIKKE Photos/app/src/data/roster.json')).characters
for(const r of old){
 // This frozen Web snapshot predates the separately approved Soline rename.
 const expected=r.nameCode==='5158'?{...r,nameCn:'索林：霜之旅票',aliases:['索林：霜雪车票','索林：霜雪旅票'],pinyin:'slszlp slsxcp slsxlp'}:r;
 const current=findCharacter(r.nameCode),{artworks:oldArt,...oldFields}=expected,{artworks:currentArt,...currentFields}=current;
 assert.deepEqual(currentFields,oldFields,'Existing character fields changed '+r.nameCode);
 for(const art of oldArt)assert.deepEqual(currentArt.find(item=>item.id===art.id),art,'Existing artwork changed '+r.nameCode+'/'+art.id);
}
for(const q of ['贝洛塔：南瓜女巫','貝洛塔：南瓜女巫','Pumpkin','5184','63','bltngnw'])assert.ok(matchesSearch(c,q),q)
assert.equal(toHant(c.nameCn),'貝洛塔：南瓜女巫')
for(const [key,value]of Object.entries({class:'Supporter',element:'Water',weapon_type:'RL',corporation:'TETRA',original_rare:'SSR',use_burst_skill:'Step2'}))assert.ok(applyFilters(CHARACTERS,{selected:{[key]:[value]}}).includes(c),key)
assert.deepEqual(applyFilters(CHARACTERS,{search:'Belorta',selected:{original_rare:['SSR'],class:['Supporter'],corporation:['TETRA'],element:['Water'],weapon_type:['RL'],use_burst_skill:['Step2']}}).map(r=>r.nameCode),['5184'])
assert.ok(!applyFilters(CHARACTERS,{selected:{original_rare:['SR']}}).includes(c))
const manifest=JSON.parse(fs.readFileSync('scripts/character-sources/belorta-pumpkin-witch.json'))
for(const resource of manifest.resources){const bytes=fs.readFileSync(resource.file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),resource.sha256);assert.equal(bytes.length,resource.bytes)}
const png=fs.readFileSync('public/'+c.avatar);assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128)
assert.equal(c.skillIcons,null);assert.equal(c.artworks[0].file,'c063.png');assert.equal(c.cnAvailable,false)
const encoded=encodeShareCode({synchroLevel:200,characters:[{nameCode:c.nameCode,record:{}}],fields:['equipments']});const decoded=decodeShareCode(encoded);assert.deepEqual(Object.keys(decoded.characters),['5184'])
console.log('Belorta check: 208 unique IDs; all204 original identities and artwork entries preserved;6 filter groups, simplified/traditional/English/ID/pinyin search; local file hashes; existing NKP2 roundtrip passed.')

const portrait=fs.readFileSync('public/ui-assets/nikke/character-artwork/c063.png');assert.equal(portrait.readUInt32BE(16),2048);assert.equal(portrait.readUInt32BE(20),2048);

assert.equal(fs.readFileSync('scripts/character-sources/belorta-pumpkin-witch.json','utf8'),fs.readFileSync('public/asset-notices/belorta-pumpkin-witch.json','utf8'));
