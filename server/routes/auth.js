const express = require('express')
const bcrypt = require('bcryptjs')
const { getDb } = require('../db')
const { generateToken } = require('../middleware/auth')

const router = express.Router()

router.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' })
  }
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = generateToken(user)
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

module.exports = router
