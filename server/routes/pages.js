const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { buildPage, slugify } = require('../services/pageBuilder')

// GET /lp/:slug — serve a landing page
router.get('/lp/:slug', (req, res) => {
  const db = getDb()
  const page = db.prepare(`
    SELECT lp.*, w.domain, w.site_name, w.name as website_name
    FROM landing_pages lp
    LEFT JOIN websites w ON lp.website_id = w.id
    WHERE lp.slug = ? AND lp.active = 1
  `).get(req.params.slug)

  if (!page) {
    return res.status(404).send('Page not found')
  }

  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(page.html_content)
})

// GET /api/pages — list landing pages (optionally by website)
router.get('/api/pages', (req, res) => {
  const db = getDb()
  const websiteId = req.query.website_id || null
  const pages = websiteId
    ? db.prepare('SELECT id, title, slug, keyword, audience, language, website_id, active, created_at FROM landing_pages WHERE website_id = ? ORDER BY created_at DESC').all(websiteId)
    : db.prepare('SELECT id, title, slug, keyword, audience, language, website_id, active, created_at FROM landing_pages ORDER BY created_at DESC').all()
  res.json(pages)
})

// POST /api/pages/build — build a new landing page
router.post('/api/pages/build', express.json(), async (req, res) => {
  try {
    const { keyword, audience, providerId, planId, language, template, website_id } = req.body
    if (!keyword) return res.status(400).json({ error: 'keyword required' })

    const result = await buildPage({ keyword, audience, providerId, planId, language, template, websiteId: website_id || 1 })
    if (result.error) return res.status(409).json({ error: result.error })

    res.json({ success: true, id: result.id, slug: result.slug, title: result.title })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/pages/:id — soft-delete a landing page
router.delete('/api/pages/:id', (req, res) => {
  const db = getDb()
  db.prepare('UPDATE landing_pages SET active = 0 WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

module.exports = router
