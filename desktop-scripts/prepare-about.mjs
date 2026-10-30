// Build local, read-only About documents. Never read player data or system certificates.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'public/about')
fs.mkdirSync(out, { recursive: true })
const copy = (from, name) => fs.copyFileSync(path.join(root, from), path.join(out, name))
for (const [from, name] of [
  ['LICENSE', 'project-GPL-3.0.txt'],
  ['tools/core-dust/LICENSE', 'zbx-MIT.txt'],
  ['tools/equipment-reroll/LICENSE', 'workshop-GPL.txt'],
  ['automation/maanikke/vendor/LICENSE', 'maanikke-GPL.txt'],
  ['automation/maanikke/NOTICE', 'automation-notice.txt'],
  ['automation/maanikke/resource/model/ocr/NOTICE', 'ocr-model-source.txt'],
  ['node_modules/electron/dist/LICENSE', 'electron-LICENSE.txt'],
  ['node_modules/electron/dist/LICENSES.chromium.html', 'chromium-licenses.html'],
]) copy(from, name)
const seen = new Set(), notices = []
function visit(name, from = root) {
  const file = require.resolve(name + '/package.json', { paths: [from] })
  if (seen.has(file)) return
  seen.add(file)
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')), folder = path.dirname(file)
  notices.push(`\n${'='.repeat(64)}\n${pkg.name}@${pkg.version}\nDeclared license: ${JSON.stringify(pkg.license || pkg.licenses || 'not declared')}\n`)
  const files = fs.readdirSync(folder).filter(name => /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(name) && fs.statSync(path.join(folder, name)).isFile())
  if (!files.length) notices.push('No separate license text found in this installed package.\n')
  for (const name of files) notices.push(`--- ${name} ---\n` + fs.readFileSync(path.join(folder, name), 'utf8'))
  for (const dependency of Object.keys(pkg.dependencies || {})) visit(dependency, folder)
}
for (const name of ['react', 'react-dom', 'react-router-dom', 'html-to-image', 'pinyin-pro']) visit(name)
fs.writeFileSync(path.join(out, 'host-dependencies.txt'), notices.join('\n'))
// The existing GPL component source remains deployed; add a convenient offline download.
const archiver = require('archiver')
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(path.join(out, 'equipment-reroll-source.zip'))
  const archive = archiver('zip', { zlib: { level: 6 } })
  output.on('close', resolve); output.on('error', reject); archive.on('error', reject); archive.on('warning', reject)
  archive.pipe(output)
  archive.directory(path.join(root, 'tools/equipment-reroll/public/source'), 'source')
  archive.finalize().catch(reject)
})
console.log(`About documents prepared; ${seen.size} host dependency packages and component source archive.`)
