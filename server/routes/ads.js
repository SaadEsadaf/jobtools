const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const {
  getAdAccounts, connectAccount, disconnectAccount,
  listCampaigns, createCampaign, createAdSet, createAd,
  generatePreview, getInsights, getAdFormats, getPages
} = require('../services/metaAdsService')

const router = express.Router()

router.get('/accounts', authMiddleware, (req, res) => {
  res.json(getAdAccounts())
})

router.post('/accounts/connect', authMiddleware, async (req, res) => {
  try {
    const { accessToken, adAccountId } = req.body
    if (!accessToken || !adAccountId) return res.status(400).json({ error: 'accessToken and adAccountId required' })
    const result = await connectAccount(accessToken, adAccountId)
    res.json({ success: true, ...result })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.delete('/accounts/:id', authMiddleware, (req, res) => {
  disconnectAccount(req.params.id)
  res.json({ success: true })
})

router.get('/campaigns/:accountId', authMiddleware, async (req, res) => {
  try {
    const campaigns = await listCampaigns(req.params.accountId, req.query.status)
    res.json(campaigns)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/campaigns/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await createCampaign(req.params.accountId, req.body)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/adsets/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await createAdSet(req.params.accountId, req.body)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/ads/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await createAd(req.params.accountId, req.body)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/preview/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await generatePreview(req.params.accountId, req.body)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/insights/:accountId', authMiddleware, async (req, res) => {
  try {
    const insights = await getInsights(req.params.accountId, req.query.campaignId, req.query.datePreset)
    res.json(insights)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.get('/formats', authMiddleware, async (req, res) => {
  res.json(await getAdFormats())
})

router.get('/pages/:accountId', authMiddleware, async (req, res) => {
  try {
    const pages = await getPages(req.params.accountId)
    res.json(pages)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

module.exports = router
