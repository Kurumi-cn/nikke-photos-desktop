import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { root, readState, roster } from './model.mjs'

test('editor saves/reloads isolated drafts, rejects stale and invalid input, previews changes without writing source', async () => {
  const cache = path.resolve(root, '../codex temp/nikke-desktop/cn-roster-check/server')
  fs.mkdirSync(cache, { recursive: true })
  const draft = path.join(cache, 'draft.json'), before = readState()
  const env = { ...process.env, NIKKE_CN_EDITOR_PORT: '18742', NIKKE_CN_DRAFT_FILE: draft }
  const child = spawn(process.execPath, [path.join(root, 'devtools/cn-roster/server.mjs')], { env, windowsHide: true, stdio: 'ignore' })
  const origin = 'http://127.0.0.1:18742'
  try {
    let state
    for (let i=0;i<50;i++) { try { const r=await fetch(origin+'/api/state'); state=await r.json(); break } catch { await new Promise(r=>setTimeout(r,50)) } }
    assert.ok(state?.token)
    const post = (input, extra={}) => fetch(origin+'/api/draft', { method:'POST', headers:{'Content-Type':'application/json',Origin:origin,'X-Editor-Token':state.token,...extra},body:JSON.stringify(input) })
    const added = roster.find(c=>!before.current.nameCodes.includes(c.nameCode)).nameCode
    const nameCodes = [...before.current.nameCodes.slice(1), added]
    assert.equal((await post({baseHash:state.baseHash,nameCodes})).status,200)
    const reloaded=await (await fetch(origin+'/api/state')).json()
    assert.deepEqual(new Set(reloaded.draft.nameCodes),new Set(nameCodes))
    assert.equal((await post({baseHash:'stale',nameCodes})).status,400)
    assert.equal((await post({baseHash:state.baseHash,nameCodes:['unknown']})).status,400)
    assert.equal((await post({baseHash:state.baseHash,nameCodes}, {Origin:'http://example.invalid'})).status,403)
    assert.equal((await post({baseHash:state.baseHash,nameCodes}, {'X-Editor-Token':'invalid'})).status,403)
    const preview=spawnSync(process.execPath,[path.join(root,'devtools/cn-roster/apply.mjs')],{env,encoding:'utf8',windowsHide:true})
    assert.equal(preview.status,0,preview.stderr)
    const diff=JSON.parse(preview.stdout)
    assert.deepEqual(diff.added,[added]);assert.deepEqual(diff.removed,[before.current.nameCodes[0]])
    assert.equal(readState().baseHash,before.baseHash)
    fs.writeFileSync(path.join(cache,'result.json'),JSON.stringify({status:'passed',savedAndReloaded:true,staleAndInvalidRejected:true,crossOriginRejected:true,previewOnly:true,productionSourceUnchanged:true},null,2))
  } finally { child.kill() }
})
