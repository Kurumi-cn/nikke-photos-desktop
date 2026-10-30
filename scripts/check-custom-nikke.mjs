import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CUSTOM_ID, customFieldErrors, nameKey, normalizeCustomRecord, toCustomCharacter } from '../src/lib/customNikkeModel.js'
import { encodeShareCode, encodeTableShareCode } from '../src/lib/shareCode.js'
import { setCustomNikkeDeleted } from '../src/lib/customNikkeStore.js'
import roster from '../src/data/roster.json' with { type: 'json' }
const id = 'custom-12345678-1234-4567-890a-123456789abc'
const valid = { schemaVersion: 1, id, nameCn: ' 本地测试妮姬 ', element: 'Water', corporation: 'TETRA', class: 'Supporter', use_burst_skill: 'Step2', original_rare: 'SSR', weapon_type: '', createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z' }
test('six mandatory fields, optional weapon and images', () => {
  assert.equal(Object.keys(customFieldErrors({})).length, 6)
  assert.deepEqual(customFieldErrors(valid), {})
  const record = normalizeCustomRecord(valid)
  assert.equal(record.nameCn, '本地测试妮姬'); assert.equal(record.avatarImage, null); assert.equal(record.artworkImage, null)
})
test('mandatory fields reject blank and invalid enum values', () => {
  for (const field of ['nameCn', 'element', 'corporation', 'class', 'use_burst_skill', 'original_rare']) assert.ok(customFieldErrors({ ...valid, [field]: ' ' })[field])
  assert.ok(customFieldErrors({ ...valid, weapon_type: 'LASER' }).weapon_type)
  assert.ok(customFieldErrors({ ...valid, nameCn: '妮'.repeat(61) }).nameCn)
  assert.equal(nameKey(' ＡBC '), nameKey('abc'))
})
test('local identity is distinct and cannot impersonate official numeric IDs', () => {
  assert.ok(CUSTOM_ID.test(id))
  assert.throws(() => normalizeCustomRecord({ ...valid, id: '5184' }), /身份/)
  assert.throws(() => normalizeCustomRecord({ ...valid, schemaVersion: 2 }), /版本/)
  assert.throws(() => normalizeCustomRecord({ ...valid, updatedAt: 'invalid' }), /时间/)
})
test('roster projection retains all selected metadata and does not invent game facts', () => {
  const character = toCustomCharacter(normalizeCustomRecord(valid))
  assert.equal(character.nameCode, id); assert.equal(character.isCustom, true); assert.equal(character.weapon_type, '')
  for (const key of ['element','corporation','class','use_burst_skill','original_rare']) assert.equal(character[key], valid[key])
  assert.equal(character.resourceId, ''); assert.equal(character.cnAvailable, false); assert.deepEqual(character.artworks, [])
})
test('PNG blob bytes and transparency are not re-encoded by the record model', async () => {
  const blob = new Blob([new Uint8Array([137,80,78,71,0,1,2])], { type: 'image/png' })
  const record = normalizeCustomRecord({ ...valid, artworkImage: { blob, name: '立绘.png', width: 5, height: 6 } })
  assert.equal(record.artworkImage.blob, blob)
  assert.deepEqual(toCustomCharacter(record, { artwork: 'blob:local' }).artworks, [{ id: 'default', label: '自定义立绘', url: 'blob:local' }])
  assert.throws(() => normalizeCustomRecord({ ...valid, avatarImage: { blob: new Blob(['svg'], { type: 'image/svg+xml' }), width: 1, height: 1 } }), /图片/)
})
test('both existing share encoders explicitly refuse local IDs without changing the protocol', () => {
  assert.throws(() => encodeShareCode({ characters: [{ nameCode: id, record: {} }] }), /不参与分享/)
  assert.throws(() => encodeTableShareCode({ nameCodes: [id] }), /不参与分享/)
})
test('deletion API refuses all built-in character identities before opening local storage', async () => {
  for (const character of roster.characters) await assert.rejects(setCustomNikkeDeleted({ id: character.nameCode }, true), /只能删除或恢复自定义/)
  await assert.rejects(setCustomNikkeDeleted({ id: 'custom-invalid' }, true), /只能删除或恢复自定义/)
  assert.equal(normalizeCustomRecord({ ...valid, deletedAt: '2026-10-26T00:00:00.000Z' }).deletedAt, '2026-10-26T00:00:00.000Z')
})
