// Read-only historical timing analysis; never launches a game worker.
const fs=require('node:fs'),path=require('node:path');
const folder=path.resolve(process.argv[2]);
const status=JSON.parse(fs.readFileSync(path.join(folder,'status.json')));
const events=fs.readdirSync(path.join(folder,'spool')).filter(n=>/^\d+\.json$/.test(n)).map(n=>{
 const e=JSON.parse(fs.readFileSync(path.join(folder,'spool',n)));
 const reply=path.join(folder,'spool',e.id+'.reply.json');
 return {...e,replyMs:fs.existsSync(reply)?Math.max(0,fs.statSync(reply).mtimeMs-e.savedAt*1000):null};
}).sort((a,b)=>a.id-b.id);
const grouped={};for(const e of events){const k=e.kind==='frame'?e.kind+':'+e.data.phase:e.kind;const g=grouped[k]??={count:0,replyMs:0};g.count++;g.replyMs+=e.replyMs||0;}
const ocr=fs.readdirSync(folder).filter(n=>/^ocr-.*\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(folder,n))).timing?.totalMs||0);
const log=fs.readFileSync(path.join(folder,'runtime/native-logs/maafw.log'),'utf8');
const native={};for(const line of log.split('\n')){
 const m=line.match(/\[(MaaNS::Tasker::run_task)\] \| leave, (\d+)ms/);if(m){native.recognitionJobs=(native.recognitionJobs||0)+1;native.recognitionMs=(native.recognitionMs||0)+Number(m[2]);}
 const cost=line.match(/\[(?:MaaNS::VisionNS::)?(\w+)::analyze\].*\[cost=(\d+)ms\]/);if(cost){const g=native[cost[1]]??={count:0,ms:0};g.count++;g.ms+=Number(cost[2]);}
}
const result={runId:status.runId,totalSeconds:(status.finishedAt-status.createdAt)/1000,events:events.length,grouped,formalOcr:{count:ocr.length,totalMs:ocr.reduce((a,b)=>a+b,0),maxMs:Math.max(...ocr)},native};
console.log(JSON.stringify(result,null,2));
