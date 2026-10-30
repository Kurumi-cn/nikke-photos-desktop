import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const source = path.join(root, 'src/data/cn-roster.json')
export const draftFile = process.env.NIKKE_CN_DRAFT_FILE || path.resolve(root, '../codex temp/nikke-desktop/cn-roster/draft.json')
export const roster = JSON.parse(fs.readFileSync(path.join(root, 'src/data/roster.json'), 'utf8')).characters
export const hash = text => createHash('sha256').update(text).digest('hex')
export function validateCodes(codes) {
  const known = new Set(roster.map(c => c.nameCode))
  if (!Array.isArray(codes) || !codes.length || codes.some(c => typeof c !== 'string' || !known.has(c)) || new Set(codes).size !== codes.length) throw Error('名单必须包含至少一名有效角色，且不能有重复或未知编号')
  return roster.filter(c => codes.includes(c.nameCode)).map(c => c.nameCode)
}
export function readState() {
  const text = fs.readFileSync(source, 'utf8'), current = JSON.parse(text)
  if (current.version !== 1) throw Error('不支持的国服名单版本')
  validateCodes(current.nameCodes)
  return { current, baseHash: hash(text) }
}
export function writeDraft(input) {
  const { baseHash } = readState()
  if (input.baseHash !== baseHash) throw Error('软件名单已更新，请刷新页面后重新核对')
  const draft = { version: 1, baseHash, savedAt: new Date().toISOString(), nameCodes: validateCodes(input.nameCodes) }
  fs.mkdirSync(path.dirname(draftFile), { recursive: true })
  fs.writeFileSync(draftFile + '.next', JSON.stringify(draft, null, 2) + '\n')
  fs.renameSync(draftFile + '.next', draftFile)
  return draft
}
