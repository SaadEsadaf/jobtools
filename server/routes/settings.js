const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { loadProviders, saveProviders, testProvider, generate, getDefaultProviders } = require('../services/aiProvider')
const { loadSocialApis, saveSocialApis, getDefaults } = require('../services/socialPublisher')

const router = express.Router()

router.get('/ai-providers', authMiddleware, (req, res) => {
  res.json(loadProviders())
})

router.post('/ai-providers', authMiddleware, (req, res) => {
  saveProviders(req.body)
  res.json({ saved: true })
})

router.post('/ai-providers/test/:name', authMiddleware, async (req, res) => {
  const result = await testProvider(req.params.name)
  res.json(result)
})

router.post('/ai-providers/reset', authMiddleware, (req, res) => {
  saveProviders(getDefaultProviders())
  res.json({ reset: true })
})

router.get('/social-apis', authMiddleware, (req, res) => {
  res.json(loadSocialApis())
})

router.post('/social-apis', authMiddleware, (req, res) => {
  saveSocialApis(req.body)
  res.json({ saved: true })
})

router.post('/social-apis/reset', authMiddleware, (req, res) => {
  saveSocialApis(getDefaults())
  res.json({ reset: true })
})

module.exports = router
