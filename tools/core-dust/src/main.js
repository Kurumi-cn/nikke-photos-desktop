import { createApp } from 'vue'
import { installFileDropRelay } from '../../file-drop-relay.js'
installFileDropRelay()
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '../../../src/styles/tokens.css'
import './desktop.css'
import App from './App.vue'

// Theme/locale are presentation hints in the iframe URL, never character-profile data.
const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.lang = params.get('locale') === 'zh-Hant' ? 'zh-Hant' : 'zh-CN'
createApp(App).use(ElementPlus).mount('#app')
