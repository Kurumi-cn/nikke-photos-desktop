import {useEffect,useRef,useState} from 'react'
import {AFFIX_TIER_VALUES,FUNCTION_LABELS} from '../data/affixTiers.js'
import {BUILTIN_CHARACTERS} from '../lib/roster.js'
import {getCurrentProfile,loadStore,saveStore,subscribeProfiles} from '../lib/profileStore.js'
import {COLLECTION_SLOTS,collectionPatch,rowFunction} from '../lib/collectionReview.js'
import CharacterAvatar from './CharacterAvatar.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ScreenshotViewer from './ScreenshotViewer.jsx'
import '../styles/collectionReview.css'
const byCode=new Map(BUILTIN_CHARACTERS.map(c=>[c.nameCode,c]))
const label={non_overload:'非T10装备',unequipped:'未装备',unearned:'未获得效果',manual:'空词条'}
const rowText=r=>r.status==='empty'?label[r.reason]||'空词条':r.status==='ok'?`${r.name||FUNCTION_LABELS[r.functionType]} ${Number(r.value).toFixed(2)}%`:r.suggestedEmpty?'疑似空词条 · 需核对':r.name||r.functionType?`${r.name||FUNCTION_LABELS[r.functionType]||'名称未识别'} ${Number.isFinite(r.value)?Number(r.value).toFixed(2)+'%':'（数值未识别）'} · 需核对`:({equipment_unknown:'装备弹窗未确认',engine_error:'识别引擎失败'})[r.reason]||'未识别，需核对'
const flagLabels={NAME_LOW_CONFIDENCE:'名称候选相近',VALUE_LOW_CONFIDENCE:'数值证据不足',NAME_VALUE_CONFLICT:'名称与数值存在冲突',TIER_STYLE_MISMATCH:'档位与文字样式不一致',ROI_CLIPPED:'识别区域不完整',ROW1_EMPTY_SUSPECT:'首条疑似空值，需要核对'}

export default function CollectionResults({status,records,visibleRecords,bridge,onStatus}){
 const active=!!status?.active
 const [selected,setSelected]=useState([]),[edit,setEdit]=useState(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('')
 const [preview,setPreview]=useState(null),[plan,setPlan]=useState(null),[profile,setProfile]=useState(()=>getCurrentProfile())
 const [largeImage,setLargeImage]=useState(null)
 const seq=useRef(0)
 useEffect(()=>subscribeProfiles(()=>setProfile(getCurrentProfile())),[])
 useEffect(()=>{setSelected(records.filter(c=>c.status==='complete').map(c=>c.nameCode));setEdit(null);setPreview(null);setNote('');setPlan(null);seq.current++},[status?.runId,active])
 async function request(command,args){setWorking(true);setError('');try{const v=await bridge.request(command,args);onStatus(v);return v}catch(e){setError(e.message);return null}finally{setWorking(false)}}
 async function showImage(c,slot,title){
  const token=++seq.current,id=c.equipment?.[slot]?.imageId
  setPreview({title:`${c.name} · ${title}`,loading:true})
  if(!id){setPreview({title:`${c.name} · ${title}`,error:'此部位没有保存截图。'});return}
  try{const v=await bridge.screenshots('read',{id});if(token!==seq.current)return;setPreview({title:`${c.name} · ${title}`,image:v.image,error:v.available?null:'截图已按之前的设置清理，无法恢复。新采集截图会保留至核对结束。'})}
  catch(e){if(token===seq.current)setPreview({title:`${c.name} · ${title}`,error:e.message})}
 }
 function beginEdit(c,slot,position,row){const type=rowFunction(row);setEdit({nameCode:c.nameCode,slot,position,type:row?.status==='empty'||row?.suggestedEmpty?'__empty':type?type:'__skip',value:row?.value??''})}
 async function approveCandidate(c,slot,row){const v=await request('collectionEditRow',{runId:status.runId,nameCode:c.nameCode,slot,position:row.position,row:{status:'ok',functionType:rowFunction(row),value:row.value}});if(v)setNote('已确认采用候选，可在确认写入后保存到档案。')}
 async function commitEdit(){
  const row=edit.type==='__empty'?{status:'empty'}:edit.type==='__skip'?{status:'unreadable'}:{status:'ok',functionType:edit.type,value:edit.value===''?null:Number(edit.value)}
  const v=await request('collectionEditRow',{runId:status.runId,nameCode:edit.nameCode,slot:edit.slot,position:edit.position,row});if(v){setEdit(null);setNote('词条修改已保存到采集草稿。')}
 }
 function prepareWrite(){
  setError('');try{const store=loadStore(),patch=collectionPatch(store.characters,status.draft,selected)
  if(!patch.nameCodes.length){setError('没有可写入的已完成角色，请先选择角色并核对词条。');return}
  setPlan({...patch,runId:status.runId,profileId:store.profileId,profileName:store.name,before:JSON.stringify(store.characters)})
  }catch(e){setError(`尚未写入档案：${e.message}。请先核对或修改对应词条。`)}
 }
 async function confirmWrite(){
  setWorking(true);setError('');const pending=plan;setPlan(null)
  try{
   const store=loadStore();if(store.profileId!==pending.profileId||pending.runId!==status.runId)throw Error('当前档案或采集任务已变化，请重新核对后写入。')
   if(JSON.stringify(store.characters)!==pending.before)throw Error('档案内容刚刚发生变化，请重新生成写入确认。')
   saveStore({...store,characters:pending.characters})
   setNote(`已写入「${pending.profileName}」：${pending.nameCodes.length} 名角色。`)
   try{const v=await bridge.request('collectionArchiveReceipt',{runId:status.runId,profileId:pending.profileId,profileName:pending.profileName,nameCodes:pending.nameCodes});onStatus(v)}catch(e){setNote(`已写入「${pending.profileName}」，但本轮记录清空失败，请保留界面核对：${e.message}`)}
  }catch(e){setError(e.message)}finally{setWorking(false)}
 }
 return <>
  <p className="collection-session-note">写入档案成功后会清空本轮全部采集记录并返回角色选择。需要保留草稿时请先导出。已写入的档案不会清除。</p>
  {error&&<p role="alert" className="maa-error">{error}</p>}{note&&<p role="status">{note}</p>}
  <div className="collection-archive-bar"><div><strong>写入本地档案：{profile.name}</strong><p>仅更新所选角色的装备词条。未识别项保留档案原值，明确空词条写为空。</p></div><div className="maa-actions"><button disabled={active||working||!records.some(c=>c.status==='complete')} onClick={()=>setSelected(records.filter(c=>c.status==='complete').map(c=>c.nameCode))}>选择全部已完成角色</button><button className="collection-primary" disabled={active||working||!selected.length||!!edit} onClick={prepareWrite}>确认写入所选角色（{selected.length}）</button></div></div>
  <div className="collection-review-layout"><div>
   {visibleRecords.map(c=><article className="collection-result" key={c.nameCode}><header><CharacterAvatar path={byCode.get(c.nameCode)?.avatar} alt=""/><h3>{c.name}</h3><span className="collection-tag" data-state={c.status}>{({complete:'已完成',skipped:'已跳过',recognizing:'后台识别',collecting:'截图中'})[c.status]||'未完成'}</span>{c.status==='complete'&&<label className="collection-write-check"><input type="checkbox" aria-label={`写入 ${c.name}`} checked={selected.includes(c.nameCode)} disabled={active||working} onChange={()=>setSelected(v=>v.includes(c.nameCode)?v.filter(code=>code!==c.nameCode):[...v,c.nameCode])}/>写入此角色</label>}</header>
    {c.status==='skipped'?<p>{c.reason}</p>:<div className="maa-result-scroll"><table><thead><tr><th>部位</th><th>词条1</th><th>词条2</th><th>词条3</th></tr></thead><tbody>{COLLECTION_SLOTS.map(([slot,title])=><tr key={slot}><th scope="row"><span className="collection-slot-label">{title}<button className="collection-image-button" aria-label={`查看 ${c.name} ${title}截图`} title="悬停或点击，在旁边显示当时截图" onMouseEnter={()=>showImage(c,slot,title)} onFocus={()=>showImage(c,slot,title)} onClick={()=>showImage(c,slot,title)}>▧</button></span></th>{[1,2,3].map(position=>{
     const row=c.equipment?.[slot]?.rows?.find(r=>r.position===position),editing=edit?.nameCode===c.nameCode&&edit.slot===slot&&edit.position===position
     return <td key={position} className={row?.status==='unreadable'?'collection-unreadable':undefined}>{editing?<div className="collection-row-editor"><select aria-label="修改词条类型" value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value,value:''})}><option value="__skip">未识别，保留原值</option><option value="__empty">明确空词条</option>{Object.entries(FUNCTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>{!edit.type.startsWith('__')&&<select aria-label="修改词条数值" value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}><option value="">请选择档位 / 数值</option>{AFFIX_TIER_VALUES[edit.type]?.map((v,i)=><option key={v} value={v}>第{i+1}档 · {v.toFixed(2)}%</option>)}</select>}<div><button disabled={working} onClick={commitEdit}>保存修改</button><button disabled={working} onClick={()=>setEdit(null)}>取消</button></div></div>:<button className="collection-edit-cell" disabled={active||working||!row} aria-label={`修改 ${c.name} ${title} 第${position}条`} title={row?.needsConfirm?(row.flags||[]).map(f=>flagLabels[f]||f).join('；')||'候选需核对，点击修改':'点击修改词条'} onClick={()=>beginEdit(c,slot,position,row)}>{row?rowText(row):c.equipment?.[slot]?.status==='pending'?'等待后台识别':'尚未读取'}{row?.manual?<small> · 已修改</small>:null}</button>}{!editing&&row?.suggested&&Number.isFinite(row.value)&&AFFIX_TIER_VALUES[rowFunction(row)]?.some(v=>Math.abs(v-row.value)<1e-6)&&<button className="collection-adopt-candidate" disabled={active||working} onClick={()=>approveCandidate(c,slot,row)} aria-label={`采用 ${c.name} ${title} 第${position}条候选`}>采用候选</button>}</td>
    })}</tr>)}</tbody></table></div>}
   </article>)}
  </div><aside className="collection-review-preview" aria-label="装备截图核对"><header><strong>{preview?.title||'装备截图'}</strong>{preview&&<button aria-label="关闭装备截图" onClick={()=>{seq.current++;setPreview(null)}}>×</button>}</header>{!preview?<p>把鼠标放到部位旁的 ▧ 按钮上，查看当时截图。预览不会覆盖装备行。</p>:preview.loading?<p>正在读取截图…</p>:preview.error?<p>{preview.error}</p>:<><div className="collection-popup-crop"><img src={preview.image} alt={`${preview.title} 当时装备截图`}/></div><button className="collection-open-image" onClick={()=>setLargeImage({image:preview.image,title:preview.title})}>查看完整截图</button></>}</aside></div>
  <div className="collection-review-footer"><p>结果图在核对期间保留。完成核对后，按截图设置清理；识别草稿和本地档案会保留。</p><button disabled={active||working||!status?.runId||!!status.reviewReleasedAt} onClick={async()=>{const v=await request('collectionReviewDone',{runId:status.runId});if(v){seq.current++;setPreview(null);setNote('已结束截图核对，并按设置执行清理。')}}}>结束核对并清理结果截图</button></div>
  {status?.archiveReceipts?.length>0&&<p>最近写入：{status.archiveReceipts.at(-1).profileName} · {new Date(status.archiveReceipts.at(-1).savedAt).toLocaleString()}</p>}
  {largeImage&&<ScreenshotViewer image={largeImage.image} title={largeImage.title} onClose={()=>setLargeImage(null)}/>}
  {plan&&<ConfirmDialog title="写入装备词条" confirmText="写入档案" onClose={()=>setPlan(null)} onConfirm={confirmWrite} message={<><p>将更新「{plan.profileName}」中 {plan.nameCodes.length} 名角色的装备词条：</p><p>{plan.nameCodes.map(code=>byCode.get(code)?.nameCn).join('、')}</p><p>{plan.writtenRows} 条有值词条，{plan.emptyRows} 条明确空词条；{plan.preservedRows} 条未识别或未读取，保留原值。</p><p>对应位置原有词条会被替换；等级、技能、其他角色资料保持不变。写入成功后清空本轮全部采集记录（含未选择写入的角色），返回准备采集。</p></>}/>}
 </>
}
