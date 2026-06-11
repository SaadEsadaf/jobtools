const { getDb } = require('../db')

const SEARCH_QUERIES = [
  '"best IPTV" email OR contact',
  '"looking for IPTV" "recommend" email',
  '"IPTV subscription" email OR @gmail',
  '"IPTV provider" email OR "contact me"',
  '"IPTV service" email OR "need IPTV"',
  'site:reddit.com "IPTV" "email" "recommend" "best"',
  'site:trustpilot.com IPTV "by" email',
  'site:iptv.community "email" OR "contact"',
  'site:forum.iptv.community "recommend"',
  'site:digitalpoint.com IPTV "email" OR @gmail',
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

async function searchQueryGoogle(query) {
  const results = []
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) { console.log(`Google ${res.status} for ${query}`); return results }
    const html = await res.text()
    const snippets = html.match(/(?:<span[^>]*>)([^<]{30,300})(?:<\/span>)/gi) || []
    for (const snippet of snippets) {
      const text = snippet.replace(/<[^>]+>/g, '').trim()
      if (!text || text.length < 40) continue
      const email = extractEmail(text)
      if (!email) continue
      results.push({
        source: 'web',
        source_name: 'google_search',
        content: text.substring(0, 2000),
        email,
        language: detectLanguage(text),
        phone: '',
        intent_score: 85,
        source_url: '',
      })
    }
    const divTexts = html.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]{50,500})<\/div>/gi) || []
    for (const dt of divTexts) {
      const text = dt.replace(/<[^>]+>/g, '').replace(/&#\d+;/g, '').replace(/&amp;/g, '&').trim()
      if (text.length < 40) continue
      const email = extractEmail(text)
      if (!email) continue
      results.push({
        source: 'web',
        source_name: 'google_search',
        content: text.substring(0, 2000),
        email,
        language: detectLanguage(text),
        phone: '',
        intent_score: 85,
        source_url: '',
      })
    }
  } catch (e) { /* timeout/error - skip */ }
  return results
}

async function searchViaDuckDuckGo(query) {
  const results = []
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return results
    const html = await res.text()
    const blocks = html.match(/class="result__snippet"[^>]*>([\s\S]{30,500})<\/a>/gi) || []
    for (const block of blocks) {
      const text = block.replace(/<[^>]+>/g, '').replace(/&#\d+;/g, '').trim()
      if (text.length < 30) continue
      const email = extractEmail(text)
      if (email) {
        results.push({
          source: 'web', source_name: 'duckduckgo',
          content: text.substring(0, 2000), email,
          language: detectLanguage(text), phone: '',
          intent_score: 85, source_url: ''
        })
      }
    }
  } catch (e) { /* skip */ }
  return results
}

async function findLeads() {
  const db = getDb()
  const searchEngines = [
    () => searchViaDuckDuckGo(SEARCH_QUERIES.join(' OR ')),
    ...SEARCH_QUERIES.slice(0, 5).map(q => () => searchQueryGoogle(q)),
    ...SEARCH_QUERIES.slice(5, 10).map(q => () => searchQueryGoogle(q)),
  ]

  let totalLeads = 0
  const seenEmails = new Set()

  for (let i = 0; i < searchEngines.length; i++) {
    const leads = await searchEngines[i]()
    for (const lead of leads) {
      if (!lead.email || seenEmails.has(lead.email)) continue
      seenEmails.add(lead.email)
      try {
        db.prepare(`
          INSERT OR IGNORE INTO leads (source, source_name, username, content, email, phone, intent_score, language, raw_data, imported_from, source_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead_finder', ?, ?, ?)
        `).run(
          lead.source, lead.source_name, '',
          lead.content, lead.email, lead.phone, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.source_url,
          new Date().toISOString(), new Date().toISOString()
        )
        totalLeads++
      } catch (e) { /* skip dupes */ }
    }
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000))
  }
  return { found: totalLeads, unique_emails: seenEmails.size }
}

module.exports = { findLeads }
