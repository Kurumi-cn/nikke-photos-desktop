import roster from '../data/roster.json' with { type: 'json' }

export const CUSTOM_ID = /^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const REQUIRED_CUSTOM_FIELDS = ['nameCn', 'element', 'corporation', 'class', 'use_burst_skill', 'original_rare']
export const CUSTOM_IMAGE_LIMIT = 10 * 1024 * 1024
const fields = [...REQUIRED_CUSTOM_FIELDS, 'weapon_type']
const groups = new Map(roster.taxonomy.filters.map(group => [group.key, group]))
export const nameKey = name => String(name || '').trim().normalize('NFKC').toLocaleLowerCase()

export function customFieldErrors(input) {
  const errors = {}
  const name = String(input?.nameCn || '').trim()
  if (!name) errors.nameCn = '请输入妮姬名称'
  else if ([...name].length > 60) errors.nameCn = '名称最多填写60个字符'
  for (const key of fields.filter(key => key !== 'nameCn')) {
    const value = input?.[key] || ''
    if (!value && key === 'weapon_type') continue
    if (!groups.get(key).options.some(option => option.value === value)) errors[key] = `请选择${groups.get(key).label}`
  }
  return errors
}

export function normalizeCustomRecord(input) {
  if (input?.schemaVersion !== 1 || !CUSTOM_ID.test(input.id || '')) throw Error('自定义角色数据版本或身份无效')
  const errors = customFieldErrors(input)
  if (Object.keys(errors).length) throw Error(Object.values(errors)[0])
  const result = { schemaVersion: 1, id: input.id }
  for (const key of fields) result[key] = key === 'nameCn' ? input[key].trim() : input[key] || ''
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof input[key] !== 'string' || !Number.isFinite(Date.parse(input[key]))) throw Error('自定义角色时间信息无效')
    result[key] = input[key]
  }
  if (input.deletedAt != null && (typeof input.deletedAt !== 'string' || !Number.isFinite(Date.parse(input.deletedAt)))) throw Error('自定义角色删除信息无效')
  result.deletedAt = input.deletedAt || null
  for (const key of ['avatarImage', 'artworkImage']) {
    const image = input[key]
    if (!image) { result[key] = null; continue }
    if (!(image.blob instanceof Blob) || !image.blob.size || image.blob.size > CUSTOM_IMAGE_LIMIT || !['image/png', 'image/jpeg', 'image/webp'].includes(image.blob.type)) throw Error('角色图片格式或大小无效')
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) throw Error('角色图片尺寸无效')
    result[key] = { blob: image.blob, name: String(image.name || '角色图片').slice(0, 255), width: image.width, height: image.height }
  }
  return result
}

export function toCustomCharacter(record, { avatar = '', artwork = '' } = {}) {
  return {
    nameCode: record.id, resourceId: '', nameCn: record.nameCn, nameEn: '', aliases: [], pinyin: '',
    avatar, artworks: artwork ? [{ id: 'default', label: '自定义立绘', url: artwork }] : [], skillIcons: {},
    ...Object.fromEntries(fields.filter(key => key !== 'nameCn').map(key => [key, record[key] || ''])),
    isCustom: true, chinaExclusive: false, cnAvailable: false, collectible: false, collectibleCn: false, favoriteItem: null, overSpec: false,
  }
}
