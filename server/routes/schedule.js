const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { postToReddit, postToFacebook, postToYoutube } = require('../services/socialPublisher')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { status, platform } = req.query
  let sql = 'SELECT * FROM scheduled_posts WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (platform) { sql += ' AND platform = ?'; params.push(platform) }
  sql += ' ORDER BY scheduled_at ASC'
  const posts = db.prepare(sql).all(...params)
  res.json(posts)
})

router.get('/calendar', authMiddleware, (req, res) => {
  const db = getDb()
  const posts = db.prepare('SELECT id, title, platform, action_type, status, scheduled_at, ai_generated, provider_used FROM scheduled_posts ORDER BY scheduled_at ASC').all()
  const grouped = {}
  posts.forEach(p => {
    const day = p.scheduled_at.split('T')[0] || p.scheduled_at.substring(0, 10)
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(p)
  })
  res.json({ posts, grouped })
})

router.post('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { title, content, platform, action_type = 'post', params: postParams = {}, scheduled_at, campaign_id, ai_generated, provider_used } = req.body
  if (!content || !platform || !scheduled_at) {
    return res.status(400).json({ error: 'content, platform, and scheduled_at required' })
  }
  const r = db.prepare(`
    INSERT INTO scheduled_posts (title, content, platform, action_type, params, scheduled_at, status, campaign_id, ai_generated, provider_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    title || null, content, platform, action_type,
    typeof postParams === 'string' ? postParams : JSON.stringify(postParams),
    scheduled_at, campaign_id || null, ai_generated ? 1 : 0, provider_used || null,
    new Date().toISOString()
  )
  res.json({ id: r.lastInsertRowid, scheduled: true })
})

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb()
  const { title, content, platform, action_type, params: postParams, scheduled_at, status } = req.body
  const existing = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare(`
    UPDATE scheduled_posts SET title=?, content=?, platform=?, action_type=?, params=?, scheduled_at=?, status=?
    WHERE id=?
  `).run(
    title ?? existing.title, content ?? existing.content, platform ?? existing.platform,
    action_type ?? existing.action_type,
    postParams ? (typeof postParams === 'string' ? postParams : JSON.stringify(postParams)) : existing.params,
    scheduled_at ?? existing.scheduled_at, status ?? existing.status,
    req.params.id
  )
  res.json({ updated: true })
})

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM scheduled_posts WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

router.post('/:id/post-now', authMiddleware, async (req, res) => {
  const db = getDb()
  const post = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(req.params.id)
  if (!post) return res.status(404).json({ error: 'Not found' })

  let params = {}
  try { params = JSON.parse(post.params || '{}') } catch { params = {} }

  try {
    let result
    switch (post.platform) {
      case 'reddit':
        result = await postToReddit(post.action_type, { ...params, text: post.content })
        break
      case 'facebook':
        result = await postToFacebook(post.action_type, { ...params, message: post.content })
        break
      case 'youtube':
        result = await postToYoutube(post.action_type, { ...params, text: post.content })
        break
      default:
        throw new Error(`Unsupported platform: ${post.platform}`)
    }
    db.prepare('UPDATE scheduled_posts SET status = ?, posted_at = ?, result = ? WHERE id = ?')
      .run('posted', new Date().toISOString(), JSON.stringify(result), post.id)
    res.json({ posted: true, result })
  } catch (err) {
    db.prepare('UPDATE scheduled_posts SET status = ?, result = ? WHERE id = ?')
      .run('failed', err.message, post.id)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
