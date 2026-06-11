const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.private.coffee',
  'https://invidious.protokolla.fi',
  'https://inv.zzls.xyz'
]

const SEARCH_TERMS = [
  'iptv', 'iptv review', 'iptv subscription', 'best iptv',
  'iptv france', 'iptv pas cher', 'iptv espana',
  'iptv deutschland', 'iptv arabic', 'iptv setup',
  'iptv m3u', 'iptv 4k', 'iptv channels',
  'cord cutting', 'streaming tv', 'iptv trial'
]

function extractEmail(text) {
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
  return match ? match[1].toLowerCase() : ''
}

function detectLanguage(text) {
  if (/[éèêëàâîïôûùçœæ]/i.test(text)) return 'fr'
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[éíóúñ¿¡]/i.test(text)) return 'es'
  if (/[äöüß]/i.test(text)) return 'de'
  return 'en'
}

function getApiKey() {
  const db = getDb()
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'social_apis'").get()
  if (!raw) return null
  try {
    const apis = JSON.parse(raw.value)
    return apis.youtube?.apiKey || null
  } catch { return null }
}

async function searchYoutubeAPI(query, apiKey) {
  const results = []
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=15&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return results
    const data = await res.json()
    if (data.error) return results
    for (const item of data.items || []) {
      const snippet = item.snippet || {}
      const text = ((snippet.title || '') + ' ' + (snippet.description || '')).trim()
      if (text.length < 15) continue
      results.push({
        source: 'youtube',
        source_name: 'youtube_api',
        author: snippet.channelTitle || '',
        content: text.substring(0, 2000),
        email: extractEmail(text),
        language: detectLanguage(text),
        title: snippet.title,
        intent_score: 50,
        source_url: `https://youtube.com/watch?v=${item.id?.videoId || ''}`,
        video_id: item.id?.videoId,
        created_at: snippet.publishedAt || new Date().toISOString()
      })
    }
  } catch (e) { /* silent */ }
  return results
}

async function searchInvidious(query, instance) {
  const results = []
  try {
    const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&limit=15`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return results
    const data = await res.json()
    for (const video of data) {
      if (!video?.title) continue
      const text = video.title + ' ' + (video.description || '')
      if (text.length < 15) continue
      const lower = text.toLowerCase()
      if (!SEARCH_TERMS.some(t => lower.includes(t))) continue
      results.push({
        source: 'youtube',
        source_name: instance.replace('https://', ''),
        author: video.author || '',
        content: text.substring(0, 2000),
        email: extractEmail(text),
        language: detectLanguage(text),
        title: video.title,
        intent_score: video.viewCount > 10000 ? 60 : video.viewCount > 1000 ? 50 : 40,
        source_url: `${instance}/watch?v=${video.videoId}`,
        video_id: video.videoId,
        created_at: video.published ? new Date(video.published * 1000).toISOString() : new Date().toISOString()
      })
    }
  } catch (e) { /* silent */ }
  return results
}

async function sniffYoutube() {
  const db = getDb()
  let totalLeads = 0
  const terms = SEARCH_TERMS.slice(0, 8)
  const apiKey = getApiKey()

  for (const term of terms) {
    let leads = []
    if (apiKey) {
      leads = await searchYoutubeAPI(term, apiKey)
    }
    if (leads.length === 0) {
      const instance = INVIDIOUS_INSTANCES[Math.floor(Math.random() * INVIDIOUS_INSTANCES.length)]
      leads = await searchInvidious(term, instance)
    }
    for (const lead of leads) {
      try {
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ?").get(lead.source_url)
        if (existing) continue
        db.prepare(`
          INSERT INTO leads (source, username, content, email, intent_score, language, raw_data, imported_from, source_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'youtube_sniffer', ?, ?, ?)
        `).run(
          'youtube', lead.author, lead.content,
          lead.email, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.source_url, lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'youtube')
  return totalLeads
}

function seedDefaults() {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) as c FROM sniffer_sources WHERE platform = 'youtube'").get().c
  if (existing === 0) {
    const insert = db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('youtube', ?, ?, 1, 'seed')")
    insert.run('iptv_search', 'iptv')
    insert.run('iptv_reviews', 'iptv review')
    insert.run('iptv_tutorial', 'iptv setup tutorial')
  }
}

async function fetchVideoComments(videoId, apiKey) {
  const comments = []
  try {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return comments
    const data = await res.json()
    if (data.error) return comments
    for (const item of data.items || []) {
      const snippet = item.snippet?.topLevelComment?.snippet || {}
      const text = (snippet.textDisplay || '').trim()
      if (text.length < 10) continue
      comments.push({
        author: snippet.authorDisplayName || '',
        text,
        email: extractEmail(text),
        publishedAt: snippet.publishedAt || new Date().toISOString()
      })
    }
  } catch (e) { /* silent */ }
  return comments
}

async function sniffYoutubeComments() {
  const db = getDb()
  const apiKey = getApiKey()
  if (!apiKey) return 0

  let totalLeads = 0
  const seenEmails = new Set()

  for (const term of SEARCH_TERMS.slice(0, 5)) {
    const videos = await searchYoutubeAPI(term + ' comments', apiKey)
    for (const video of videos) {
      if (!video.video_id) continue
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000))
      const comments = await fetchVideoComments(video.video_id, apiKey)
      for (const comment of comments) {
        if (!comment.email && comment.text.length < 60) continue
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ? AND username = ?")
          .get(`yt_comment:${video.video_id}`, comment.author)
        if (existing) continue
        const email = comment.email || ''
        if (email) {
          if (seenEmails.has(email)) continue
          seenEmails.add(email)
        }
        try {
          db.prepare(`
            INSERT INTO leads (source, username, content, email, intent_score, language, raw_data, imported_from, source_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'youtube_comments', ?, ?, ?)
          `).run(
            'youtube_comment', comment.author,
            comment.text.substring(0, 2000), email,
            email ? 85 : 50, detectLanguage(comment.text),
            JSON.stringify(comment),
            `yt_comment:${video.video_id}`,
            comment.publishedAt, comment.publishedAt
          )
          totalLeads++
        } catch (e) { /* skip */ }
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'youtube_comments')
  return totalLeads
}

module.exports = { sniffYoutube, sniffYoutubeComments, seedDefaults }
