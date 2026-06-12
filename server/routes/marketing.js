const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const { getDb } = require('../db')
const { getUpcomingEvents, getTopEvents, sendEventCampaign, getTrendingEvents } = require('../services/eventMarketing')

const router = express.Router()

router.get('/events', authMiddleware, (req, res) => {
  res.json({ events: getTopEvents() })
})

router.get('/events/all', authMiddleware, (req, res) => {
  res.json({ events: getUpcomingEvents() })
})

router.post('/events/campaign', authMiddleware, async (req, res) => {
  const result = await sendEventCampaign()
  res.json(result)
})

router.get('/events/trending', authMiddleware, (req, res) => {
  res.json({ trending: getTrendingEvents() })
})

// World Cup 2026 campaign
router.post('/worldcup/validate', authMiddleware, async (req, res) => {
  try {
    const { validateLeads } = require('../services/worldCupCampaign')
    const result = await validateLeads()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/worldcup/sync', authMiddleware, async (req, res) => {
  try {
    const { getTopLeads, syncToIptvBoss } = require('../services/worldCupCampaign')
    const leads = await getTopLeads(parseInt(req.query.limit) || 20, 3)
    const result = await syncToIptvBoss(leads)
    res.json({ ...result, leads: leads.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/worldcup/send', authMiddleware, async (req, res) => {
  try {
    const { getTopLeads, sendWorldCupCampaign } = require('../services/worldCupCampaign')
    const leads = await getTopLeads(9, 3)
    const result = await sendWorldCupCampaign(leads)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/worldcup/run', authMiddleware, async (req, res) => {
  try {
    const { runCampaign } = require('../services/worldCupCampaign')
    const result = await runCampaign()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Bulk email campaign
router.post('/bulk/send', authMiddleware, async (req, res) => {
  try {
    const { batchSize, template, priority, campaignName, eventVars } = req.body
    const { getLeadsForBatch, sendBulkEmails, ensureTemplates } = require('../services/bulkEmailService')

    // Ensure templates exist in IPTV Boss
    await ensureTemplates()

    const size = parseInt(batchSize) || 50
    const prio = parseInt(priority) || 0
    const tpl = template || 'trial'

    const templateMap = { trial: 'trial_invitation', site: 'site_invitation', event: 'special_event' }
    const templateKey = templateMap[tpl] || 'trial_invitation'

    const leads = await getLeadsForBatch(size, prio)
    if (leads.length === 0) return res.json({ sent: 0, total: 0, error: 'No leads match criteria' })

    const result = await sendBulkEmails(leads, templateKey, campaignName || 'bulk_' + tpl, eventVars || {})
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/bulk/stats', authMiddleware, (req, res) => {
  const { getDb } = require('../db')
  const db = getDb()
  const total = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != '' AND intent_score IS NOT NULL AND intent_score > 0 AND (notes IS NULL OR (notes NOT LIKE '%no_mx%' AND notes NOT LIKE '%invalid%'))").get().c
  const bySource = db.prepare("SELECT source, COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != '' AND intent_score IS NOT NULL AND intent_score > 0 GROUP BY source ORDER BY c DESC").all()
  const contacted = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'contacted'").get().c
  const remaining = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != '' AND intent_score IS NOT NULL AND intent_score > 0 AND (notes IS NULL OR (notes NOT LIKE '%no_mx%' AND notes NOT LIKE '%invalid%')) AND (status IS NULL OR status != 'contacted')").get().c
  res.json({ total, contacted, remaining, bySource })
})

router.post('/templates/ensure', authMiddleware, async (req, res) => {
  const { ensureTemplates } = require('../services/bulkEmailService')
  await ensureTemplates()
  res.json({ ok: true })
})

module.exports = router