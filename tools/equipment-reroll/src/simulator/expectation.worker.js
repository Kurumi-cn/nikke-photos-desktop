// SPDX-License-Identifier: GPL-3.0-or-later
import { simulationExpectation } from './expectation.js'
self.onmessage = ({data}) => {
  const {id} = data || {}
  try {
    const result = simulationExpectation(data, progress => self.postMessage({id,ok:true,progress}))
    self.postMessage({id,ok:true,result})
  } catch(error) { self.postMessage({id,ok:false,error:error?.message || String(error)}) }
}
