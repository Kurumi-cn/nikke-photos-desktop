// SPDX-License-Identifier: GPL-3.0-or-later
import './desktop.css'
import { installFileDropRelay } from '../../file-drop-relay.js'
installFileDropRelay()

const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const targetOrigin = location.protocol === 'nikke:' ? 'nikke://app' : location.origin
try {
  await import('./calculator/main.js')
} catch (error) {
  document.querySelector('#message').textContent = `计算器加载失败：${error.message}`
  parent.postMessage({ type: 'nikke-tools:error' }, targetOrigin)
}

import { installPageNavigation } from './page-navigation.js'
installPageNavigation(document.querySelector('#calculator-panel'))

