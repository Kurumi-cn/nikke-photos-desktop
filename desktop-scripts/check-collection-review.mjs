import assert from 'node:assert/strict'
import {collectionPatch} from '../src/lib/collectionReview.js'
const old={skills:{skill1:10},combat:1234,equipments:Array.from({length:4},()=>[{functionType:'StatDef',level:1,value:4.77},null,null])}
const characters={a:old,other:{combat:456}},before=JSON.stringify(characters)
const draft={a:{status:'complete',equipment:{head:{rows:[{position:1,status:'unreadable'},{position:2,status:'ok',functionType:'StatAtk',value:6.88},{position:3,status:'empty'}]},chest:{rows:[{position:1,status:'empty'}]}}},skip:{status:'skipped'}}
const patch=collectionPatch(characters,draft,['a','skip'])
assert.deepEqual(patch.nameCodes,['a']);assert.equal(patch.characters.a.equipments[0][0].functionType,'StatDef');assert.equal(patch.characters.a.equipments[0][1].level,4);assert.equal(patch.characters.a.equipments[1][0],null)
assert.deepEqual(patch.characters.a.skills,old.skills);assert.equal(patch.characters.a.combat,1234);assert.equal(patch.characters.other,characters.other);assert.equal(JSON.stringify(characters),before)
assert.equal(collectionPatch(characters,{a:{status:'collecting'}},['a']).nameCodes.length,0)
const candidate={position:1,status:'unreadable',functionType:'StatAtk',name:'攻击力增加',value:6.88,suggested:true,needsConfirm:true}
const candidateDraft={a:{status:'complete',equipment:{head:{rows:[candidate]}}}}
assert.equal(collectionPatch(characters,candidateDraft,['a']).characters.a.equipments[0][0].functionType,'StatDef')
candidateDraft.a.equipment.head.rows[0]={...candidate,status:'ok',needsConfirm:false,manual:true}
assert.equal(collectionPatch(characters,candidateDraft,['a']).characters.a.equipments[0][0].functionType,'StatAtk')
console.log(JSON.stringify({passed:true,unknownPreservesExisting:true,knownEmptyClears:true,tierMapping:true,otherFieldsAndCharactersPreserved:true,inputUnchanged:true}))
