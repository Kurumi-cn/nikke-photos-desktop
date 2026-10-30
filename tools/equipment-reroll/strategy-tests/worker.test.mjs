import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { runCalculatorWorker } from '../src/calculator/workerClient.js'
import { startStrategyTask } from '../src/strategy/client.js'

const line=(stat='空词条',tier=0,flagged=false)=>({stat,tier,flagged,forceKeep:false})
const input={scope:'single',strategy:'zbx-keys',p:0.1,calculationRule:'cn-legacy',initialInput:[line('防御力增加',1,true),line('攻击力增加',1),line()],targetInput:[line('攻击力增加',1,true),line('优越代码伤害增加',1,true)]}
function threadFactory(){
  const native=new Worker(new URL('../tests/fixtures/calculator-worker-node.mjs',import.meta.url))
  const bridge={postMessage:value=>native.postMessage(value),terminate:()=>native.terminate()}
  native.on('message',data=>bridge.onmessage({data}));native.on('error',error=>bridge.onerror({message:error.message,preventDefault(){}}))
  return bridge
}
test('existing Worker routes resource solve, comparison and validation errors',async()=>{
  const result=await runCalculatorWorker('resourceSingle',input,()=>{},threadFactory)
  assert.ok(result.resources.keys>0)
  assert.match(result.nextAction,/秘钥锁定/)
  const comparison=await runCalculatorWorker('compareSingle',{...input,beforeInput:input.initialInput,afterInput:[line('攻击力增加',1),line('优越代码伤害增加',1),line()]},()=>{},threadFactory)
  assert.equal(comparison.after.resources.stones,0)
  assert.ok(comparison.delta.keys<0)
  await assert.rejects(runCalculatorWorker('resourceSingle',{...input,p:2},()=>{},threadFactory),/阈值/)
})
test('cancel and time budget terminate actual client work without reporting a fabricated result',async()=>{
  for(const kind of ['cancel','timeout','runtime']){
    let terminated=0
    const native={terminate(){terminated++},postMessage(){if(kind==='runtime')queueMicrotask(()=>native.onerror({message:'启动失败',preventDefault(){}}))}}
    const task=startStrategyTask('resourceSingle',input,()=>{},{createWorker:()=>native,timeoutMs:kind==='timeout'?5:1000})
    if(kind==='cancel')task.cancel()
    await assert.rejects(task.promise,kind==='cancel'?/取消/:kind==='timeout'?/预算/:/启动失败/)
    assert.equal(terminated,1)
  }
})
