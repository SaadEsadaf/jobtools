const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { loadProviders, saveProviders, testProvider, generate, getDefaultProviders } = require('../services/aiProvider')
const { loadSocialApis, saveSocialApis, getDefaults } = require('../services/socialPublisher')

const router = express.Router()

router.get('/ai-providers', authMiddleware, (req, res) => {
  res.json(loadProviders())
})

router.post('/ai-providers', authMiddleware, (req, res) => {
  saveProviders(req.body)
  res.json({ saved: true })
})

router.post('/ai-providers/test/:name', authMiddleware, async (req, res) => {
  const result = await testProvider(req.params.name)
  res.json(result)
})

router.post('/ai-providers/reset', authMiddleware, (req, res) => {
  saveProviders(getDefaultProviders())
  res.json({ reset: true })
})

router.get('/social-apis', authMiddleware, (req, res) => {
  res.json(loadSocialApis())
})

router.post('/social-apis', authMiddleware, (req, res) => {
  saveSocialApis(req.body)
  res.json({ saved: true })
})

router.post('/social-apis/reset', authMiddleware, (req, res) => {
  saveSocialApis(getDefaults())
  res.json({ reset: true })
})

// General app settings (Telegram token, notifications, marketing configs)
router.get('/app', authMiddleware, (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const settings = {}
  rows.forEach(r => settings[r.key] = r.value)
  res.json(settings)
})

router.put('/app', authMiddleware, (req, res) => {
  const db = getDb()
  const allowed = [
    'telegram_bot_token', 'telegram_chat_id', 'admin_email', 'admin_phone',
    'site_domain', 'site_url', 'site_name', 'support_email',
    'serpapi_key', 'rank_check_interval',
    'notification_enabled', 'whatsapp_enabled', 'telegram_enabled',
    'lead_outreach_enabled', 'lead_outreach_interval',
    'event_marketing_enabled', 'event_marketing_interval',
    'health_monitor_enabled', 'health_monitor_interval',
    'business_report_enabled', 'business_report_interval',
    'cart_recovery_enabled', 'trial_followup_enabled',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email'
  ]
  const updates = Object.entries(req.body).filter(([key]) => allowed.includes(key))
  const insert = db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
  for (const [key, value] of updates) {
    insert.run(key, String(value))
  }
  res.json({ saved: true, count: updates.length })
})

module.exports = router
