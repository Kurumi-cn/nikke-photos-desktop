import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {currentLocale,systemLocale,setLocale,t,tData} from '../src/lib/i18n.js'
const attrs={},root={setAttribute:(k,v)=>attrs[k]=v}
const context={document:{documentElement:root},localStorage:{getItem:k=>k.includes('locale')?'zh-Hant':'light'},navigator:{languages:['zh-TW']},window:{location:{search:'?lang=zh-Hant',hash:'#/?lang=zh-Hant'}}}
vm.runInNewContext(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context)
assert.equal(attrs['data-locale'],'zh-Hans');assert.equal(root.lang,'zh-CN');assert.equal(currentLocale(),'zh-Hans');assert.equal(systemLocale(),'zh-Hans');setLocale('zh-Hant');assert.equal(currentLocale(),'zh-Hans');assert.equal(t('保存'),'保存');assert.equal(tData('装备'),'装备')
const nav=fs.readFileSync(new URL('../src/components/TopNav.jsx',import.meta.url),'utf8');assert.ok(!nav.includes('switchLocale')&&!nav.includes('lang-toggle')&&!nav.includes('LangIcon'))
console.log(JSON.stringify({passed:true,startupHans:true,oldPreferenceAndUrlIgnored:true,switchDisabled:true,desktopAndDrawerRemoved:true}))
