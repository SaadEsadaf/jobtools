const jwt = require('jsonwebtoken')
const { getDb } = require('../db')

const JWT_SECRET = process.env.JWT_SECRET || 'jobtools_secret_key_change_in_production'

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
}

module.exports = { authMiddleware, generateToken, JWT_SECRET }
