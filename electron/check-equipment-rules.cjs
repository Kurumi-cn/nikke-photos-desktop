const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async(win,cache)=>{
 const web=win.webContents,run=s=>web.executeJavaScript(s),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const roster=require('../src/data/roster.json').characters,[a,b]=roster;
 const key='nikke-photos/profiles/v1/data/default',code=String(a.nameCode),other=String(b.nameCode);
 const atk={functionType:'StatAtk',level:1,value:4.77};
 const initial={equipments:Array.from({length:4},()=>[null,null,null]),skills:{skill1:5}};
 const until=async(s)=>{for(let i=0;i<100;i++){if(await run(s))return;await delay(50)}throw Error(s)};
 await run(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({version:2,characters:{[code]:initial,[other]:initial}}))});location.hash='/data?code=${code}'`);
 await until("document.querySelectorAll('.equip-block').length===4");await delay(120);
 const row=i=>`document.querySelectorAll('.equip-block')[0].querySelectorAll('.affix-row')[${i}]`;
 const select=async(i,type)=>{await run(`(()=>{const e=${row(i)}.querySelector('select');e.value=${JSON.stringify(type)};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await delay(100)};
 const stored=()=>run(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).characters`);
 assert.equal(await run(`${row(1)}.querySelector('select').disabled`),true);
 await select(0,'StatAtk');assert.equal(await run(`${row(1)}.querySelector('select').disabled`),false);
 assert.equal(await run(`${row(1)}.querySelector('option[value=StatAtk]').disabled`),true);
 // Force a change event past the disabled option: handler must reject it too.
 await select(1,'StatAtk');assert.equal((await stored())[code].equipments[0][1],null);
 await select(1,'StatDef');assert.equal((await stored())[code].equipments[0][1].functionType,'StatDef');
 assert.equal(await run(`${row(0)}.querySelector('option[value=""]').disabled`),true);
 assert.equal(await run(`${row(0)}.querySelector('button').disabled`),true);
 await select(0,'');assert.equal((await stored())[code].equipments[0][0].functionType,'StatAtk');
 await run("[...document.querySelector('.equip-block').querySelectorAll('button')].find(b=>b.textContent==='清空本件').click()");await delay(100);
 assert.deepEqual((await stored())[code].equipments[0],[null,null,null]);assert.equal((await stored())[code].skills.skill1,5);
 // Loaded invalid data stays unchanged. A partial repair remains local until valid.
 const legacy={...initial,equipments:[[atk,atk,atk],...initial.equipments.slice(1)]};
 await run(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({version:2,characters:{[code]:legacy,[other]:initial}}))});location.reload()`);
 await until("document.querySelectorAll('.equip-block').length===4");await delay(100);
 assert.deepEqual((await stored())[code].equipments[0],[atk,atk,atk]);
 assert.equal(await run("document.querySelector('.equip-block').textContent.includes('历史记录保持原样')"),true);
 await select(0,'StatDef');assert.deepEqual((await stored())[code].equipments[0],[atk,atk,atk]);
 assert.equal(await run("document.body.textContent.includes('存在未保存的修改')"),true);
 // Changing character after a failed save cannot write the old draft to the new character.
 await run(`location.hash='/data?code=${other}'`);await delay(200);
 assert.deepEqual((await stored())[other],initial);
 await run(`location.hash='/data?code=${code}'`);await delay(200);
 await select(0,'StatDef');await select(1,'StatCritical');
 assert.deepEqual((await stored())[code].equipments[0].map(v=>v.functionType),['StatDef','StatCritical','StatAtk']);
 assert.equal(await run("document.body.textContent.includes('存在未保存的修改')"),false);
 await run("document.querySelector('.equip-grid').scrollIntoView({block:'center'})");await delay(100);
 fs.writeFileSync(path.join(cache,'equipment-rules-form.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 win.setSize(390,900);await delay(100);await run("document.querySelector('.equip-grid').scrollIntoView({block:'start'})");await delay(100);
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
 fs.writeFileSync(path.join(cache,'equipment-rules-form-narrow.png'),(await web.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 win.setSize(1440,1000);
 await run(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({version:2,characters:{[code]:legacy,[other]:initial}}))});location.reload()`);
 await until("document.querySelectorAll('.equip-block').length===4");await select(0,'StatDef');
 assert.equal(await run("document.body.textContent.includes('存在未保存的修改')"),true);
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='清空该角色数据').click()");await delay(100);
 assert.equal((await stored())[code],undefined);assert.equal(await run("document.body.textContent.includes('存在未保存的修改')"),false);
 // Keep subsequent tool tests isolated from these fixtures.
 await run("localStorage.clear();location.hash='/tools';location.reload()");await until("!!document.querySelector('.topbar')");
 return {emptyStart:true,uniqueOptionsAndHandler:true,firstClearBlocked:true,clearWholeEquipment:true,legacyPreserved:true,invalidSaveAtomic:true,partialRepair:true,noCrossCharacterWrite:true,clearResetsError:true,narrowNoOverflow:true};
};
