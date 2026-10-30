import definition from '../data/cn-roster.json' with { type: 'json' }
// Independent membership; never infer membership from ownership or player records.
const codes = new Set(definition.nameCodes)
export const isCnCharacter = character => Boolean(character && codes.has(String(character.nameCode)))
export const cnRosterCount = codes.size
export const filterRosterScope = (list, scope) => scope === 'cn' ? list.filter(isCnCharacter) : list
