import fs from 'node:fs'
import vm from 'node:vm'
const base = new URL('../',import.meta.url)
export function harness(upstream = false, seed = 1) {
  const file = upstream ? 'vendor/zbx/AffixSimulator.upstream.vue' : 'src/simulator/AffixSimulator.vue'
  let code = fs.readFileSync(new URL(file,base),'utf8').replace(/\r\n/g,'\n').split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm,'')
  let queue = [], state = seed >>> 0
  const math = Object.create(Math)
  math.random = () => queue.length ? queue.shift() : ((state = (Math.imul(state,1664525)+1013904223)>>>0)/4294967296)
  const messages=[], workers=[], timers=new Map();let timerId=0
  class Worker {
    constructor(){workers.push(this)}
    postMessage(data){this.last=data;messages.push(data)}
    terminate(){this.dead=true}
    finish(result = {cost:'0/0-0',expected:{stoneOnly:0,withKeysStone:0,withKeysKeys:0}}){this.onmessage({data:{id:this.last.id,ok:true,result}})}
    fail(error = '测试计算失败'){this.onmessage({data:{id:this.last.id,ok:false,error}})}
  }
  const props={ruleVersion:'cn'}
  const ctx=vm.createContext({Math:math,console,ref:v=>({value:v}),computed:fn=>({get value(){return fn()}}),watch(){},onUnmounted(){},defineExpose(){},defineProps:()=>props,defineEmits:()=>()=>{},CHAR_TIER_RANGES:{},AffixWorker:Worker,Audio:class{play(){return Promise.resolve()}},setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)}})
  code += '\n globalThis.api = {' + ['mode','simMode','started','gears','targets','stonesUsed','keysUsed','won','showExpectation','expectation','expectError','expectLoading','dialogVisible','pendingWash','customSingleGear','customCharGears','customTargets','customError','randomTier','randomTierExcept','randomTierAvoidSame','randomEffect','sampleTargetEffects','generateGear','generateTargets','isCharacterTargetFeasible','blankGear','blankSlot','goalMetFor','checkWin','setLockWant','lockPlan','washCost','lockCost','canCheckLock','canWashSz','unlockSlot','startWash','keepAndWashAgain','resolveWash','buildCurrent','validateCustom','onCustomSlotChange','onCustomLockChange','cloneCustomGear','startCustomSimulation','beginGame','startSimulation','restartGame','exitGame','EFFECT_WEIGHTS','TIER_P','SLOT_GET','WASH_STONE','LOCK_STONE','LOCK_KEY'].join(',')+'};'
  vm.runInContext(code,ctx)
  return {a:ctx.api,props,workers,messages,timers,random(values){queue=[...values]},plain(value){return JSON.parse(JSON.stringify(value))}}
}
export function snapshot(h){const a=h.a;return h.plain({gears:a.gears.value,targets:a.targets.value,stones:a.stonesUsed.value,keys:a.keysUsed.value,won:a.won.value,pending:a.pendingWash.value,dialog:a.dialogVisible.value})}
export function fixture(h){h.a.started.value=true;h.a.gears.value=[{slots:[{effect:'gj',tier:1},{effect:'uy',tier:1},{effect:'dr',tier:1}],locks:{},want:{}}];h.a.targets.value=[{effects:['fy'],tier:15}]}
