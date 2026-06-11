const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { notifyIptvBoss } = require('../services/brainBridge')

const router = express.Router()

router.get('/status', authMiddleware, (req, res) => {
  const db = getDb()
  const iptvUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()?.value || 'http://localhost:3001'
  const log = db.prepare('SELECT * FROM brain_bridge_log ORDER BY created_at DESC LIMIT 20').all()

  res.json({
    connected: true,
    iptvBossUrl: iptvUrl,
    lastEvents: log,
    lastSync: log.length > 0 ? log[0].created_at : null
  })
})

router.post('/sync', authMiddleware, async (req, res) => {
  const db = getDb()
  const iptvUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()?.value || 'http://localhost:3001'

  const events = [
    { event: 'leads_sync', payload: { count: db.prepare('SELECT COUNT(*) as c FROM leads').get().c } },
    { event: 'campaigns_sync', payload: { count: db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c } }
  ]

  const results = []
  for (const event of events) {
    try {
      const r = await notifyIptvBoss(event.event, event.payload)
      results.push(r)
    } catch (e) {
      results.push({ event: event.event, status: 'error', response: e.message })
    }
  }

  res.json({ synced: true, results })
})

router.put('/settings', authMiddleware, (req, res) => {
  const db = getDb()
  const { iptv_boss_url, iptv_boss_token, site_domain } = req.body

  if (iptv_boss_url) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('iptv_boss_url', ?)").run(iptv_boss_url)
  if (iptv_boss_token) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('iptv_boss_token', ?)").run(iptv_boss_token)
  if (site_domain) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('site_domain', ?)").run(site_domain)

  res.json({ saved: true })
})

router.get('/settings', authMiddleware, (req, res) => {
  const db = getDb()
  const urls = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('iptv_boss_url', 'iptv_boss_token', 'site_domain')").all()
  const settings = {}
  urls.forEach(r => settings[r.key] = r.value)
  res.json(settings)
})

module.exports = router
