// SPDX-License-Identifier: GPL-3.0-or-later
export function installSimulatorImportRelay() {
  const hostOrigin=location.protocol==='nikke:'?'nikke://app':location.origin
  const simOrigin=location.origin
  let pending=null
  function cancel() {
    if(!pending)return
    parent.postMessage({type:'nikke-reroll:cancel-import',requestId:pending.id},hostOrigin)
    pending.source.postMessage({type:'nikke-simulator:import-result',requestId:pending.id,canceled:true},simOrigin)
    pending=null
  }
  window.addEventListener('message',event=>{
    const data=event.data
    if(event.source===document.querySelector('#simulator-frame')?.contentWindow&&event.origin===simOrigin) {
      if(data?.type==='nikke-simulator:cancel-import'&&data.requestId===pending?.id){cancel();return}
      if(data?.type!=='nikke-simulator:request-import'||document.querySelector('#simulator-panel').hidden||!['single','character'].includes(data.scope)||typeof data.requestId!=='string'||data.requestId.length>80)return
      cancel();pending={id:data.requestId,source:event.source}
      parent.postMessage({type:'nikke-reroll:request-import',requestId:data.requestId,purpose:'simulator-'+data.scope},hostOrigin)
    } else if(pending&&event.source===parent&&event.origin===hostOrigin&&data?.type==='nikke-reroll:import-result'&&data.requestId===pending.id) {
      pending.source.postMessage({...data,type:'nikke-simulator:import-result'},simOrigin);pending=null
    }
  })
  return cancel
}
