import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tool = path.join(root, 'tools/equipment-reroll')
const seen = new Set()
const notices = ['ExcelJS / Vue / Element Plus declared runtime dependency licenses (conservative closure; includes Node-only dependencies).\nGenerated from the installed, lockfile-pinned packages.\n']
function resolvePackage(name, from) {
  let current=from
  while(true) {
    const file=path.join(current,'node_modules',name,'package.json')
    if(fs.existsSync(file))return file
    const parent=path.dirname(current)
    if(parent===current)throw new Error('Cannot locate dependency license: '+name)
    current=parent
  }
}
function visit(file) {
  if(seen.has(file))return
  seen.add(file)
  const pkg=JSON.parse(fs.readFileSync(file,'utf8'))
  const dir=path.dirname(file)
  notices.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\nDeclared license: ${JSON.stringify(pkg.license || pkg.licenses || 'not declared')}\n`)
  const licenseFiles=fs.readdirSync(dir,{withFileTypes:true}).filter(item=>item.isFile() && /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(item.name))
  for(const item of licenseFiles)notices.push(`\n--- ${item.name} ---\n`+fs.readFileSync(path.join(dir,item.name),'utf8'))
  for(const name of Object.keys(pkg.dependencies || {}))visit(resolvePackage(name,dir))
}
visit(resolvePackage('exceljs',root))
visit(resolvePackage('vue',root))
visit(resolvePackage('element-plus',root))
fs.writeFileSync(path.join(tool,'public/THIRD_PARTY_LICENSES.txt'),notices.join('\n'))

// Corresponding component source, without node_modules, caches, user data or generated output.
const dest=path.join(tool,'public/source')
fs.mkdirSync(path.join(dest,'src/assets/fonts'),{recursive:true})
for(const font of ['NotoSansSC-Black-subset.woff2','Azonix_Regular.otf'])fs.copyFileSync(path.join(root,'src/assets/fonts',font),path.join(dest,'src/assets/fonts',font))
fs.mkdirSync(path.join(dest,'tools/equipment-reroll'),{recursive:true})
fs.copyFileSync(path.join(root,'tools/file-drop-relay.js'),path.join(dest,'tools/file-drop-relay.js'))
for(const name of ['src','vendor','tests','strategy-tests','simulator-tests','simulator','index.html','vite.config.mjs','LICENSE']) {
  fs.cpSync(path.join(tool,name),path.join(dest,'tools/equipment-reroll',name),{recursive:true})
}
fs.mkdirSync(path.join(dest,'tools/equipment-reroll/public'),{recursive:true})
for(const name of ['LICENSE.txt','ZBX-LICENSE.txt','SOURCE-NOTICE.txt','THIRD_PARTY_LICENSES.txt'])fs.copyFileSync(path.join(tool,'public',name),path.join(dest,'tools/equipment-reroll/public',name))
for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,name),path.join(dest,name))
fs.mkdirSync(path.join(dest,'scripts'),{recursive:true})
fs.copyFileSync(path.join(root,'scripts/check-workshop-solver.mjs'),path.join(dest,'scripts/check-workshop-solver.mjs'))
fs.mkdirSync(path.join(dest,'desktop-scripts'),{recursive:true})
fs.copyFileSync(path.join(root,'desktop-scripts/zbx-module.mjs'),path.join(dest,'desktop-scripts/zbx-module.mjs'))
fs.writeFileSync(path.join(dest,'BUILDING.txt'),`Corresponding source for the GPL-3.0-or-later Workshop calculator adaptation.\nUse Node 24 and npm; package-lock.json pins build/runtime dependencies.\nFrom this source/ folder run:\n  npm ci --ignore-scripts\n  node node_modules/vite/bin/vite.js build --config tools/equipment-reroll/vite.config.mjs --configLoader native\nOutput: public/tools/equipment-reroll/. No EXE build is needed.\nThe root package file also contains unrelated host development dependencies/scripts; build only the component command above.\nTests: node --test tools/equipment-reroll/tests/*.test.mjs\nDirect upstream comparison additionally requires the pinned upstream checkout; set WORKSHOP_UPSTREAM_DIR and NIKKE_CACHE_DIR then run node scripts/check-workshop-solver.mjs.\nOriginal source files and modification documentation are in tools/equipment-reroll/vendor and UPSTREAM.md.\n`)
fs.appendFileSync(path.join(dest,'BUILDING.txt'),'\nEnhancement tests: node --test tools/equipment-reroll/strategy-tests/*.test.mjs\nOptional zbx ESM regeneration: node desktop-scripts/zbx-module.mjs (uses the pinned raw MIT source included in vendor/zbx).\nSee tools/equipment-reroll/ZBX-STRATEGY.md for rule/constraint scope and MIT/GPL attribution.\n')
console.log(`Workshop notices: ${seen.size} runtime dependency packages; corresponding component source included.`)
