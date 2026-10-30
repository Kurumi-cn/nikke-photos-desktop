import {useEffect,useRef,useState} from 'react'
import '../styles/automationLab.css'
import LiveLabPanel from '../components/LiveLabPanel.jsx'

const download=(data,name)=>{const a=document.createElement('a');a.href=data;a.download=name;a.click()}
const loadImage=url=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('图片无法解码'));img.src=url})
async function readImage(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择PNG、JPEG或WebP图片')
 if(file.size>32*1024*1024)throw Error('文件超过32 MiB')
 const url=URL.createObjectURL(file)
 try{
  const img=await loadImage(url)
  if(img.naturalWidth*img.naturalHeight>16000000||Math.max(img.naturalWidth,img.naturalHeight)>8192)throw Error('图片超限：最大1600万像素，单边8192')
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight
  const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0)
  const data=c.toDataURL('image/png'),bytes=Uint8Array.from(atob(data.split(',')[1]),x=>x.charCodeAt(0))
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  return {url:data,width:c.width,height:c.height,name:file.name,hash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}
 }finally{URL.revokeObjectURL(url)}
}
export default function AutomationLabPage(){
 const [info,setInfo]=useState(null),[source,setSource]=useState(null),[template,setTemplate]=useState(null)
 const [box,setBox]=useState([0,0,0,0]),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [threshold,setThreshold]=useState('0.8'),[margin,setMargin]=useState('0.05')
 const canvas=useRef(null),origin=useRef(null),imageRef=useRef(null),loading=useRef(false)
 useEffect(()=>{let live=true;window.nikkeDesktop?.maaLab?.info().then(v=>{if(live)setInfo(v)}).catch(e=>{if(live)setInfo({available:false,error:e.message})});return()=>{live=false}},[])
 useEffect(()=>{let live=true;imageRef.current=null;if(source)loadImage(source.url).then(img=>{if(live){imageRef.current=img;paint()}});return()=>{live=false}},[source])
 function paint(){
  const c=canvas.current,img=imageRef.current;if(!c||!img)return
  c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0)
  const draw=(b,color)=>{if(!b)return;ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,source.width/600);ctx.strokeRect(...b)}
  draw(box,'#ffca38');if(result?.box){draw(result.box,'#16edb0');const [x,y]=result.center;ctx.strokeStyle='#16edb0';ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x+8,y);ctx.moveTo(x,y-8);ctx.lineTo(x,y+8);ctx.stroke()}
 }
 useEffect(()=>{paint()},[source,box,result])
 async function importFile(event,kind){
  const file=event.target.files?.[0];event.target.value='';if(!file||loading.current||busy)return
  loading.current=true;setBusy(true);setError('')
  try{const data=await readImage(file);if(kind==='source'){setSource(data);setBox([0,0,0,0])}else setTemplate({...data,sourceHash:null});setResult(null)}catch(e){setError(e.message)}finally{loading.current=false;setBusy(false)}
 }
 function point(e){const r=canvas.current.getBoundingClientRect();return [Math.max(0,Math.min(source.width,Math.round((e.clientX-r.left)*source.width/r.width))),Math.max(0,Math.min(source.height,Math.round((e.clientY-r.top)*source.height/r.height)))]}
 function select(e){if(!origin.current||busy)return;const [x,y]=point(e),[a,b]=origin.current;setBox([Math.min(x,a),Math.min(y,b),Math.abs(x-a),Math.abs(y-b)])}
 async function crop(){
  setError('');if(!source)return
  const [x,y,w,h]=box
  if(!box.every(Number.isInteger)||x<0||y<0||w<8||h<8||x+w>source.width||y+h>source.height){setError('请选择原图范围内、至少8×8像素的矩形');return}
  try{const img=await loadImage(source.url),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,x,y,w,h,0,0,w,h);setTemplate({url:c.toDataURL('image/png'),width:w,height:h,name:'框选模板.png',sourceHash:source.hash,crop:box});setResult(null)}catch(e){setError(e.message)}
 }
 async function run(){
  setBusy(true);setError('');setResult(null)
  try{const v=await window.nikkeDesktop.maaLab.match({screenshot:source.url,template:template.url,templateSourceHash:template.sourceHash,threshold:Number(threshold),margin:Number(margin)});setResult({...v,sourceName:source.name,templateName:template.name,templateCrop:template.crop||null,recordedAt:new Date().toISOString()})}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function report(){const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));download(url,'maa-recognition-report.json');setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <main className="page maa-lab" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setError('请使用导入按钮选择截图或模板')}}>
  <h1>自动化实验室</h1>
  <p>MaaFramework 实验 · 静态识图与妮姬按钮单次点击验证</p>
  <div className="maa-card" role="status">{info?.available?`已加载 ${info.version} · Electron ${info.electron} · Node ${info.node} · ${info.platform}/${info.arch}`:info?.error||(!window.nikkeDesktop?'请在Electron源码客户端打开；浏览器不提供识别服务':'正在加载官方预编译包…')}</div>
  <LiveLabPanel available={info?.available} ordinaryCompatibilityTest={info?.ordinaryCompatibilityTest}/>
  <h2>静态图片实验</h2>
  <div className="maa-actions">
   <label>导入完整截图<input aria-label="导入完整截图" disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>importFile(e,'source')}/></label>
   <label>导入独立模板<input aria-label="导入独立模板" disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>importFile(e,'template')}/></label>
  </div>
  <p>更换截图时保留模板，方便后续跨截图测试。图片仅用于本次实验，模板和报告可手动导出。</p>
  {source&&<>
   <p>{source.name} · 实际尺寸 <strong>{source.width}×{source.height}</strong>。下图仅显示缩放，识别使用原图像素：左上(0,0)，x向右、y向下。拖动框选目标（黄色）；命中框与中心为绿色。</p>
   <canvas ref={canvas} className="maa-canvas" aria-label="截图框选区域" onPointerDown={e=>{if(busy||e.button!==0)return;origin.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);setResult(null);setBox([...origin.current,0,0])}} onPointerMove={select} onPointerUp={e=>{select(e);origin.current=null}} onPointerCancel={()=>{origin.current=null}}/>
   <div className="maa-actions">{['x','y','宽','高'].map((v,i)=><label key={v}>{v}<input aria-label={`框选${v}`} disabled={busy} type="number" min="0" value={box[i]} onChange={e=>{setBox(b=>b.map((n,j)=>i===j?Number(e.target.value):n));setResult(null)}}/></label>)}<button disabled={busy} onClick={crop}>生成测试模板</button></div>
  </>}
  {template&&<div className="maa-card maa-template"><img src={template.url} alt="当前匹配模板"/><div><strong>{template.name} · {template.width}×{template.height}</strong><p>{template.sourceHash===source?.hash?'同图裁剪回测：仅基础功能验证，不能作为真实准确率证明。':'外部或其他截图模板：来源独立性需另行核实。'}</p><button onClick={()=>download(template.url,'maa-template.png')}>导出模板PNG</button></div></div>}
  <div className="maa-actions"><label>匹配阈值<input aria-label="匹配阈值" disabled={busy} type="number" min="0.5" max="1" step="0.01" value={threshold} onChange={e=>{setThreshold(e.target.value);setResult(null)}}/></label><label>最小候选分差<input aria-label="最小候选分差" disabled={busy} type="number" min="0" max="1" step="0.01" value={margin} onChange={e=>{setMargin(e.target.value);setResult(null)}}/></label><button disabled={busy||!source||!template||!info?.available} onClick={run}>{busy?'处理中…':'开始静态匹配'}</button></div>
  <p>固定同尺度全图搜索，method=5；分数是相关性指标，不是正确概率。不同分辨率、动画或按钮状态变化可能失败。本轮不进行自动缩放适配。</p>
  {error&&<div className="maa-card maa-error" role="alert">{error}</div>}
  {result&&<section className="maa-card" aria-label="识别结果"><h2>{result.hit?(result.reliable?'匹配命中':'命中但结果不可靠'):'识别未通过'}</h2><p>最高分 {result.score?.toFixed(6)??'无'} · 候选分差 {result.gap?.toFixed(6)??'无第二候选'} · 匹配 {result.timing.matchMs.toFixed(2)} ms · 总计 {result.timing.totalMs.toFixed(2)} ms</p><p>命中框 {JSON.stringify(result.box)} · 中心 {JSON.stringify(result.center)}（原图像素）</p>{result.reasons.map(r=><p key={r} className="maa-error">{r}</p>)}<p>{result.warning}</p><p>耗时包含范围：匹配耗时为Maa识别任务；总计含服务端解码/初始化，不含页面导入与IPC传输。加载首次另计。</p><button onClick={report}>导出识别报告JSON</button><details><summary>候选与调试数据</summary><pre>{JSON.stringify(result,null,2)}</pre></details></section>}
 </main>
}
