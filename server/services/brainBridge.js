const { getDb } = require('../db')

const JOBTOSS_API_KEY = process.env.JOBTOSS_API_KEY || 'jobtools-bridge-key-2024'

async function notifyIptvBoss(eventType, payload) {
  const db = getDb()
  const iptvUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()?.value || 'http://localhost:3001'

  const bridgePayload = {
    source: 'jobtools',
    api_key: JOBTOSS_API_KEY,
    event: eventType,
    payload,
    timestamp: new Date().toISOString()
  }

  const logEntry = {
    event_type: eventType,
    payload: JSON.stringify(payload),
    status: 'pending',
    created_at: new Date().toISOString()
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${iptvUrl}/api/brain/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bridgePayload),
      signal: controller.signal
    })
    clearTimeout(timeout)

    const responseText = await response.text()
    logEntry.response = responseText.substring(0, 1000)
    logEntry.status = response.ok ? 'delivered' : 'failed'
  } catch (err) {
    logEntry.response = err.message
    logEntry.status = 'error'
  }

  db.prepare(`
    INSERT INTO brain_bridge_log (event_type, payload, response, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(logEntry.event_type, logEntry.payload, logEntry.response, logEntry.status, logEntry.created_at)

  return logEntry
}

module.exports = { notifyIptvBoss, JOBTOSS_API_KEY }
