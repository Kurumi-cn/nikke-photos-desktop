import fs from 'node:fs'
import { source, draftFile, readState, validateCodes } from './model.mjs'

const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
const { current, baseHash } = readState()
if (draft.version !== 1 || draft.baseHash !== baseHash) throw Error('草稿版本或来源不匹配，需重新核对后保存')
const nameCodes = validateCodes(draft.nameCodes)
const added = nameCodes.filter(code => !current.nameCodes.includes(code))
const removed = current.nameCodes.filter(code => !nameCodes.includes(code))
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify({ total: nameCodes.length, added, removed, note: '检查后加 --write 同步源码；不改玩家存档，不构建EXE' }, null, 2))
} else {
  fs.writeFileSync(source + '.next', JSON.stringify({ version: 1, note: '由开发者国服名单工具维护', nameCodes }, null, 2) + '\n')
  fs.renameSync(source + '.next', source)
  console.log(`国服名单已同步：${nameCodes.length}名，新增${added.length}名，移除${removed.length}名。重新构建并重启软件后生效。`)
}
