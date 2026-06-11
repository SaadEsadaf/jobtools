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

module.exports = router