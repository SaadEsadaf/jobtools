const { getDb } = require('../db')

const GRAPH_VERSION = 'v25.0'
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

function getAdAccounts() {
  const db = getDb()
  return db.prepare("SELECT * FROM ad_platforms WHERE platform = 'facebook' ORDER BY created_at DESC").all()
}

function getAdAccount(id) {
  const db = getDb()
  return db.prepare("SELECT * FROM ad_platforms WHERE id = ? AND platform = 'facebook'").get(id)
}

async function connectAccount(accessToken, adAccountId) {
  adAccountId = adAccountId.replace(/^act_/, '')
  const res = await fetch(`${BASE}/act_${adAccountId}?fields=name,currency,account_status&access_token=${accessToken}`, {
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta API error: ${err}`)
  }
  const data = await res.json()
  const db = getDb()
  const existing = db.prepare("SELECT id FROM ad_platforms WHERE account_id = ? AND platform = 'facebook'").get(adAccountId)
  if (existing) {
    db.prepare("UPDATE ad_platforms SET access_token = ?, account_name = ?, is_active = 1 WHERE id = ?")
      .run(accessToken, data.name || '', existing.id)
    return { id: existing.id, name: data.name, currency: data.currency }
  }
  const info = db.prepare("INSERT INTO ad_platforms (platform, account_name, account_id, access_token) VALUES (?, ?, ?, ?)")
    .run('facebook', data.name || '', adAccountId, accessToken)
  return { id: info.lastInsertRowid, name: data.name, currency: data.currency }
}

function disconnectAccount(id) {
  const db = getDb()
  db.prepare("DELETE FROM ad_platforms WHERE id = ? AND platform = 'facebook'").run(id)
}

async function apiCall(account, path, opts = {}) {
  const url = `${BASE}/${path.replace(/^\//, '')}`
  const params = new URLSearchParams({ access_token: account.access_token, ...opts.params })
  const fullUrl = `${url}?${params}`
  const res = await fetch(fullUrl, {
    method: opts.method || 'GET',
    headers: opts.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body: opts.body ? new URLSearchParams(opts.body).toString() : undefined,
    signal: AbortSignal.timeout(opts.timeout || 30000)
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta API error: ${err}`)
  }
  return res.json()
}

async function listCampaigns(accountId, statusFilter) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const params = { fields: 'id,name,objective,status,daily_budget,lifetime_budget,currency,start_time,updated_time,created_time' }
  if (statusFilter) params.filtering = JSON.stringify([{ field: 'campaign.status', operator: 'IN', value: [statusFilter] }])
  const data = await apiCall(account, `act_${account.account_id}/campaigns`, { params })
  return data.data || []
}

async function createCampaign(accountId, { name, objective, dailyBudget, status }) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const body = {
    name,
    objective,
    status: status || 'PAUSED',
    special_ad_categories: [],
    daily_budget: dailyBudget ? String(Math.round(parseFloat(dailyBudget) * 100)) : undefined
  }
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k])
  const data = await apiCall(account, `act_${account.account_id}/campaigns`, { method: 'POST', body })
  return data
}

async function createAdSet(accountId, { campaignId, name, dailyBudget, bidAmount, optimizationGoal, billingEvent, geoLocations, ageMin, ageMax, placements, status }) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const targeting = {}
  if (geoLocations) targeting.geo_locations = typeof geoLocations === 'string' ? JSON.parse(geoLocations) : geoLocations
  if (ageMin) targeting.age_min = ageMin
  if (ageMax) targeting.age_max = ageMax
  const body = {
    name,
    campaign_id: campaignId,
    daily_budget: dailyBudget ? String(Math.round(parseFloat(dailyBudget) * 100)) : undefined,
    bid_amount: bidAmount ? String(Math.round(parseFloat(bidAmount) * 100)) : undefined,
    optimization_goal: optimizationGoal || 'REACH',
    billing_event: billingEvent || 'IMPRESSIONS',
    status: status || 'PAUSED',
    targeting: Object.keys(targeting).length ? targeting : undefined
  }
  if (placements) body.targeting = { ...body.targeting, publisher_platforms: placements.split(',').map(p => p.trim()), facebook_positions: ['feed'], instagram_positions: ['stream'] }
  if (placements && !body.targeting) body.targeting = {}
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k])
  const data = await apiCall(account, `act_${account.account_id}/adsets`, { method: 'POST', body })
  return data
}

async function createAd(accountId, { adSetId, name, headline, text, link, imageUrl, callToAction, status }) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const pageRes = await apiCall(account, 'me/accounts', { params: { fields: 'id,name', limit: 1 } })
  const pageId = pageRes.data?.[0]?.id || 'me'
  const creativeBody = {
    object_story_spec: {
      page_id: pageId,
      link_data: {
        link: link || 'https://dalletek.live',
        message: text || '',
        name: headline || '',
        description: text ? text.substring(0, 100) : '',
        call_to_action: { type: callToAction || 'SIGN_UP', value: { link: link || 'https://dalletek.live' } }
      }
    }
  }
  if (imageUrl) {
    creativeBody.object_story_spec.link_data.image_url = imageUrl
  }
  const creative = await apiCall(account, `act_${account.account_id}/adcreatives`, { method: 'POST', body: creativeBody })
  if (!creative.id) throw new Error('Failed to create creative')
  const adBody = {
    name: name || headline || 'New Ad',
    adset_id: adSetId,
    creative: { creative_id: creative.id },
    status: status || 'PAUSED'
  }
  const data = await apiCall(account, `act_${account.account_id}/ads`, { method: 'POST', body: adBody })
  return { ...data, creative_id: creative.id }
}

async function generatePreview(accountId, { headline, text, link, imageUrl, callToAction, adFormat }) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const pageRes = await apiCall(account, 'me/accounts', { params: { fields: 'id', limit: 1 } })
  const pageId = pageRes.data?.[0]?.id || 'me'
  const creativeSpec = {
    object_story_spec: {
      page_id: pageId,
      link_data: {
        link: link || 'https://dalletek.live',
        message: text || '',
        name: headline || '',
        description: text ? text.substring(0, 100) : '',
        call_to_action: { type: callToAction || 'SIGN_UP', value: { link: link || 'https://dalletek.live' } }
      }
    }
  }
  if (imageUrl) creativeSpec.object_story_spec.link_data.image_url = imageUrl
  const data = await apiCall(account, `act_${account.account_id}/generatepreviews`, {
    params: {
      creative: JSON.stringify(creativeSpec),
      ad_format: adFormat || 'DESKTOP_FEED_STANDARD'
    }
  })
  return data
}

async function getInsights(accountId, campaignId, datePreset) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const fields = 'campaign_name,campaign_id,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions'
  const params = {
    fields,
    date_preset: datePreset || 'last_7d',
    level: 'campaign'
  }
  if (campaignId) params.filtering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campaignId] }])
  const data = await apiCall(account, `act_${account.account_id}/insights`, { params, timeout: 60000 })
  return data.data || []
}

async function getAdFormats() {
  return [
    { value: 'DESKTOP_FEED_STANDARD', label: 'Desktop Feed' },
    { value: 'MOBILE_FEED_STANDARD', label: 'Mobile Feed' },
    { value: 'INSTAGRAM_STANDARD', label: 'Instagram Feed' },
    { value: 'INSTAGRAM_STORY', label: 'Instagram Story' },
    { value: 'FACEBOOK_STORY', label: 'Facebook Story' },
    { value: 'FACEBOOK_REELS', label: 'Facebook Reels' },
    { value: 'INSTAGRAM_REELS', label: 'Instagram Reels' },
    { value: 'RIGHT_HAND_COLUMN', label: 'Right Column' },
    { value: 'MARKETPLACE', label: 'Marketplace' }
  ]
}

async function getPages(accountId) {
  const account = getAdAccount(accountId)
  if (!account) throw new Error('Ad account not found')
  const data = await apiCall(account, 'me/accounts', { params: { fields: 'id,name,picture' } })
  return data.data || []
}

module.exports = {
  getAdAccounts, getAdAccount, connectAccount, disconnectAccount,
  listCampaigns, createCampaign, createAdSet, createAd,
  generatePreview, getInsights, getAdFormats, getPages
}
