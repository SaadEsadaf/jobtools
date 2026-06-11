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
  const scheduledCount = db.prepare("SELECT COUNT(*) as c FROM scheduled_posts WHERE status = 'pending'").get().c
  const aiCalls = db.prepare('SELECT COUNT(*) as c FROM ai_usage_log').get().c
  const aiSuccess = db.prepare('SELECT COUNT(*) as c FROM ai_usage_log WHERE success = 1').get().c
  const aiToday = db.prepare("SELECT COUNT(*) as c FROM ai_usage_log WHERE date(created_at) = date('now')").get().c

  const aiUsageByProvider = db.prepare('SELECT provider, COUNT(*) as count, SUM(success) as success_count, ROUND(AVG(duration_ms)) as avg_ms FROM ai_usage_log GROUP BY provider ORDER BY count DESC').all()
  const aiUsageByDay = db.prepare("SELECT date(created_at) as day, COUNT(*) as count FROM ai_usage_log GROUP BY date(created_at) ORDER BY day DESC LIMIT 14").all()
  const scheduledUpcoming = db.prepare("SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_at > datetime('now') ORDER BY scheduled_at ASC LIMIT 10").all()

  const snifferSources = db.prepare('SELECT platform, COUNT(*) as count, SUM(lead_count) as total_leads FROM sniffer_sources GROUP BY platform').all()
  const leadsToday = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')").get().c || 0
  const enrichedCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE intent_score > 0 AND intent_score IS NOT NULL").get().c || 0

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
      brainDelivered,
      scheduledCount,
      aiCalls,
      aiSuccess,
      aiToday
    },
    snifferStats: {
      snifferSources,
      leadsToday,
      enrichedCount
    },
    breakdowns: {
      sourceBreakdown,
      langBreakdown,
      intentBreakdown
    },
    aiUsage: {
      byProvider: aiUsageByProvider,
      byDay: aiUsageByDay
    },
    scheduledUpcoming,
    recentInjectionLog,
    recentQueue,
    brainStatus,
    recentLeads
  })
})

module.exports = router
