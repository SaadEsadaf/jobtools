const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { source, language, intent, search, status, page = 1, limit = 50 } = req.query
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const params = []

  if (source) { sql += ' AND source = ?'; params.push(source) }
  if (language) { sql += ' AND language = ?'; params.push(language) }
  if (intent) { sql += ' AND intent_label = ?'; params.push(intent) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (search) { sql += ' AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)'; const s = `%${search}%`; params.push(s, s, s, s, s) }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total')
  const { total } = db.prepare(countSql).get(...params)

  const offset = (parseInt(page) - 1) * parseInt(limit)
  sql += ' ORDER BY intent_score DESC, created_at DESC LIMIT ? OFFSET ?'
  params.push(parseInt(limit), offset)
  const leads = db.prepare(sql).all(...params)

  const sources = db.prepare('SELECT DISTINCT source FROM leads WHERE source IS NOT NULL').all().map(r => r.source)
  const languages = db.prepare('SELECT DISTINCT language FROM leads WHERE language IS NOT NULL').all().map(r => r.language)
  const intents = db.prepare('SELECT DISTINCT intent_label FROM leads WHERE intent_label IS NOT NULL').all().map(r => r.intent_label)

  res.json({ leads, total, page: parseInt(page), limit: parseInt(limit), sources, languages, intents })
})

router.post('/import', authMiddleware, (req, res) => {
  const db = getDb()
  const { leads } = req.body
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Leads array required' })
  }

  const insert = db.prepare(`
    INSERT INTO leads (source, language, username, first_name, last_name, phone, email, intent_score, intent_label, status, notes, raw_data, imported_from, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction((items) => {
    let count = 0
    for (const l of items) {
      try {
        insert.run(
          l.source || null, l.language || null, l.username || null,
          l.first_name || null, l.last_name || null, l.phone || null, l.email || null,
          l.intent_score || 0, l.intent_label || null, l.status || 'new',
          l.notes || null, typeof l.raw_data === 'string' ? l.raw_data : (l.raw_data ? JSON.stringify(l.raw_data) : null),
          l.imported_from || 'manual',
          new Date().toISOString(), new Date().toISOString()
        )
        count++
      } catch (e) { /* skip duplicates */ }
    }
    return count
  })

  const imported = tx(leads)
  res.json({ imported, total: leads.length })
})

router.post('/import-from-iptv', authMiddleware, async (req, res) => {
  const db = getDb()
  const iptvUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()?.value || 'http://localhost:3001'

  try {
    const response = await fetch(`${iptvUrl}/api/brain/leads/export`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) throw new Error(`IPTV-Boss returned ${response.status}`)
    const leads = await response.json()
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.json({ imported: 0, message: 'No leads found in IPTV-Boss' })
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO leads (source, language, username, first_name, last_name, phone, email, intent_score, intent_label, status, raw_data, imported_from, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'iptv_boss', ?, ?)
    `)

    const tx = db.transaction((items) => {
      let count = 0
      for (const l of items) {
        try {
          insert.run(
            l.source || null, l.language || null, l.username || null,
            l.first_name || null, l.last_name || null, l.phone || null, l.email || null,
            l.intent_score || 0, l.intent_label || null, l.status || 'new',
            l.raw_data || null, new Date().toISOString(), new Date().toISOString()
          )
          count++
        } catch (e) { /* skip */ }
      }
      return count
    })

    const imported = tx(leads)
    res.json({ imported, total: leads.length, source: 'iptv_boss' })
  } catch (err) {
    res.status(502).json({ error: `Failed to import from IPTV-Boss: ${err.message}` })
  }
})

router.get('/export', authMiddleware, (req, res) => {
  const db = getDb()
  const { source, language, intent, status } = req.query
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const params = []
  if (source) { sql += ' AND source = ?'; params.push(source) }
  if (language) { sql += ' AND language = ?'; params.push(language) }
  if (intent) { sql += ' AND intent_label = ?'; params.push(intent) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY intent_score DESC, created_at DESC'

  const leads = db.prepare(sql).all(...params)

  const headers = ['id','source','language','username','first_name','last_name','phone','email','content','name','campaign_name','country','pain_point','opportunity','source_url','platform','intent_score','intent_label','status','notes','imported_from','created_at']
  const escapeCsv = v => { const s = String(v || ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s }

  const csv = [
    headers.join(','),
    ...leads.map(l => headers.map(h => escapeCsv(l[h])).join(','))
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename=leads-export-${Date.now()}.csv`)
  res.send(csv)
})

router.get('/stats', authMiddleware, (req, res) => {
  const db = getDb()
  const total = db.prepare('SELECT COUNT(*) as c FROM leads').get().c || 0
  const today = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')").get().c || 0
  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC').all()
  const byLanguage = db.prepare('SELECT language, COUNT(*) as count FROM leads GROUP BY language ORDER BY count DESC').all()
  const byIntent = db.prepare('SELECT intent_label, COUNT(*) as count FROM leads WHERE intent_label IS NOT NULL GROUP BY intent_label ORDER BY count DESC').all()
  const avgScore = db.prepare('SELECT AVG(intent_score) as avg FROM leads WHERE intent_score > 0').get().avg || 0
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email != '' AND email IS NOT NULL").get().c || 0
  const withPhone = db.prepare("SELECT COUNT(*) as c FROM leads WHERE phone != '' AND phone IS NOT NULL").get().c || 0

  res.json({ total, today, bySource, byLanguage, byIntent, avgScore, withEmail, withPhone })
})

module.exports = router
