const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

// Process inspection only: no activation, injection, window capture or cached HWND.
async function windowProcesses() {
  if (process.platform !== 'win32') return [];
  const {stdout} = await run('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object { [PSCustomObject]@{handle=$_.MainWindowHandle.ToInt64().ToString();pid=$_.Id;name=$_.ProcessName} }) | ConvertTo-Json -Compress"],
  {encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:1024*1024});
  const data=JSON.parse(stdout || '[]');
  return Array.isArray(data)?data:[data];
}
const gameTitle = title => /^(?:NIKKE(?:\s|$|[:：-])|GODDESS OF VICTORY[:： ]|勝利の女神[:：]|승리의 여신[:：]|胜利女神[:：]|勝利女神[:：])/i.test(title) && !/Photos|Workshop|桌面端项目/i.test(title);
function annotateSources(sources, processes) {
  return sources.map(source=>{
    const handle=/^window:(\d+):/.exec(source.id)?.[1];
    const owner=processes.find(p=>p.handle===handle);
    const processConfirmed=Boolean(owner && /^nikke(?:\.exe)?$/i.test(owner.name));
    return {source,owner,game:gameTitle(source.name),processConfirmed};
  });
}
async function chooseCaptureSource({desktopCapturer,dialog,window,presentSources,manual=false,windowsOnly=false,inspect=windowProcesses,log=()=>{}}) {
  const list=()=>desktopCapturer.getSources({types:windowsOnly?['window']:['window','screen'],thumbnailSize:{width:0,height:0}});
  let processes=[];
  try {processes=await inspect()} catch(error) {log('Capture process inspection unavailable: '+error.message)}
  const entries=annotateSources(await list(),processes);
  const candidates=entries.filter(e=>e.game);
  // Require both title and process for automatic selection. Unverified titles stay selectable.
  let selected=!manual && candidates.length===1 && candidates[0].processConfirmed ? candidates[0] : null;
  if(!selected) {
    const reason=manual?'手动选择截图来源':candidates.length===0?'未检测到 NIKKE 游戏窗口，请确认游戏已打开且未最小化。':candidates.length>1?'检测到多个 NIKKE 候选窗口，请手动确认。':'发现标题匹配的窗口，但无法确认其 NIKKE 进程，请手动确认。';
    const sort=items=>[...items].sort((a,b)=>Number(b.game)-Number(a.game));
    selected=await presentSources({reason,entries:sort(entries),refresh:async()=>{
      let owners=[];
      try {owners=await inspect()} catch(error) {log('Capture process inspection unavailable: '+error.message)}
      return sort(annotateSources(await list(),owners));
    }});
    if(!selected)return null;
  }
  // Selection dialogs can outlive the selected window. Enumerate and confirm ownership again.
  const fresh=(await list()).find(s=>s.id===selected.source.id && s.name===selected.source.name);
  let stillOwned=true;
  if(fresh && selected.owner) {
    try {stillOwned=(await inspect()).some(p=>p.handle===selected.owner.handle && p.pid===selected.owner.pid && p.name===selected.owner.name)}
    catch {stillOwned=false}
  }
  if(!fresh || !stillOwned) {await dialog.showMessageBox(window,{type:'warning',message:'所选窗口已关闭或发生变化，请重新截图选择。',buttons:['确定']});return null}
  log('Capture source: '+JSON.stringify({id:fresh.id,title:fresh.name,process:selected.owner?.name,pid:selected.owner?.pid,automatic:!manual && candidates.length===1 && selected.processConfirmed}));
  return fresh;
}
module.exports={windowProcesses,annotateSources,chooseCaptureSource};
