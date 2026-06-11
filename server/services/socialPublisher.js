const { getDb } = require('../db')

function loadSocialApis() {
  const db = getDb()
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'social_apis'").get()
  if (!raw) return getDefaults()
  try { return JSON.parse(raw.value) } catch { return getDefaults() }
}

function saveSocialApis(apis) {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('social_apis', ?)").run(JSON.stringify(apis))
}

function getDefaults() {
  return {
    youtube: { enabled: false, apiKey: '', clientId: '', clientSecret: '', channelId: '', refreshToken: '' },
    reddit: { enabled: false, clientId: '', clientSecret: '', username: '', password: '', userAgent: 'JobTools/1.0' },
    facebook: { enabled: false, appId: '', appSecret: '', pageId: '', pageAccessToken: '', accessToken: '' },
    bing: { enabled: false, apiKey: '' }
  }
}

async function postToReddit(action, params) {
  const apis = loadSocialApis()
  const reddit = apis.reddit
  if (!reddit.enabled || !reddit.clientId) throw new Error('Reddit API not configured')

  const auth = Buffer.from(`${reddit.clientId}:${reddit.clientSecret}`).toString('base64')

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': reddit.userAgent || 'JobTools/1.0'
    },
    body: `grant_type=password&username=${encodeURIComponent(reddit.username)}&password=${encodeURIComponent(reddit.password)}`,
    signal: AbortSignal.timeout(15000)
  })
  if (!tokenRes.ok) throw new Error(`Reddit auth failed: ${await tokenRes.text()}`)
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token

  if (action === 'comment') {
    const { postId, text } = params
    if (!postId || !text) throw new Error('postId and text required for comment')

    const res = await fetch(`https://oauth.reddit.com/api/comment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': reddit.userAgent || 'JobTools/1.0'
      },
      body: `thing_id=${encodeURIComponent(postId)}&text=${encodeURIComponent(text)}`,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Reddit comment failed: ${await res.text()}`)
    return await res.json()
  }

  if (action === 'post') {
    const { subreddit, title, text, kind = 'self' } = params
    if (!subreddit || !title) throw new Error('subreddit and title required for post')

    const body = `sr=${encodeURIComponent(subreddit)}&title=${encodeURIComponent(title)}&kind=${kind}&text=${encodeURIComponent(text || '')}`
    const res = await fetch(`https://oauth.reddit.com/api/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': reddit.userAgent || 'JobTools/1.0'
      },
      body,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Reddit post failed: ${await res.text()}`)
    return await res.json()
  }

  if (action === 'dm') {
    const { username, subject, text } = params
    if (!username || !subject || !text) throw new Error('username, subject, text required for DM')

    const res = await fetch(`https://oauth.reddit.com/api/compose`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': reddit.userAgent || 'JobTools/1.0'
      },
      body: `to=${encodeURIComponent(username)}&subject=${encodeURIComponent(subject)}&text=${encodeURIComponent(text)}`,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Reddit DM failed: ${await res.text()}`)
    return await res.json()
  }

  throw new Error(`Unknown Reddit action: ${action}`)
}

async function postToFacebook(action, params) {
  const apis = loadSocialApis()
  const fb = apis.facebook
  if (!fb.enabled || !fb.pageAccessToken) throw new Error('Facebook API not configured')

  if (action === 'post') {
    const { message, link } = params
    if (!message) throw new Error('message required')

    let url = `https://graph.facebook.com/v19.0/${fb.pageId || 'me'}/feed`
    let body = `message=${encodeURIComponent(message)}&access_token=${fb.pageAccessToken}`
    if (link) body += `&link=${encodeURIComponent(link)}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Facebook post failed: ${await res.text()}`)
    return await res.json()
  }

  if (action === 'photo') {
    const { message, imageUrl } = params
    if (!imageUrl) throw new Error('imageUrl required')

    const url = `https://graph.facebook.com/v19.0/${fb.pageId || 'me'}/photos`
    const body = `url=${encodeURIComponent(imageUrl)}&message=${encodeURIComponent(message || '')}&access_token=${fb.pageAccessToken}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Facebook photo failed: ${await res.text()}`)
    return await res.json()
  }

  throw new Error(`Unknown Facebook action: ${action}`)
}

async function postToYoutube(action, params) {
  const apis = loadSocialApis()
  const yt = apis.youtube
  if (!yt.enabled || !yt.apiKey) throw new Error('YouTube API not configured')

  if (action === 'comment') {
    const { videoId, text } = params
    if (!videoId || !text) throw new Error('videoId and text required')

    const res = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&key=${yt.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          videoId,
          topLevelComment: { snippet: { textOriginal: text } }
        }
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`YouTube comment failed: ${await res.text()}`)
    return await res.json()
  }

  if (action === 'reply') {
    const { parentId, text } = params
    if (!parentId || !text) throw new Error('parentId and text required')

    const res = await fetch(`https://www.googleapis.com/youtube/v3/comments?part=snippet&key=${yt.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          parentId,
          textOriginal: text
        }
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`YouTube reply failed: ${await res.text()}`)
    return await res.json()
  }

  if (action === 'search') {
    const { query, maxResults = 10 } = params
    if (!query) throw new Error('query required')

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${yt.apiKey}`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`YouTube search failed: ${await res.text()}`)
    return await res.json()
  }

  throw new Error(`Unknown YouTube action: ${action}`)
}

async function searchBing(query) {
  const apis = loadSocialApis()
  const bing = apis.bing
  if (!bing.enabled || !bing.apiKey) throw new Error('Bing API not configured')

  const res = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=10`,
    {
      headers: { 'Ocp-Apim-Subscription-Key': bing.apiKey },
      signal: AbortSignal.timeout(15000)
    }
  )
  if (!res.ok) throw new Error(`Bing search failed: ${await res.text()}`)
  return await res.json()
}

module.exports = { loadSocialApis, saveSocialApis, postToReddit, postToFacebook, postToYoutube, searchBing, getDefaults }
