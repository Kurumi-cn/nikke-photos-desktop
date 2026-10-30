const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const cache=path.resolve(__dirname,'../../codex temp/nikke-desktop');
const folder=fs.readdirSync(cache).filter(n=>n.startsWith('beta-lifecycle-')).sort().at(-1),qa=path.join(cache,folder);
assert.ok(qa.startsWith(cache+path.sep));
async function main(){
 const log=fs.readFileSync(path.join(qa,'legacy-adoption-runtime.log'),'utf8'),match=log.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);assert.ok(match);
 const targets=await(await fetch(`http://127.0.0.1:${match[1]}/json/list`)).json(),page=targets.find(t=>t.type==='page'&&t.url.startsWith('nikke://app'));assert.ok(page);
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'window.close()'}}));await new Promise(r=>ws.addEventListener('close',r,{once:true}));
 await new Promise(r=>setTimeout(r,1000));
 const install=path.join(qa,'重新安装目录','NIKKE Photos');assert.ok(install.startsWith(qa+path.sep));
 const p=spawnSync(path.join(install,'Uninstall NIKKE Photos.exe'),['/S'],{windowsHide:true,timeout:180000});if(p.error)throw p.error;assert.equal(p.status,0);console.log('Only the failed QA installation was closed/uninstalled; all test data retained.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
