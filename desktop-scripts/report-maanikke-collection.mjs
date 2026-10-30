// Reuse the existing formal equipment OCR CLI; write only session evidence.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const project=path.resolve(import.meta.dirname,'..');
const base=path.resolve(project,'../codex temp/nikke-desktop/automation-dev-copy');
const {folder}=JSON.parse(fs.readFileSync(path.join(base,'latest-collection-session.json'),'utf8'));
const session=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8'));
const reviewFile=path.join(folder,'visual-review.json');
const visualReview=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):null;
if(session.completed.length!==3)throw Error('Require all three characters');
const characters=session.completed.map((character,index)=>({name:character.name,equipment:character.equipment.map(e=>{
 const report=path.join(folder,`ocr-${index}-${e.slot}.json`);
 execFileSync(process.execPath,[path.join(project,'scripts/ocr-equipment.mjs'),'--image',e.image,'--engine','v2','--report',report],{cwd:project,stdio:'pipe'});
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 return {slot:e.slot,image:e.image,report,rows:result.rows,warnings:result.warnings,engineError:result.engineError};
})}));
const summary={runId:session.runId,returnedToLobby:session.passed,characters,visualReview};
fs.writeFileSync(path.join(folder,'equipment-summary.json'),JSON.stringify(summary,null,2));
let md='# 三角色装备读取结果\n\n'+(session.passed?'已完成并返回大厅。':'游戏会话尚未完成返回大厅验证。')+' 以下按游戏词条从上到下排列；空表示“未获得效果”。\n';
for(const c of characters){
 md+=`\n## ${c.name}\n\n|部位|词条1|词条2|词条3|\n|---|---|---|---|\n`;
 for(const e of c.equipment){
  const values=e.rows.map(r=>{
   const confirmed=visualReview?.confirmedRows?.some(v=>v.character===c.name&&v.slot===e.slot&&v.position===r.position&&v.name===r.name&&v.value===r.value);
   return r.status==='empty'?'空':r.status==='ok'&&(!r.needsConfirm||confirmed)?`${r.name} ${Number(r.value).toFixed(2)}%`:'未识别，待核对';
  });
  md+=`|${e.slot}|${values.join('|')}|\n`;
 }
}
if(visualReview)md+='\n12件截图已逐项视觉复核；OCR待确认的条目在visual-review.json中另存复核结果，原始OCR输出保留。\n';
fs.writeFileSync(path.join(folder,'装备读取结果.md'),md);
console.log(JSON.stringify({report:path.join(folder,'装备读取结果.md'),characters:characters.map(c=>({name:c.name,equipment:c.equipment.map(e=>({slot:e.slot,rows:e.rows.map(r=>({name:r.name,value:r.value,status:r.status,needsConfirm:r.needsConfirm})),warnings:e.warnings,engineError:e.engineError}))}))}));
