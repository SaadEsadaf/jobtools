const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const TWITTER_KEYWORDS = {
  fr: ['iptv', 'm3u', 'abonnement iptv', 'iptv pas cher', 'streaming tv', 'meilleur iptv'],
  en: ['iptv', 'm3u', 'iptv subscription', 'best iptv', 'iptv provider', 'streaming service'],
  ar: ['iptv', 'اشتراك iptv', 'iptv رخيص', 'قنوات iptv'],
  es: ['iptv', 'lista m3u', 'iptv barato', 'mejor iptv', 'canales tv'],
  de: ['iptv', 'm3u liste', 'iptv günstig', 'bester iptv', 'tv sender'],
  nl: ['iptv', 'm3u lijst', 'iptv goedkoop', 'beste iptv', 'tv kanalen'],
  it: ['iptv', 'lista m3u', 'iptv economico', 'miglior iptv', 'canali tv'],
  pt: ['iptv', 'lista m3u', 'iptv barato', 'melhor iptv', 'canais tv'],
  tr: ['iptv', 'm3u listesi', 'iptv ucuz', 'en iyi iptv', 'tv kanalları'],
  pl: ['iptv', 'lista m3u', 'iptv tani', 'najlepszy iptv', 'kanaly tv'],
  ru: ['iptv', 'm3u список', 'iptv дешево', 'лучший iptv', 'телеканалы']
}

function getAllKeywords() {
  return [...new Set(Object.values(TWITTER_KEYWORDS).flat())]
}

function detectLanguage(text) {
  for (const [lang, keywords] of Object.entries(TWITTER_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.toLowerCase().includes(kw)) return lang
    }
  }
  return 'en'
}

function extractEmail(text) {
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
  return match ? match[1].toLowerCase() : ''
}

function extractPhone(text) {
  const patterns = [/\+\d{7,15}/g, /0[1-9]\d{8,10}/g, /\d{9,12}/g]
  for (const p of patterns) {
    const matches = text.match(p)
    if (matches) return matches[0]
  }
  return ''
}

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.lacontrevoie.fr',
  'https://nitter.1d4.us',
  'https://nitter.kavin.rocks',
  'https://nitter.pussthecat.org',
  'https://twitter.skrep.eu'
]

async function searchNitter(query, instance) {
  const results = []
  try {
    const url = `${instance}/search?q=${encodeURIComponent(query)}&f=tweets`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return results
    const html = await res.text()

    const tweetBlocks = html.match(/<div class="timeline-item"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || []
    for (const block of tweetBlocks) {
      const textMatch = block.match(/<div class="tweet-content[^>]*>([\s\S]*?)<\/div>/)
      if (!textMatch) continue
      const text = textMatch[1].replace(/<[^>]+>/g, '').trim()
      if (!text || text.length < 10) continue

      const lowerText = text.toLowerCase()
      let matched = false
      const keywords = getAllKeywords()
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) { matched = true; break }
      }
      if (!matched) continue

      const authorMatch = block.match(/<a class="username"[^>]*>@?([^<]+)<\/a>/)
      const author = authorMatch ? authorMatch[1].trim() : ''

      const linkMatch = block.match(/<a href="([^"]+)" class="tweet-link"/)
      const tweetUrl = linkMatch ? `https://nitter.net${linkMatch[1]}` : ''

      results.push({
        source: 'twitter',
        source_name: 'nitter',
        author,
        content: text.substring(0, 2000),
        email: extractEmail(text),
        phone: extractPhone(text),
        language: detectLanguage(text),
        intent_score: 50,
        source_url: tweetUrl,
        created_at: new Date().toISOString()
      })
    }
  } catch (e) {
    // silent
  }
  return results
}

async function sniffTwitter() {
  const db = getDb()
  const queries = db.prepare("SELECT name, query FROM sniffer_sources WHERE platform = 'twitter' AND enabled = 1").all()
  if (queries.length === 0) return 0

  const keywords = getAllKeywords()
  const searchQueries = keywords.map(k => k)

  let totalLeads = 0
  let instanceIndex = 0

  for (const sq of searchQueries.slice(0, 5)) {
    const instance = NITTER_INSTANCES[instanceIndex % NITTER_INSTANCES.length]
    instanceIndex++

    const results = await searchNitter(sq, instance)
    for (const lead of results) {
      try {
        db.prepare(`
          INSERT INTO leads (source, source_name, username, content, email, phone, intent_score, language, raw_data, imported_from, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'twitter_sniffer', ?, ?)
        `).run(
          'twitter', lead.source_name, lead.author, lead.content,
          lead.email, lead.phone, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
  }

  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'twitter')

  return totalLeads
}

async function discoverTwitterSources() {
  const db = getDb()
  const existing = db.prepare("SELECT name FROM sniffer_sources WHERE platform = 'twitter'").all().map(r => r.name)

  try {
    const prompt = `Suggest 15 Twitter search queries (keywords or phrases) related to IPTV, streaming, cord-cutting, or TV channel needs. Cover these languages: English, French, Arabic, Spanish, German, Dutch, Italian, Portuguese, Turkish. Return ONLY a comma-separated list of search queries.`
    const result = await generate(prompt, { timeout: 30000, maxTokens: 500 })
    const queries = result.split(',').map(q => q.trim()).filter(q => q.length > 0)

    for (const q of queries) {
      if (!existing.includes(q)) {
        try {
          db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('twitter', ?, ?, 1, 'ai_discovery')")
            .run(q, q)
        } catch (e) { /* skip */ }
      }
    }
    return queries.length
  } catch (e) {
    console.error('Twitter source discovery error:', e.message)
    return 0
  }
}

const DEFAULT_QUERIES = [
  'iptv', 'best iptv', 'iptv subscription', 'iptv provider',
  'iptv france', 'iptv pas cher', 'iptv espana', 'iptv brasil',
  'iptv deutschland', 'iptv italia', 'iptv nederland',
  'iptv arabic', 'iptv turkey', 'iptv poland',
  'iptv m3u', 'iptv trial', 'iptv channels',
  'iptv service', 'streaming iptv', 'cord cutting iptv'
]

function seedDefaults() {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) as c FROM sniffer_sources WHERE platform = 'twitter'").get().c
  if (existing === 0) {
    for (const q of DEFAULT_QUERIES) {
      db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('twitter', ?, ?, 1, 'seed')")
        .run(q, q)
    }
  }
}

module.exports = { sniffTwitter, discoverTwitterSources, seedDefaults }
