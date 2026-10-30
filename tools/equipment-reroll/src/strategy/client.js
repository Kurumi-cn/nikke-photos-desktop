// SPDX-License-Identifier: GPL-3.0-or-later
import { runCalculatorWorker } from '../calculator/workerClient.js'

export function startStrategyTask(type, input, onProgress = () => {}, options = {}) {
  let cancel = () => {}
  const promise = runCalculatorWorker(type, input, onProgress, () => {
    const native = options.createWorker ? options.createWorker() : new Worker(new URL('../calculator/calculator.worker.js', import.meta.url), {type:'module'})
    let timer
    const facade = {
      postMessage: value => native.postMessage(value),
      terminate: () => { clearTimeout(timer); native.terminate() },
    }
    native.onmessage = event => facade.onmessage?.(event)
    native.onerror = event => facade.onerror?.(event)
    native.onmessageerror = event => facade.onmessageerror?.(event)
    cancel = () => facade.onerror?.({message:'计算已取消，未生成有效结果。',preventDefault(){}})
    timer = setTimeout(() => facade.onerror?.({message:'计算超过 60 秒预算，本次未完成；可降低目标或切回 Workshop。',preventDefault(){}}),options.timeoutMs ?? 60000)
    return facade
  })
  return {promise,cancel:() => cancel()}
}
