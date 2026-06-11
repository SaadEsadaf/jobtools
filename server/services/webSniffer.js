const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const SEARCH_KEYWORDS = [
  'best iptv', 'iptv recommendation', 'iptv provider', 'iptv service',
  'iptv subscription', 'cheap iptv', 'iptv 4k', 'iptv france',
  'iptv pas cher', 'meilleur iptv', 'abonnement iptv',
  'iptv arabic', 'iptv channels list', 'iptv reddit',
  'iptv trial', 'looking for iptv', 'need iptv',
  'iptv espana', 'iptv brasil', 'iptv deutschland',
  'iptv italia', 'iptv nederland', 'iptv turkey',
  'alternative to iptv', 'iptv not working', 'cord cutting'
]

function detectLanguage(text) {
  if (/[éèêëàâîïôûùçœæ]/i.test(text)) return 'fr'
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[éíóúñ¿¡]/i.test(text)) return 'es'
  if (/[äöüß]/i.test(text)) return 'de'
  if (/[àáâãéêíóôõúç]/i.test(text)) return 'pt'
  if (/[ğüşıöçİ]/i.test(text)) return 'tr'
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl'
  if (/[а-яё]/i.test(text)) return 'ru'
  return 'en'
}

function extractEmail(text) {
  const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
  return match ? match[1].toLowerCase() : ''
}

function extractPhones(text) {
  const patterns = [/\+\d{7,15}/g, /0[1-9]\d{8,10}/g]
  for (const p of patterns) {
    const matches = text.match(p)
    if (matches) return matches[0]
  }
  return ''
}

function getBingApiKey() {
  const db = getDb()
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'social_apis'").get()
  if (!raw) return null
  try {
    const apis = JSON.parse(raw.value)
    return apis.bing?.apiKey || null
  } catch { return null }
}

async function searchBing(query) {
  const apiKey = getBingApiKey()
  if (!apiKey) return []
  const results = []
  try {
    const res = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=15&textFormat=Raw`,
      {
        headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        signal: AbortSignal.timeout(15000)
      }
    )
    if (!res.ok) return results
    const data = await res.json()
    const webPages = data?.webPages?.value || []
    for (const page of webPages) {
      const text = (page.name || '') + ' ' + (page.snippet || '')
      if (text.length < 20) continue
      const lower = text.toLowerCase()
      const kw = SEARCH_KEYWORDS
      const matched = kw.some(k => lower.includes(k.toLowerCase()))
      if (!matched) continue
      results.push({
        source: 'web',
        source_name: 'bing',
        author: page.name ? page.name.split(' - ')[0].trim() : '',
        content: text.substring(0, 2000),
        email: extractEmail(text + (page.snippet || '')),
        phone: extractPhones(text),
        language: detectLanguage(text),
        title: page.name,
        intent_score: 45,
        source_url: page.url,
        snippet: page.snippet,
        created_at: new Date().toISOString()
      })
    }
  } catch (e) {
    console.error(`Bing search error [${query}]:`, e.message)
  }
  return results
}

async function sniffWeb() {
  const db = getDb()
  let totalLeads = 0
  const queries = SEARCH_KEYWORDS.slice(0, 8)
  for (const q of queries) {
    const leads = await searchBing(q)
    for (const lead of leads) {
      try {
        const existing = db.prepare("SELECT id FROM leads WHERE source_url = ?").get(lead.source_url)
        if (existing) continue
        db.prepare(`
          INSERT INTO leads (source, source_name, username, content, email, phone, intent_score, language, raw_data, imported_from, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'web_sniffer', ?, ?)
        `).run(
          'web', lead.source_name, lead.author, lead.content,
          lead.email, lead.phone, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
    await new Promise(r => setTimeout(r, 1500))
  }

  db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ?')
    .run(totalLeads, new Date().toISOString(), 'web')

  return totalLeads
}

function seedDefaults() {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) as c FROM sniffer_sources WHERE platform = 'web'").get().c
  if (existing === 0) {
    const insert = db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('web', ?, ?, 1, 'seed')")
    insert.run('iptv_forum_leads', 'iptv forums and discussions')
    insert.run('iptv_blog_leads', 'iptv blog articles and reviews')
    insert.run('iptv_social_leads', 'iptv social media discussions')
  }
}

module.exports = { sniffWeb, seedDefaults }
