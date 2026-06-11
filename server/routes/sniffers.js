const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { sniffTelegram, discoverTelegramSources, seedDefaults } = require('../services/telegramSniffer')
const { sniffTwitter, discoverTwitterSources } = require('../services/twitterSniffer')
const { sniffReddit, discoverRedditSources } = require('../services/redditSniffer')
const ytSniffer = require('../services/youtubeSniffer')
const webSniffer = require('../services/webSniffer')
const { enrichStaleLeads } = require('../services/leadEnrichment')
const { generate } = require('../services/aiProvider')

const router = express.Router()

router.get('/sources', authMiddleware, (req, res) => {
  const db = getDb()
  const { platform } = req.query
  let sql = "SELECT * FROM sniffer_sources"
  const params = []
  if (platform) { sql += " WHERE platform = ?"; params.push(platform) }
  sql += " ORDER BY platform, name"
  const sources = db.prepare(sql).all(...params)
  res.json(sources)
})

router.post('/sources', authMiddleware, (req, res) => {
  const db = getDb()
  const { platform, name, query, enabled } = req.body
  if (!platform || !name) return res.status(400).json({ error: 'Platform and name required' })
  try {
    db.prepare("INSERT INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES (?, ?, ?, ?, 'manual')")
      .run(platform, name, query || name, enabled !== false ? 1 : 0)
    res.json({ added: true, platform, name })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.delete('/sources/:id', authMiddleware, (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM sniffer_sources WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

router.post('/sources/toggle/:id', authMiddleware, (req, res) => {
  const db = getDb()
  const source = db.prepare('SELECT * FROM sniffer_sources WHERE id = ?').get(req.params.id)
  if (!source) return res.status(404).json({ error: 'Source not found' })
  db.prepare('UPDATE sniffer_sources SET enabled = ? WHERE id = ?').run(source.enabled ? 0 : 1, req.params.id)
  res.json({ id: req.params.id, enabled: !source.enabled })
})

router.post('/run/telegram', authMiddleware, async (req, res) => {
  try {
    const count = await sniffTelegram()
    const { notifyIptvBoss } = require('../services/brainBridge')
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'telegram_sniffer', count, campaign_name: 'telegram_auto_sniff' }]
    }).catch(() => {})
    res.json({ sniffed: true, leads_found: count, platform: 'telegram' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run/twitter', authMiddleware, async (req, res) => {
  try {
    const count = await sniffTwitter()
    const { notifyIptvBoss } = require('../services/brainBridge')
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'twitter_sniffer', count, campaign_name: 'twitter_auto_sniff' }]
    }).catch(() => {})
    res.json({ sniffed: true, leads_found: count, platform: 'twitter' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run/reddit', authMiddleware, async (req, res) => {
  try {
    const count = await sniffReddit()
    const { notifyIptvBoss } = require('../services/brainBridge')
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'reddit_sniffer', count, campaign_name: 'reddit_auto_sniff' }]
    }).catch(() => {})
    res.json({ sniffed: true, leads_found: count, platform: 'reddit' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run/youtube', authMiddleware, async (req, res) => {
  try {
    const count = await ytSniffer.sniffYoutube()
    const { notifyIptvBoss } = require('../services/brainBridge')
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'youtube_sniffer', count, campaign_name: 'youtube_auto_sniff' }]
    }).catch(() => {})
    res.json({ sniffed: true, leads_found: count, platform: 'youtube' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run/web', authMiddleware, async (req, res) => {
  try {
    const count = await webSniffer.sniffWeb()
    const { notifyIptvBoss } = require('../services/brainBridge')
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'web_sniffer', count, campaign_name: 'web_auto_sniff' }]
    }).catch(() => {})
    res.json({ sniffed: true, leads_found: count, platform: 'web' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run/all', authMiddleware, async (req, res) => {
  const results = {}
  try { results.telegram = await sniffTelegram() } catch (e) { results.telegram = 0 }
  try { results.twitter = await sniffTwitter() } catch (e) { results.twitter = 0 }
  try { results.reddit = await sniffReddit() } catch (e) { results.reddit = 0 }
  try { results.youtube = await sniffYoutube() } catch (e) { results.youtube = 0 }
  try { results.web = await sniffWeb() } catch (e) { results.web = 0 }

  const total = Object.values(results).reduce((a, b) => a + b, 0)
  const { notifyIptvBoss } = require('../services/brainBridge')
  if (total > 0) {
    await notifyIptvBoss('leads_sync', {
      leads: [{ source: 'sniffers_auto', count: total, campaign_name: 'sniffers_auto_run' }]
    }).catch(() => {})
  }

  res.json({ sniffed: true, results, total })
})

router.post('/discover', authMiddleware, async (req, res) => {
  const { platform } = req.body
  if (!platform) return res.status(400).json({ error: 'Platform required (telegram or twitter)' })
  try {
    let count = 0
    if (platform === 'telegram') count = await discoverTelegramSources()
    else if (platform === 'twitter') count = await discoverTwitterSources()
    else if (platform === 'reddit') count = await discoverRedditSources()
    else if (platform === 'youtube') count = 0  // uses fixed queries, not AI discovery
    else if (platform === 'web') count = 0
    else return res.status(400).json({ error: 'Unknown platform' })
    res.json({ discovered: count, platform })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/enrich', authMiddleware, async (req, res) => {
  try {
    const count = await enrichStaleLeads(req.body.limit || 20)
    res.json({ enriched: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', authMiddleware, (req, res) => {
  const db = getDb()
  const byPlatform = db.prepare(`
    SELECT platform, COUNT(*) as count, SUM(lead_count) as total_leads
    FROM sniffer_sources GROUP BY platform
  `).all()
  const lastSniff = db.prepare(`
    SELECT platform, MAX(last_sniffed) as last_run
    FROM sniffer_sources WHERE last_sniffed IS NOT NULL GROUP BY platform
  `).all()
  const totalLeads = db.prepare("SELECT COUNT(*) as c FROM leads").get().c || 0
  const leadsToday = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')").get().c || 0
  const enrichedCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE intent_score > 0").get().c || 0

  res.json({ byPlatform, lastSniff, totalLeads, leadsToday, enrichedCount })
})

module.exports = router
