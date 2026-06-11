const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { injectNow } = require('../services/templateInjection')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()
  const templates = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all()
  const parsed = templates.map(t => {
    try { t.meta = JSON.parse(t.meta) } catch { }
    return t
  })
  res.json(parsed)
})

router.post('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { name, type, content, meta } = req.body
  if (!name || !type) return res.status(400).json({ error: 'Name and type required' })

  const r = db.prepare(`
    INSERT INTO templates (name, type, content, meta, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(name, type, content || null, meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : null, new Date().toISOString(), new Date().toISOString())

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(r.lastInsertRowid)
  res.json(template)
})

router.post('/inject/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  const { target, campaign_id } = req.body
  if (!target) return res.status(400).json({ error: 'Target type required' })

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id)
  if (!template) return res.status(404).json({ error: 'Template not found' })

  const actions = injectNow(template, target, campaign_id || null)
  res.json({ templateId: template.id, type: template.type, target, actions })
})

router.get('/queue', authMiddleware, (req, res) => {
  const db = getDb()
  const items = db.prepare("SELECT * FROM content_queue WHERE status = 'pending' ORDER BY created_at DESC").all()
  res.json(items)
})

router.post('/queue/:id/post', authMiddleware, (req, res) => {
  const db = getDb()
  db.prepare('UPDATE content_queue SET status = ?, posted_at = ? WHERE id = ?')
    .run('posted', new Date().toISOString(), req.params.id)
  res.json({ posted: true })
})

router.get('/log', authMiddleware, (req, res) => {
  const db = getDb()
  const log = db.prepare('SELECT * FROM injection_log ORDER BY created_at DESC LIMIT 50').all()
  res.json(log)
})

module.exports = router
