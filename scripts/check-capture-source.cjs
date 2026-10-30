const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chooseCaptureSource}=require('../electron/capture-source.cjs');
const game={id:'window:123:0',name:'胜利女神：新的希望'};
const owner={handle:'123',name:'nikke',pid:42};
function fixture({sources=[game],fresh=sources,processes=[owner],freshProcesses=processes,response=0,manual=false}={}) {
  let lists=0,inspections=0;const dialogs=[];
  return {dialogs,run:()=>chooseCaptureSource({manual,window:{},
    presentSources:async ({reason,entries})=>{dialogs.push({message:reason});return entries[response]||null},
    desktopCapturer:{getSources:async options=>{assert.deepEqual(options.thumbnailSize,{width:0,height:0});return ++lists===1?sources:fresh}},
    inspect:async()=>++inspections===1?processes:freshProcesses,
    dialog:{showMessageBox:async(_w,options)=>{dialogs.push(options);return {response}}}})};
}
test('unique game title and process auto-select, no dialog',async()=>{const f=fixture();assert.equal((await f.run()).id,game.id);assert.equal(f.dialogs.length,0)});
test('title without confirmed process requires manual confirmation',async()=>{const f=fixture({processes:[]});assert.equal((await f.run()).id,game.id);assert.match(f.dialogs[0].message,/无法确认/)});
test('multiple game candidates require choice',async()=>{const other={id:'window:456:0',name:'NIKKE'};const f=fixture({sources:[game,other],response:1});assert.equal((await f.run()).id,other.id);assert.match(f.dialogs[0].message,/多个/)});
test('no target offers manual screen choice, including misleading desktop title',async()=>{const screen={id:'screen:1:0',name:'整个屏幕'};const f=fixture({sources:[screen,{id:'window:9:0',name:'NIKKE桌面端项目'}]});assert.equal((await f.run()).id,screen.id);assert.match(f.dialogs[0].message,/未检测/)});
test('user can force manual source even with unique game',async()=>{const f=fixture({manual:true});await f.run();assert.match(f.dialogs[0].message,/手动/)});
test('closed selection rejected and next capture uses reopened id',async()=>{const f=fixture({manual:true,fresh:[]});assert.equal(await f.run(),null);assert.match(f.dialogs[1].message,/已关闭/);const next={id:'window:456:0',name:game.name};assert.equal((await fixture({sources:[next],processes:[{...owner,handle:'456'}]}).run()).id,next.id)});
test('reused handle with different PID is rejected',async()=>{const f=fixture({freshProcesses:[{...owner,pid:43}]});assert.equal(await f.run(),null);assert.match(f.dialogs[0].message,/发生变化/)});
test('cancel and empty source list safely return null',async()=>{assert.equal(await fixture({manual:true,response:1}).run(),null);assert.equal(await fixture({sources:[],processes:[]}).run(),null)});
test('process inspection failure safely falls back to manual choice',async()=>{const selected=await chooseCaptureSource({desktopCapturer:{getSources:async()=>[game]},inspect:async()=>{throw Error('denied')},presentSources:async({entries})=>entries[0]});assert.equal(selected.id,game.id)});
test('picker refresh uses same enumeration, updates process metadata, and preserves original source',async()=>{
  let count=0;
  const fresh={id:'window:456:0',name:'NIKKE'};
  const selected=await chooseCaptureSource({manual:true,windowsOnly:true,
    desktopCapturer:{getSources:async options=>{assert.deepEqual(options,{types:['window'],thumbnailSize:{width:0,height:0}});return ++count===1?[game]:[fresh]}},
    inspect:async()=>[{handle:'456',name:'nikke',pid:51}],
    presentSources:async({entries,refresh})=>{assert.equal(entries[0].source,game);const next=await refresh();assert.equal(next[0].owner.pid,51);return next[0]},
  });assert.equal(selected,fresh);
});
