// The desktop development copy currently supports Simplified Chinese only.
// Keep the existing translation API so forms/data formatting need no changes.
export const LOCALE_HANS='zh-Hans'
export const LOCALE_HANT='zh-Hant' // Compatibility constant; switching is disabled.
const listeners=new Set()
export const systemLocale=()=>LOCALE_HANS
export const hasManualLocale=()=>false
export const currentLocale=()=>LOCALE_HANS
export function applyLocale(){
 try{document.documentElement.setAttribute('data-locale',LOCALE_HANS);document.documentElement.lang='zh-CN'}catch{}
}
export function setLocale(){applyLocale();for(const listener of listeners)listener(LOCALE_HANS)}
export function subscribeLocale(listener){listeners.add(listener);return()=>listeners.delete(listener)}
export function t(source,params){if(!params)return source;return source.replace(/\{(\w+)\}/g,(whole,key)=>key in params?String(params[key]):whole)}
export const tData=text=>text
