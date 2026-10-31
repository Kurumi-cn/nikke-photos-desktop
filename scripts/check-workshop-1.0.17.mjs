import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { CHARACTERS, findCharacter, matchesSearch, applyFilters } from '../src/lib/roster.js'
import { CUBES, findCube, findCubeByCubeId } from '../src/lib/cubes.js'
import { CUBE_IDS, encodeShareCode, decodeShareCode } from '../src/lib/shareCode.js'
import { isCnCharacter } from '../src/lib/cnRoster.js'
const project=path.resolve(import.meta.dirname,'..')
const read=file=>fs.readFileSync(path.join(project,file))
const source=JSON.parse(read('scripts/character-sources/workshop-1.0.17.json'))
assert.equal(read('scripts/character-sources/workshop-1.0.17.json').toString(),read('public/asset-notices/workshop-1.0.17.json').toString())
assert.equal(CHARACTERS.length,208)
assert.equal(new Set(CHARACTERS.map(c=>c.nameCode)).size,208)
assert.equal(CHARACTERS.filter(isCnCharacter).length,152)
for(const [code,resourceId,name,weapon,burst,klass] of [
 ['5185','19','玛丽安：女王','MG','Step3','Attacker'],
 ['5186','472','红莲：弑神','AR','Step3','Attacker'],
 ['5187','473','长发公主：圣域','RL','Step2','Supporter'],
]){
 const c=findCharacter(code)
 assert.deepEqual([c.resourceId,c.nameCn,c.weapon_type,c.use_burst_skill,c.class,c.element,c.corporation,c.original_rare,c.overSpec],[resourceId,name,weapon,burst,klass,'Fire','PILGRIM','SSR',true])
 assert.equal(isCnCharacter(c),false)
 assert.ok(c.avatar.startsWith('ui-assets/nikke/character-avatars/'))
 for(const query of [name,c.nameEn,code,...c.aliases,c.pinyin])assert.ok(matchesSearch(c,query),query)
 assert.ok(applyFilters(CHARACTERS,{selected:{element:['Fire'],use_burst_skill:[burst]},toggles:{overSpec:true}}).includes(c))
 assert.equal(Object.keys(c.skillIcons).length,3)
 for(const file of [c.avatar,...Object.values(c.skillIcons)])assert.ok(read('public/'+file).length>0)
 assert.equal(c.artworks[0].id,'default')
 for(const a of c.artworks)assert.ok(read('public/ui-assets/nikke/character-artwork/'+a.file).length>0)
 const result=decodeShareCode(encodeShareCode({synchroLevel:200,characters:[{nameCode:code,record:{cube:{resourceId:10015,level:15}}}],fields:['equip','cube']}))
 assert.deepEqual(result.characters[code].cube,{resourceId:10015,level:15})
}
for(const [resourceId,id,label,file] of [['471','skin-1','垂泪之日','c471_01.webp'],['18','skin-1','亲爱的公主','c018_01.webp'],['19','skin-1','最后的爱恋','c019_01.webp'],['223','skin-2','三毒','c223_02.webp']]){
 const c=CHARACTERS.find(c=>c.resourceId===resourceId)
 assert.deepEqual(c.artworks.find(a=>a.id===id),{id,label,file})
 assert.equal(new Set(c.artworks.map(a=>a.id)).size,c.artworks.length)
}
assert.equal(CUBES.length,18)
assert.deepEqual(findCube(10015),findCubeByCubeId(1000318))
assert.equal(findCube(10015).nameCn,'遗迹外框魔方')
assert.deepEqual(CUBE_IDS,[10001,10002,10003,10004,10005,10006,11001,13001,12001,13002,12002,10009,10007,10008,10010,10012,10013,10015])
for(const asset of source.assets){const b=read(asset.file);assert.equal(b.length,asset.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),asset.sha256,asset.file)}
console.log('Workshop 1.0.17: 208 identities; CN152 unchanged; three characters/classification/local art and nine skill references; four skins; cube mapping and append-only NKP2 roundtrip; 21 asset hashes passed.')
