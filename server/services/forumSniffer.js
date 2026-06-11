const { getDb } = require('../db')

const FORUM_TARGETS = [
  { url: 'https://www.reddit.com/r/IPTVGroupBuy/search.json?q=looking+for+iptv&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
  { url: 'https://www.reddit.com/r/IPTVReviews/search.json?q=recommend+iptv&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
  { url: 'https://www.reddit.com/r/iptv/search.json?q=best+iptv&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
  { url: 'https://www.reddit.com/r/IPTVsubs/search.json?q=subscription&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
  { url: 'https://www.reddit.com/r/cordcutters/search.json?q=iptv&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
  { url: 'https://www.reddit.com/r/streaming/search.json?q=iptv+recommendation&restrict_sr=1&limit=25&sort=new', type: 'reddit' },
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

async function scrapeReddit(url) {
  const results = []
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return results
    const data = await res.json()
    for (const child of data?.data?.children || []) {
      const post = child?.data
      if (!post || post.over_18) continue
      const text = (post.title || '') + ' ' + (post.selftext || '')
      if (text.length < 20) continue
      const email = extractEmail(text)
      results.push({
        source: 'forum',
        source_name: post.subreddit,
        author: post.author,
        content: text.substring(0, 2000),
        email,
        language: detectLanguage(text),
        title: post.title,
        phone: '',
        intent_score: email ? 85 : 60,
        source_url: `https://reddit.com${post.permalink}`,
        score: post.score,
        num_comments: post.num_comments,
        created_at: new Date(post.created_utc * 1000).toISOString()
      })
    }
  } catch (e) { /* silent */ }
  return results
}

async function sniffForums() {
  const db = getDb()
  let totalLeads = 0
  for (const target of FORUM_TARGETS) {
    const leads = await scrapeReddit(target.url)
    for (const lead of leads) {
      try {
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ?").get(lead.source_url)
        if (existing) continue
        db.prepare(`
          INSERT INTO leads (source, username, content, email, phone, intent_score, language, raw_data, imported_from, source_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'forum_sniffer', ?, ?, ?)
        `).run(
          'forum', lead.author, lead.content,
          lead.email, lead.phone, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.source_url, lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'forum')
  return totalLeads
}

module.exports = { sniffForums }
