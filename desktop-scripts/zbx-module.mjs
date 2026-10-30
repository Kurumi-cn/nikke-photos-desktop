// SPDX-License-Identifier: GPL-3.0-or-later
// Packaging adapter only; probability, action and value-iteration code stays intact.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export function convertZbxSource(original) {
  const marker = '/* ============================================================\n * 命令行测试'
  const normalized = original.replace(/\r\n/g, '\n')
  const index = normalized.indexOf(marker)
  if (index < 0) throw new Error('zbx CLI boundary changed; review source before upgrading')
  let code = normalized.slice(0, index)
  const field = /    stateCount:\s*states\.length,/g
  if ([...code.matchAll(field)].length !== 1) throw new Error('zbx result boundary changed')
  code = code.replace(field, match => match + '\n    modelInfo: { bandTierUsed: bandTierMode, bandStateLimit: BAND_STATE_LIMIT },')
  return '// SPDX-License-Identifier: MIT\n// zbxzbx98, Copyright (c) 2024. See ../../vendor/zbx/LICENSE.\n// Generated ESM packaging; output-only modelInfo telemetry added, no formula changes.\n' + code + '\nexport { solve };\n'
}

export function generateZbxModule(root) {
  const base = path.join(root, 'tools/equipment-reroll')
  const original = fs.readFileSync(path.join(base, 'vendor/zbx/affix_solver.upstream.cjs'), 'utf8')
  const generated = convertZbxSource(original)
  fs.writeFileSync(path.join(base, 'src/zbx/affix_solver.mjs'), generated)
  const hash = value => crypto.createHash('sha256').update(value).digest('hex')
  fs.writeFileSync(path.join(base, 'vendor/zbx/source.json'), JSON.stringify({
    repository: 'https://github.com/zbxzbx98/zbxzbx98.github.io',
    commit: '4a2d9a5219919c3b88b7c1f9eff85ad8424e1d6b',
    license: 'MIT', originalSha256: hash(original), generatedSha256: hash(generated),
    changes: ['CommonJS/CLI boundary converted to ESM export', 'output-only bandTierUsed telemetry'],
  }, null, 2) + '\n')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateZbxModule(path.resolve(import.meta.dirname, '..'))
}
