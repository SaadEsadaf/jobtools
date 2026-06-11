const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()

  const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c
  const leadsWithEmail = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != ''").get().c
  const leadsWithPhone = db.prepare("SELECT COUNT(*) as c FROM leads WHERE phone IS NOT NULL AND phone != ''").get().c
  const highIntent = db.prepare('SELECT COUNT(*) as c FROM leads WHERE intent_score >= 7').get().c
  const totalCampaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c
  const executedCampaigns = db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status = 'executed'").get().c
  const pendingQueue = db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'pending'").get().c
  const injections = db.prepare("SELECT COUNT(*) as c FROM injection_log WHERE status = 'completed'").get().c
  const brainDelivered = db.prepare("SELECT COUNT(*) as c FROM brain_bridge_log WHERE status = 'delivered'").get().c

  const sourceBreakdown = db.prepare('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC').all()
  const langBreakdown = db.prepare('SELECT language, COUNT(*) as count FROM leads GROUP BY language ORDER BY count DESC').all()
  const intentBreakdown = db.prepare('SELECT intent_label, COUNT(*) as count FROM leads WHERE intent_label IS NOT NULL GROUP BY intent_label ORDER BY count DESC').all()
  const recentInjectionLog = db.prepare('SELECT * FROM injection_log ORDER BY created_at DESC LIMIT 10').all()
  const recentQueue = db.prepare("SELECT * FROM content_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10").all()
  const brainStatus = db.prepare('SELECT * FROM brain_bridge_log ORDER BY created_at DESC LIMIT 5').all()
  const recentLeads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5').all()

  res.json({
    stats: {
      totalLeads,
      leadsWithEmail,
      leadsWithPhone,
      highIntent,
      totalCampaigns,
      executedCampaigns,
      pendingQueue,
      injections,
      brainDelivered
    },
    breakdowns: {
      sourceBreakdown,
      langBreakdown,
      intentBreakdown
    },
    recentInjectionLog,
    recentQueue,
    brainStatus,
    recentLeads
  })
})

module.exports = router
