const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs'),path=require('node:path');
const run=promisify(execFile);
async function captureNativeWindow({source,pid,cacheRoot,includeCursor=false}) {
  if(process.platform!=='win32')throw Error('当前系统不支持 Windows 无指针窗口截图');
  const handle=/^window:(\d+):/.exec(source.id)?.[1];
  if(!handle || !Number.isSafeInteger(pid) || pid<=0)throw Error('无法确认所选窗口的进程，请重新选择游戏主窗口');
  const temp=path.join(cacheRoot,'temp','wgc');fs.mkdirSync(temp,{recursive:true});
  const helperDir=__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked');
  const args=['-NoProfile','-NonInteractive','-File',path.join(helperDir,'windows-capture.ps1'),'-WindowHandle',handle,'-OwnerPid',String(pid)];
  if(includeCursor)args.push('-IncludeCursor'); // Internal A/B test only; never exposed in preload.
  let stdout;
  try {({stdout}=await run(path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),args,{windowsHide:true,timeout:18000,maxBuffer:64*1024*1024,encoding:'utf8',env:{...process.env,TEMP:temp,TMP:temp}}))}
  catch(error){throw Error('Windows 无指针截图失败，请保持游戏窗口未最小化后重试。此路径需要 Windows 10 2004+ 与系统 .NET Framework；不会自动退回含指针截图。详情：'+String(error.stderr || error.message).slice(0,1200))}
  const result=JSON.parse(stdout.replace(/^\uFEFF/,''));
  if(result.backend!=='windows-graphics-capture' || result.cursor!==(includeCursor?'always':'never') || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width<=0 || result.height<=0 || !result.dataUrl?.startsWith('data:image/png;base64,'))throw Error('原生截图返回无效结果');
  return result;
}
module.exports={captureNativeWindow};
