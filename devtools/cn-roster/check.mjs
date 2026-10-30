import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roster, validateCodes, readState, hash } from './model.mjs'
import { isCnCharacter, filterRosterScope } from '../../src/lib/cnRoster.js'
import { CHARACTERS, findCharacter, applyFilters } from '../../src/lib/roster.js'

test('page-local CN filtering preserves the complete identity list', () => {
  const cn = roster.filter(isCnCharacter), outside = roster.find(c => !isCnCharacter(c))
  assert.equal(cn.length, readState().current.nameCodes.length)
  assert.deepEqual(filterRosterScope(roster, 'cn'), cn)
  assert.equal(isCnCharacter({ nameCode: 'custom-unlisted' }), false)
  assert.equal(CHARACTERS.length, roster.length)
  assert.equal(findCharacter(outside.nameCode).nameCode, outside.nameCode)
  assert.equal(applyFilters(CHARACTERS, { toggles: { cnPublished: true } }).length, cn.length)
  assert.ok(applyFilters(CHARACTERS, { toggles: { cnPublished: true, collectible: true } }).every(c => isCnCharacter(c) && c.collectibleCn))
  assert.equal(applyFilters(CHARACTERS).length, roster.length)
})
test('maintenance rejects unknown, empty, duplicate and invalid identities', () => {
  for (const codes of [[], ['unknown'], [null], [123], [roster[0].nameCode, roster[0].nameCode]]) assert.throws(() => validateCodes(codes))
  assert.deepEqual(validateCodes([roster[1].nameCode, roster[0].nameCode]), [roster[0].nameCode, roster[1].nameCode])
  assert.notEqual(hash('before'), hash('after'))
})
