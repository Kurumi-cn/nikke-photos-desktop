import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { root, draftFile, roster, readState, writeDraft } from './model.mjs'

const token = randomUUID(), port = Number(process.env.NIKKE_CN_EDITOR_PORT || 18741)
const origin = `http://127.0.0.1:${port}`
const avatars = new Map(roster.filter(c => c.avatar).map(c => [`/avatar/${encodeURIComponent(c.nameCode)}`, path.resolve(root, 'public', c.avatar)]))
const server = http.createServer(async (req, res) => {
  const send = (status, value, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value)
  }
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { error: 'Invalid host' })
    if (req.method === 'GET' && req.url === '/') return send(200, fs.readFileSync(new URL('./index.html', import.meta.url)), 'text/html; charset=utf-8')
    if (req.method === 'GET' && avatars.has(req.url)) {
      const file = avatars.get(req.url), publicRoot = path.resolve(root, 'public') + path.sep
      if (!file.startsWith(publicRoot) || !fs.existsSync(file)) return send(404, { error: 'No avatar' })
      return send(200, fs.readFileSync(file), 'image/' + (file.endsWith('.webp') ? 'webp' : 'png'))
    }
    if (req.method === 'GET' && req.url === '/api/state') {
      const state = readState()
      let draft = null
      if (fs.existsSync(draftFile)) draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'))
      return send(200, { ...state, draft, token, characters: roster.map(({ nameCode, nameCn, nameEn, pinyin, aliases, corporation, element, original_rare }) => ({ nameCode, nameCn, nameEn, pinyin, aliases, corporation, element, original_rare })) })
    }
    if (req.method === 'POST' && req.url === '/api/draft') {
      if (req.headers.origin !== origin || req.headers['x-editor-token'] !== token) return send(403, { error: 'Invalid editor request' })
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 32768) return send(413, { error: '名单过大' }) }
      return send(200, writeDraft(JSON.parse(body)))
    }
    send(404, { error: 'Not found' })
  } catch (error) { send(400, { error: error.message }) }
})
server.listen(port, '127.0.0.1', () => console.log(`国服名单开发工具：${origin}\n保存草稿：${draftFile}\n只编辑草稿；由维护者执行 cn-roster:apply 同步到软件。`))
