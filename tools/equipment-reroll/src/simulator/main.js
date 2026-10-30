// SPDX-License-Identifier: GPL-3.0-or-later
import {createApp} from 'vue'
import { installFileDropRelay } from '../../../file-drop-relay.js'
installFileDropRelay()
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import './desktop.css'
const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme=theme
document.documentElement.classList.toggle('dark',theme==='dark')
createApp(App).use(ElementPlus,{locale:zhCn}).mount('#simulator-app')
parent.postMessage({type:'nikke-tools:ready'},location.protocol==='nikke:'?'nikke://app':location.origin)
