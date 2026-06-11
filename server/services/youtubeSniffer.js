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
  let instanceIndex = 0
  const terms = SEARCH_TERMS.slice(0, 8)
  for (const term of terms) {
    const instance = INVIDIOUS_INSTANCES[instanceIndex % INVIDIOUS_INSTANCES.length]
    instanceIndex++
    const leads = await searchInvidious(term, instance)
    for (const lead of leads) {
      try {
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ?").get(lead.source_url)
        if (existing) continue
        db.prepare(`
          INSERT INTO leads (source, source_name, username, content, email, intent_score, language, raw_data, imported_from, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'youtube_sniffer', ?, ?)
        `).run(
          'youtube', lead.source_name, lead.author, lead.content,
          lead.email, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.created_at, lead.created_at
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

module.exports = { sniffYoutube, seedDefaults }
