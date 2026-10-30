const {randomUUID}=require('node:crypto');

// Presentation bridge only. Actual sources never leave the main process.
function createSourcePicker({ipcMain,web,requireSender}) {
  let active=null;
  const keyOf=entry=>JSON.stringify([entry.source.id,entry.source.name,entry.owner?.pid??null,entry.owner?.name??null]);
  const serialize=entries=>entries.map(entry=>({key:keyOf(entry),name:entry.source.name,process:entry.owner?.name||null,pid:entry.owner?.pid||null}));
  function finish(value){const request=active;if(!request)return;active=null;request.resolve(value)}
  ipcMain.handle('source-picker:refresh',async(event,id)=>{
    requireSender(event);
    const request=active;
    if(!request || request.id!==id)throw Error('来源选择已结束');
    const entries=await request.refresh();
    if(active!==request)throw Error('来源选择已结束');
    request.entries=entries;
    return serialize(entries);
  });
  ipcMain.handle('source-picker:finish',(event,id,key)=>{
    requireSender(event);
    if(!active || active.id!==id)return false;
    if(key===null){finish(null);return true}
    const entry=active.entries.find(item=>keyOf(item)===key);
    if(!entry)return false;
    finish(entry);return true;
  });
  web.on('destroyed',()=>finish(null));
  web.on('render-process-gone',()=>finish(null));
  web.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)finish(null)});
  return ({reason,entries,refresh})=>new Promise(resolve=>{
    if(active || web.isDestroyed()){resolve(null);return}
    active={id:randomUUID(),entries,refresh,resolve};
    web.send('source-picker:open',{id:active.id,reason,entries:serialize(entries)});
  });
}
module.exports={createSourcePicker};
