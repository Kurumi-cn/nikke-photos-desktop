import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
export default function ScreenshotViewer({image,title,onClose}){
 const close=useRef(null),panel=useRef(null),[fit,setFit]=useState(true),[scale,setScale]=useState(1),[width,setWidth]=useState(1920)
 const closeAction=useRef(onClose);closeAction.current=onClose
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus()
  const key=e=>{if(e.key==='Escape'){e.preventDefault();closeAction.current()}if(e.key==='Tab'){const buttons=[...panel.current.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus()}
 },[])
 return createPortal(<div className="collection-image-mask" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="collection-image-dialog" ref={panel} role="dialog" aria-modal="true" aria-label="装备完整截图大图"><header><strong>{title} · 完整截图</strong><div><button onClick={()=>setFit(true)}>适应窗口</button><button onClick={()=>{setFit(false);setScale(1)}}>原尺寸</button><button onClick={()=>{setFit(false);setScale(v=>Math.max(.25,v-.25))}} aria-label="缩小截图">−</button><button onClick={()=>{setFit(false);setScale(v=>Math.min(3,v+.25))}} aria-label="放大截图">＋</button><button ref={close} onClick={onClose} aria-label="关闭完整截图">×</button></div></header><div className={`collection-image-viewport${fit?' fit':''}`}><img src={image} alt={`${title} 完整截图大图`} onLoad={e=>setWidth(e.currentTarget.naturalWidth)} style={fit?undefined:{width:width*scale}}/></div><footer>{fit?'适应窗口':`${Math.round(scale*100)}% · 可滚动查看`} · Esc 关闭</footer></section></div>,document.body)
}
