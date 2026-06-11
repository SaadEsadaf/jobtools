const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { generate, generateWithFallback } = require('../services/aiProvider')
const { postToReddit, postToFacebook, postToYoutube, searchBing } = require('../services/socialPublisher')

const router = express.Router()

router.post('/generate', authMiddleware, async (req, res) => {
  const { prompt, provider, temperature, maxTokens } = req.body
  if (!prompt) return res.status(400).json({ error: 'Prompt required' })
  try {
    const result = await generate(prompt, { provider, temperature, maxTokens, timeout: 60000 })
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/generate-marketing', authMiddleware, async (req, res) => {
  const { topic, language = 'fr', platforms = ['telegram', 'reddit', 'facebook'], tone = 'promotional' } = req.body
  if (!topic) return res.status(400).json({ error: 'Topic required' })

  const platformPrompts = {
    telegram: `Génère un message Telegram court et accrocheur en ${language} sur le thème: "${topic}". Ton: ${tone}. Inclus un CTA pour essai gratuit.`,
    reddit: `Génère un post Reddit en ${language} sur le thème: "${topic}". Ton: ${tone}. Écris-le comme une discussion utile, pas une pub directe. Ajoute un paragraphe d'introduction.`,
    facebook: `Génère un post Facebook en ${language} sur le thème: "${topic}". Ton: ${tone}. Inclus des hashtags et un CTA.`,
    twitter: `Génère un tweet en ${language} sur le thème: "${topic}". Ton: ${tone}. Maximum 280 caractères. Inclus 2 hashtags.`,
    whatsapp: `Génère un message WhatsApp en ${language} sur le thème: "${topic}". Ton: ${tone}. Court et direct avec emoji et CTA.`
  }

  try {
    const results = {}
    for (const platform of platforms) {
      const prompt = platformPrompts[platform]
      if (!prompt) continue
      try {
        const content = await generate(prompt, { timeout: 60000 })
        results[platform] = content.trim()
      } catch (err) {
        results[platform] = `[Erreur: ${err.message}]`
      }
    }
    res.json({ topic, language, tone, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/reddit/:action', authMiddleware, async (req, res) => {
  try {
    const result = await postToReddit(req.params.action, req.body)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/facebook/:action', authMiddleware, async (req, res) => {
  try {
    const result = await postToFacebook(req.params.action, req.body)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/youtube/:action', authMiddleware, async (req, res) => {
  try {
    const result = await postToYoutube(req.params.action, req.body)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/search', authMiddleware, async (req, res) => {
  const { query, engine = 'bing' } = req.body
  if (!query) return res.status(400).json({ error: 'Query required' })
  try {
    if (engine === 'bing') {
      const result = await searchBing(query)
      const results = (result.webPages?.value || []).map(p => ({ title: p.name, url: p.url, snippet: p.snippet }))
      return res.json({ results })
    }
    if (engine === 'youtube') {
      const { postToYoutube } = require('../services/socialPublisher')
      const result = await postToYoutube('search', { query, maxResults: 10 })
      const videos = (result.items || []).map(v => ({
        id: v.id?.videoId,
        title: v.snippet?.title,
        channel: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt
      }))
      return res.json({ videos })
    }
    res.status(400).json({ error: `Unknown engine: ${engine}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/auto-engage', authMiddleware, async (req, res) => {
  const { topic, subreddit, videoId, maxComments = 3 } = req.body
  if (!topic) return res.status(400).json({ error: 'Topic required' })

  try {
    const comment = await generate(
      `Génère un commentaire court (20-40 mots) en français sur le thème "${topic}" pour un subreddit ou une vidéo YouTube. Le commentaire doit être naturel, utile, pas spammy. Ne mentionne PAS de marque directement.`,
      { timeout: 30000 }
    )

    if (!subreddit && !videoId) {
      return res.json({ generatedComment: comment.trim(), note: 'Provide subreddit or videoId to post' })
    }

    const actions = []
    if (subreddit) {
      try {
        const r = await postToReddit('comment', { postId: subreddit, text: comment.trim() })
        actions.push({ platform: 'reddit', action: 'comment', status: 'posted' })
      } catch (e) { actions.push({ platform: 'reddit', action: 'comment', status: 'failed', error: e.message }) }
    }
    if (videoId) {
      try {
        const r = await postToYoutube('comment', { videoId, text: comment.trim() })
        actions.push({ platform: 'youtube', action: 'comment', status: 'posted' })
      } catch (e) { actions.push({ platform: 'youtube', action: 'comment', status: 'failed', error: e.message }) }
    }

    res.json({ comment: comment.trim(), actions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
