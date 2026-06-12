const { getDb } = require('../db')

function getApiKey() {
  const db = getDb()
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'sendgrid_api_key'").get()
  return row?.value || ''
}

async function sendViaSendGrid(to, name, subject, html) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('SendGrid API key not configured')

  const body = {
    personalizations: [{ to: [{ email: to, name: name || '' }] }],
    from: { email: 'support@dalletek.live', name: 'Dalletek' },
    subject: subject,
    content: [{ type: 'text/html', value: html }],
    tracking_settings: {
      click_tracking: { enable: true },
      open_tracking: { enable: true },
    },
  }

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`SendGrid API returned ${resp.status}: ${text.substring(0, 200)}`)
  }

  return true
}

async function testSendGrid() {
  const apiKey = getApiKey()
  if (!apiKey) return { ok: false, error: 'No API key configured' }
  try {
    // Verify API key by checking account balance
    const resp = await fetch('https://api.sendgrid.com/v3/user/credits', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!resp.ok) return { ok: false, error: `API key invalid (${resp.status})` }
    const data = await resp.json()
    return { ok: true, remaining: data.remain || 0, used: data.used || 0, total: data.total || 100 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function getSendGridLimit() {
  const db = getDb()
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'sendgrid_daily_limit'").get()
  return parseInt(row?.value || '100')
}

module.exports = { sendViaSendGrid, testSendGrid, getSendGridLimit, getApiKey }
