const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const REDDIT_KEYWORDS = {
  fr: ['iptv', 'm3u', 'abonnement iptv', 'iptv pas cher', 'streaming tv', 'meilleur iptv', 'liste iptv', 'chaines tv'],
  en: ['iptv', 'm3u', 'iptv subscription', 'best iptv', 'iptv provider', 'streaming service', 'tv channels', 'cord cutting'],
  ar: ['iptv', 'اشتراك iptv', 'iptv رخيص', 'قنوات iptv', 'بث'],
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
  return [...new Set(Object.values(REDDIT_KEYWORDS).flat())]
}

function detectLanguage(text) {
  for (const [lang, keywords] of Object.entries(REDDIT_KEYWORDS)) {
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

const USER_AGENT = 'JobTools/1.0 (IPTV lead research)'

const IPTV_SUBREDDITS = [
  'iptv', 'IPTVReviews', 'IPTVsubs', 'm3u8', 'm3u',
  'StreamingServices', 'cordcutters', 'bestiptv', 'iptv_provider',
  'iptvresellers', 'IPTVGroupBuy', 'smarttv', 'androidtv',
  'TiviMate', 'appletv'
]

async function searchReddit(query, subreddit = null) {
  const results = []
  try {
    const subPath = subreddit ? `/r/${subreddit}` : '/r/all'
    const url = `https://www.reddit.com${subPath}/search.json?q=${encodeURIComponent(query)}&restrict_sr=${subreddit ? 1 : 0}&limit=25&sort=new&t=week`
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return results
    const data = await res.json()
    const posts = data?.data?.children || []
    for (const child of posts) {
      const post = child?.data
      if (!post || post.over_18) continue
      const text = (post.title || '') + ' ' + (post.selftext || '')
      if (text.length < 15) continue
      const lowerText = text.toLowerCase()
      let matched = false
      const keywords = getAllKeywords()
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) { matched = true; break }
      }
      if (!matched) continue
      results.push({
        source: 'reddit',
        source_name: post.subreddit,
        author: post.author,
        content: text.substring(0, 2000),
        email: extractEmail(text),
        language: detectLanguage(text),
        title: post.title,
        intent_score: post.score > 5 ? 60 : post.score > 1 ? 50 : 40,
        source_url: `https://reddit.com${post.permalink}`,
        created_at: new Date(post.created_utc * 1000).toISOString()
      })
    }
  } catch (e) {
    console.error(`Reddit search error [${query}]:`, e.message)
  }
  return results
}

async function sniffReddit() {
  const db = getDb()
  const subreddits = db.prepare("SELECT name, query FROM sniffer_sources WHERE platform = 'reddit' AND enabled = 1").all()
  if (subreddits.length === 0) return 0

  let totalLeads = 0
  const searchQueries = getAllKeywords().slice(0, 5)

  // Search r/all with each keyword (one broad pass)
  for (const q of searchQueries) {
    const leads = await searchReddit(q, null)
    for (const lead of leads) {
      try {
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ?").get(lead.source_url)
        if (existing) continue
        const rawWithTimestamp = { ...lead, searched_at: new Date().toISOString() }
        db.prepare(`
          INSERT INTO leads (source, source_name, username, content, email, intent_score, language, raw_data, imported_from, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reddit_sniffer', ?, ?)
        `).run(
          'reddit', lead.source_name, lead.author, lead.content,
          lead.email, lead.intent_score, lead.language,
          JSON.stringify(rawWithTimestamp), lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
    // Delay between searches to avoid rate limit
    await new Promise(r => setTimeout(r, 2000))
  }

  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'reddit')

  return totalLeads
}

async function discoverRedditSources() {
  const db = getDb()
  const existing = db.prepare("SELECT name FROM sniffer_sources WHERE platform = 'reddit'").all().map(r => r.name)
  try {
    const prompt = `Suggest 10 subreddit names (without /r/) related to IPTV, streaming, TV channels, and cord-cutting. Also include subreddits in French, Arabic, Spanish, German. Return ONLY a comma-separated list of subreddit names. Include 'all' as the first option.`
    const result = await generate(prompt, { timeout: 30000, maxTokens: 500 })
    const subs = result.split(',').map(s => s.trim().replace(/^\/?r\//, '')).filter(s => s.length > 0)
    for (const s of subs) {
      if (!existing.includes(s)) {
        try {
          db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('reddit', ?, ?, 1, 'ai_discovery')")
            .run(s, s)
        } catch (e) { /* skip */ }
      }
    }
    return subs.length
  } catch (e) {
    console.error('Reddit source discovery error:', e.message)
    return 0
  }
}

function seedDefaults() {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) as c FROM sniffer_sources WHERE platform = 'reddit'").get().c
  if (existing === 0) {
    for (const sr of IPTV_SUBREDDITS) {
      db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('reddit', ?, ?, 1, 'seed')")
        .run(sr, sr)
    }
  }
}

module.exports = { sniffReddit, discoverRedditSources, seedDefaults }
