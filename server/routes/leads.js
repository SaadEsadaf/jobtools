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

router.post('/import-json', authMiddleware, (req, res) => {
  const db = getDb()
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Array of lead objects required' })
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO leads (email, source, language, username, first_name, last_name, phone, intent_score, status, content, notes, imported_from, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'json_import', ?, ?)
  `)

  const tx = db.transaction((items) => {
    let imported = 0, skipped = 0
    for (const item of items) {
      const email = (item.email || '').toLowerCase().trim()
      if (!email && !item.username && !item.phone) { skipped++; continue }
      try {
        const r = insert.run(
          email || null, item.source || 'json_import', item.language || null,
          item.username || null, item.first_name || null, item.last_name || null,
          item.phone || null, parseInt(item.intent_score) || 50, item.status || 'new',
          item.content || null, item.notes || null,
          new Date().toISOString(), new Date().toISOString()
        )
        if (r.changes > 0) imported++; else skipped++
      } catch (e) { skipped++ }
    }
    return { imported, skipped }
  })

  const result = tx(items)
  res.json({ imported: result.imported, skipped: result.skipped, total: items.length })
})

router.post('/import-csv', authMiddleware, (req, res) => {
  const db = getDb()
  const { csv } = req.body
  if (!csv) return res.status(400).json({ error: 'CSV content required' })

  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return res.json({ imported: 0, error: 'Need header + data rows' })

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
  const insert = db.prepare(`
    INSERT OR IGNORE INTO leads (email, source, language, username, first_name, last_name, phone, intent_score, status, content, imported_from, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import', ?, ?)
  `)

  const tx = db.transaction((rows) => {
    let imported = 0, skipped = 0
    for (let i = 1; i < rows.length; i++) {
      const vals = rows[i].split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''))
      const row = {}
      headers.forEach((h, idx) => row[h] = vals[idx] || null)
      const email = (row.email || '').toLowerCase().trim()
      if (!email && !row.username && !row.phone) { skipped++; continue }
      try {
        const r = insert.run(
          email || null, row.source || 'csv_import', row.language || null,
          row.username || null, row.first_name || row.firstname || null,
          row.last_name || row.lastname || null, row.phone || null,
          parseInt(row.intent_score) || 50, row.status || 'new',
          row.content || null,
          new Date().toISOString(), new Date().toISOString()
        )
        if (r.changes > 0) imported++; else skipped++
      } catch (e) { skipped++ }
    }
    return { imported, skipped }
  })

  const result = tx(lines)
  res.json({ imported: result.imported, skipped: result.skipped, total: lines.length - 1 })
})

module.exports = router
