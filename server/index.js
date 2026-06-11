require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '..', 'client', 'public')))

const authRoutes = require('./routes/auth')
const statsRoutes = require('./routes/stats')
const leadsRoutes = require('./routes/leads')
const campaignsRoutes = require('./routes/campaigns')
const templatesRoutes = require('./routes/templates')
const brainRoutes = require('./routes/brain')
const settingsRoutes = require('./routes/settings')
const automationsRoutes = require('./routes/automations')
const scheduleRoutes = require('./routes/schedule')
const thesisRoutes = require('./routes/thesis')
const snifferRoutes = require('./routes/sniffers')
const marketingRoutes = require('./routes/marketing')

app.use('/api/auth', authRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/leads', leadsRoutes)
app.use('/api/campaigns', campaignsRoutes)
app.use('/api/templates', templatesRoutes)
app.use('/api/brain', brainRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/automations', automationsRoutes)
app.use('/api/schedule', scheduleRoutes)
app.use('/api/thesis', thesisRoutes)
app.use('/api/sniffers', snifferRoutes)
app.use('/api/marketing', marketingRoutes)

// Start background scheduler
const { startScheduler } = require('./services/scheduler')
startScheduler(60000)

// Initialize sniffer sources
const { seedDefaults: seedTelegram } = require('./services/telegramSniffer')
const { seedDefaults: seedTwitter } = require('./services/twitterSniffer')
const { seedDefaults: seedReddit } = require('./services/redditSniffer')
const ytSnifferInit = require('./services/youtubeSniffer')
const webSnifferInit = require('./services/webSniffer')
const seedYoutube = ytSnifferInit.seedDefaults
const seedWeb = webSnifferInit.seedDefaults
seedTelegram()
seedTwitter()
seedReddit()
seedYoutube()
seedWeb()

// Start sniffer cron jobs
const { sniffTelegram } = require('./services/telegramSniffer')
const { sniffTwitter } = require('./services/twitterSniffer')
const { sniffReddit } = require('./services/redditSniffer')
const sniffYoutube = ytSnifferInit.sniffYoutube
const sniffWeb = webSnifferInit.sniffWeb
const { enrichStaleLeads } = require('./services/leadEnrichment')
const { notifyIptvBoss } = require('./services/brainBridge')

async function runSniffers() {
  let total = 0
  try { total += await sniffTelegram() } catch (e) { console.error('Telegram sniffer cron:', e.message) }
  try { total += await sniffTwitter() } catch (e) { console.error('Twitter sniffer cron:', e.message) }
  try { total += await sniffReddit() } catch (e) { console.error('Reddit sniffer cron:', e.message) }
  try { total += await sniffYoutube() } catch (e) { console.error('YouTube sniffer cron:', e.message) }
  try { total += await sniffWeb() } catch (e) { console.error('Web sniffer cron:', e.message) }
  if (total > 0) {
    try {
      await notifyIptvBoss('leads_sync', {
        leads: [{ source: 'sniffers_cron', count: total, campaign_name: 'sniffers_cron' }]
      })
    } catch (e) { /* bridge may be down */ }
  }
}

async function runEnrichment() {
  try { await enrichStaleLeads(10) } catch (e) { /* silent */ }
}

// Run sniffers every 30 min, enrichment every 15 min
setInterval(runSniffers, 30 * 60 * 1000)
setInterval(runEnrichment, 15 * 60 * 1000)

// Run once on startup after a delay
setTimeout(runSniffers, 10000)
setTimeout(runEnrichment, 20000)

// Marketing cycle — event campaigns every 6h, check enabled in app_settings
async function runMarketingCycle() {
  const db = require('./db').getDb()
  const enabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'event_marketing_enabled'").get() || {}).value
  if (enabled === '0') return
  try {
    const { sendEventCampaign } = require('./services/eventMarketing')
    const result = await sendEventCampaign()
    if (result.sent > 0) console.log(`[Marketing] Event campaign: ${result.sent} sent for ${result.event}`)
  } catch (e) { console.error('[Marketing] Event cycle error:', e.message) }
}

// Run every 6 hours (at 0,6,12,18)
setInterval(runMarketingCycle, 6 * 60 * 60 * 1000)
// Also check if we should run now (based on current hour)
const currentHour = new Date().getHours()
if (currentHour % 6 === 0) setTimeout(runMarketingCycle, 30000)
else {
  // Run at next 6h boundary
  const nextRun = (6 - (currentHour % 6)) * 60 * 60 * 1000
  setTimeout(runMarketingCycle, Math.min(nextRun, 6 * 60 * 60 * 1000))
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'public', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JobTools Marketing Lab running on port ${PORT}`)
})
