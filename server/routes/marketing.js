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

module.exports = router