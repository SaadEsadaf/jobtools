const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all()
  res.json(campaigns)
})

router.post('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { name, description, type, target_source, target_language, target_intent, template_id } = req.body
  if (!name) return res.status(400).json({ error: 'Name required' })

  const r = db.prepare(`
    INSERT INTO campaigns (name, description, type, target_source, target_language, target_intent, template_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(name, description || null, type || null, target_source || null, target_language || null, target_intent || null, template_id || null, new Date().toISOString())

  res.json({ id: r.lastInsertRowid, name, status: 'draft' })
})

router.post('/execute/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

  const { injectionTypes = ['email_sequence', 'social_post'] } = req.body
  const { injectNow } = require('../services/templateInjection')
  const { notifyIptvBoss } = require('../services/brainBridge')

  let template = null
  if (campaign.template_id) {
    template = db.prepare('SELECT * FROM templates WHERE id = ?').get(campaign.template_id)
  }

  const results = []
  for (const target of injectionTypes) {
    if (template) {
      const actions = await injectNow(template, target, campaign)
      results.push({ target, actions })
    } else {
      results.push({ target, error: 'No template assigned' })
    }
  }

  db.prepare('UPDATE campaigns SET status = ?, executed_at = ?, results = ? WHERE id = ?')
    .run('executed', new Date().toISOString(), JSON.stringify(results), campaign.id)

  try {
    await notifyIptvBoss('campaign_executed', {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      injectionTypes,
      results,
      executed_at: new Date().toISOString()
    })
    db.prepare('UPDATE campaigns SET notified_to_brain = 1 WHERE id = ?').run(campaign.id)
  } catch (e) {
    // brain notification failure is non-fatal
  }

  res.json({ campaign_id: campaign.id, status: 'executed', results })
})

router.get('/history', authMiddleware, (req, res) => {
  const db = getDb()
  const campaigns = db.prepare("SELECT * FROM campaigns WHERE status = 'executed' ORDER BY executed_at DESC").all()
  res.json(campaigns)
})

router.get('/:id/results', authMiddleware, async (req, res) => {
  const db = getDb()
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

  const leadsCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE notes LIKE '%" + campaign.name + "_sent%' OR notes LIKE '%" + campaign.name + "_sent_%'").get().c

  let tracking = { unique_opens: 0, unique_clicks: 0, open_rate: 0, click_rate: 0, recent_events: [] }
  try {
    const resp = await fetch(`http://localhost:3001/api/tracking/stats/${encodeURIComponent(campaign.name)}`)
    if (resp.ok) tracking = await resp.json()
  } catch (e) {
    // IPTV-Boss unreachable
  }

  res.json({
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    status: campaign.status,
    executed_at: campaign.executed_at,
    leads_sent: leadsCount || 0,
    unique_opens: tracking.unique_opens || 0,
    unique_clicks: tracking.unique_clicks || 0,
    open_rate: leadsCount > 0 ? ((tracking.unique_opens / leadsCount) * 100).toFixed(1) : 0,
    click_rate: leadsCount > 0 ? ((tracking.unique_clicks / leadsCount) * 100).toFixed(1) : 0,
    recent_events: tracking.recent_events || [],
  })
})

module.exports = router
