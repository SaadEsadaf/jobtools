const crypto = require('crypto')

function getSharedSecret() {
  const { getDb } = require('../db')
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'internal_api_secret'").get()
    if (row && row.value && row.value !== 'dev-secret-change-in-production') return row.value
  } catch {}
  return process.env.INTERNAL_API_SECRET || 'dev-secret-change-in-production'
}

function verifySignature(req, res, next) {
  const signature = req.headers['x-engine-signature']
  if (!signature) return res.status(401).json({ error: 'Missing X-Engine-Signature header' })

  const parts = signature.split('.')
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid signature format' })

  const [timestamp, sig] = parts
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: 'Signature expired' })
  }

  const secret = getSharedSecret()
  const rawBody = JSON.stringify(req.body)
  const expected = crypto.createHmac('sha256', secret).update(rawBody + timestamp).digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  next()
}

function signPayload(payload) {
  const secret = getSharedSecret()
  const timestamp = Math.floor(Date.now() / 1000)
  const rawBody = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', secret).update(rawBody + String(timestamp)).digest('hex')
  return `${timestamp}.${sig}`
}

function verifyRequest(timestamp, sig, body) {
  const secret = getSharedSecret()
  const rawBody = JSON.stringify(body)
  const expected = crypto.createHmac('sha256', secret).update(rawBody + timestamp).digest('hex')
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

module.exports = { verifySignature, signPayload, verifyRequest, getSharedSecret }
