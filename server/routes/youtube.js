const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { authMiddleware } = require('../middleware/auth')
const {
  getAuthUrl, handleOAuthCallback, getChannels, disconnectChannel,
  uploadVideo, uploadFromUrl, uploadFromBuffer,
  listVideos, syncVideoStats,
  replyToComment, moderateComment,
  fetchAndStoreComments, getStoredComments
} = require('../services/youtubeManager')

const router = express.Router()

const tmpDir = path.join(__dirname, '..', '..', 'data', 'tmp')
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error(`Invalid file type: ${ext}. Allowed: ${allowed.join(', ')}`))
  }
})

router.get('/auth-url', authMiddleware, async (req, res) => {
  try {
    const url = await getAuthUrl()
    res.json({ url })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/oauth/callback', async (req, res) => {
  try {
    const { code } = req.query
    if (!code) return res.status(400).send('Missing authorization code')
    const result = await handleOAuthCallback(code)
    res.redirect(`/?tab=youtube&connected=${result.channelId}`)
  } catch (e) {
    res.redirect(`/?tab=youtube&error=${encodeURIComponent(e.message)}`)
  }
})

router.get('/channels', authMiddleware, (req, res) => {
  res.json(getChannels())
})

router.delete('/channels/:channelId', authMiddleware, (req, res) => {
  disconnectChannel(req.params.channelId)
  res.json({ success: true })
})

router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' })
    const result = await uploadVideo(null, {
      filePath: req.file.path,
      title: req.body.title,
      description: req.body.description,
      tags: req.body.tags,
      privacyStatus: req.body.privacyStatus || 'private',
      categoryId: req.body.categoryId || '22',
      thumbnailPath: req.file.thumbnail || req.body.thumbnailPath
    })
    try { fs.unlinkSync(req.file.path) } catch (e) { /* cleanup */ }
    res.json(result)
  } catch (e) {
    if (req.file) try { fs.unlinkSync(req.file.path) } catch (e2) { /* cleanup */ }
    res.status(400).json({ error: e.message })
  }
})

router.post('/upload-url', authMiddleware, async (req, res) => {
  try {
    const { url, title, description, tags, privacyStatus, categoryId } = req.body
    if (!url) return res.status(400).json({ error: 'url required' })
    const result = await uploadFromUrl(null, { url, title, description, tags, privacyStatus, categoryId })
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/videos', authMiddleware, async (req, res) => {
  try {
    const videos = await listVideos(req.query.channelId)
    res.json(videos)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/videos/sync-stats', authMiddleware, async (req, res) => {
  try {
    await syncVideoStats(req.body.channelId)
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/videos/:videoId/comments', authMiddleware, async (req, res) => {
  try {
    const comments = await getStoredComments(req.params.videoId, req.query.moderationStatus)
    res.json(comments)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/videos/:videoId/comments/fetch', authMiddleware, async (req, res) => {
  try {
    const result = await fetchAndStoreComments(req.body.channelId, req.params.videoId)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/comments/reply', authMiddleware, async (req, res) => {
  try {
    const { commentId, text, channelId } = req.body
    if (!commentId || !text) return res.status(400).json({ error: 'commentId and text required' })
    const result = await replyToComment(channelId, commentId, text)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/comments/moderate', authMiddleware, async (req, res) => {
  try {
    const { commentId, action, channelId } = req.body
    if (!commentId || !action) return res.status(400).json({ error: 'commentId and action required' })
    const result = await moderateComment(channelId, commentId, action)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 1GB.' })
    return res.status(400).json({ error: err.message })
  }
  if (err) return res.status(400).json({ error: err.message })
  next()
})

module.exports = router
