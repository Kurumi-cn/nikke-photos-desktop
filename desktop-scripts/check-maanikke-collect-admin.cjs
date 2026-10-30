const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const {createService}=require('../electron/maanikke.cjs');
const base=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy');
const runId=crypto.randomUUID(),folder=path.join(base,'admin-nikke',runId);
async function main(){
 const service=createService({project,cacheRoot:path.join(base,'collect-launch-'+Date.now())});let target;
 try{await service.request('initialize');const w=(await service.request('windows')).windows;if(w.length!==1)throw Error('Require one game');target=w[0];}finally{await service.stop();}
 fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'request.json');
 const resumeFrom=process.argv.includes('--resume-red')?'1e8b6aa7-fb63-4fea-8f2b-ebcc02e4e18a':process.argv.includes('--resume')?'aae6f3c9-8a52-4492-91be-0ce5f96faa91':undefined;
 fs.writeFileSync(file,JSON.stringify({version:1,action:'collect-three-once',runId,createdAt:Date.now()/1000,ownerPid:process.pid,target:{hwnd:target.hwnd,pid:target.pid},resumeFrom,authorization:'User authorized lobby, Dorothy, Mihara Bonding Chain, Red Hood equipment reads, return lobby; no modifications'}));
 fs.writeFileSync(path.join(base,'latest-collection-session.json'),JSON.stringify({folder,runId}));console.log(JSON.stringify({folder,runId}));
 await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(project,'desktop-scripts/request-maanikke-admin.ps1'),'-ProjectRoot',project,'-RequestFile',file],{windowsHide:true,timeout:3650000},(error,stdout)=>error?reject(error):(console.log(stdout),resolve())));
 console.log(fs.readFileSync(path.join(folder,'result.json'),'utf8').slice(0,500));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
