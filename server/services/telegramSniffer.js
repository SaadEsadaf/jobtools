const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const TELEGRAM_KEYWORDS = {
  fr: ['iptv', 'm3u', 'liste iptv', 'abonnement iptv', 'iptv pas cher', 'streaming', 'chaines tv', 'sport streaming'],
  en: ['iptv', 'm3u', 'iptv subscription', 'best iptv', 'iptv provider', 'streaming service', 'tv channels'],
  ar: ['iptv', 'اشتراك iptv', 'قنوات', 'بث مباشر', 'iptv رخيص'],
  es: ['iptv', 'lista m3u', 'iptv barato', 'canales tv', 'streaming deportes'],
  de: ['iptv', 'm3u liste', 'iptv günstig', 'sender liste', 'tv streaming'],
  nl: ['iptv', 'm3u lijst', 'iptv goedkoop', 'tv kanalen', 'streaming sport'],
  it: ['iptv', 'lista m3u', 'iptv economico', 'canali tv', 'streaming sport'],
  pt: ['iptv', 'lista m3u', 'iptv barato', 'canais tv', 'streaming esportes'],
  tr: ['iptv', 'm3u listesi', 'iptv ucuz', 'tv kanalları', 'canlı yayın'],
  pl: ['iptv', 'lista m3u', 'iptv tani', 'kanaly telewizyjne', 'streaming sport'],
  ru: ['iptv', 'm3u список', 'iptv дешево', 'телеканалы', 'спортивный стриминг']
}

function getAllKeywords() {
  return [...new Set(Object.values(TELEGRAM_KEYWORDS).flat())]
}

function detectLanguage(text) {
  for (const [lang, keywords] of Object.entries(TELEGRAM_KEYWORDS)) {
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
  const patterns = [
    /\+\d{7,15}/g,
    /0[1-9]\d{8,10}/g,
    /\d{9,12}/g
  ]
  for (const p of patterns) {
    const matches = text.match(p)
    if (matches) return matches[0]
  }
  return ''
}

async function sniffTelegramChannel(channel, keywords) {
  const results = []
  try {
    const url = `https://t.me/s/${channel}?before=100`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return results
    const html = await res.text()
    const messages = html.match(/<div class="tgme_widget_message_wrap[^>]*>([\s\S]*?)<\/div><\/div><\/div>/g) || []
    for (const msgHtml of messages) {
      const textMatch = msgHtml.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)
      if (!textMatch) continue
      const text = textMatch[1].replace(/<[^>]+>/g, '').trim()
      if (!text || text.length < 10) continue

      const lowerText = text.toLowerCase()
      let matched = false
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) { matched = true; break }
      }
      if (!matched) continue

      const authorMatch = msgHtml.match(/<a class="tgme_widget_message_owner_name"[^>]*>([\s\S]*?)<\/a>/)
      const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : ''

      results.push({
        source: 'telegram',
        source_name: channel,
        author,
        content: text.substring(0, 2000),
        email: extractEmail(text),
        phone: extractPhone(text),
        language: detectLanguage(text),
        intent_score: 50,
        source_url: `https://t.me/s/${channel}`,
        created_at: new Date().toISOString()
      })
    }
  } catch (e) {
    console.error(`Telegram sniffer error for ${channel}:`, e.message)
  }
  return results
}

async function sniffTelegram() {
  const db = getDb()
  const channels = db.prepare("SELECT name FROM sniffer_sources WHERE platform = 'telegram' AND enabled = 1").all().map(r => r.name)
  if (channels.length === 0) return 0

  const keywords = getAllKeywords()
  let totalLeads = 0

  for (const channel of channels) {
    const leads = await sniffTelegramChannel(channel, keywords)
    for (const lead of leads) {
      try {
        db.prepare(`
          INSERT INTO leads (source, source_name, username, content, email, phone, intent_score, language, raw_data, imported_from, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram_sniffer', ?, ?)
        `).run(
          'telegram', lead.source_name, lead.author, lead.content,
          lead.email, lead.phone, lead.intent_score, lead.language,
          JSON.stringify(lead), lead.created_at, lead.created_at
        )
        totalLeads++
      } catch (e) { /* skip */ }
    }
    db.prepare('UPDATE sniffer_sources SET lead_count = lead_count + ?, sniff_count = sniff_count + 1, last_sniffed = ? WHERE platform = ? AND name = ?')
      .run(leads.length, new Date().toISOString(), 'telegram', channel)
  }

  return totalLeads
}

async function discoverTelegramSources() {
  const db = getDb()
  const existing = db.prepare("SELECT name FROM sniffer_sources WHERE platform = 'telegram'").all().map(r => r.name)

  try {
    const prompt = `Suggest 10 public Telegram channels (usernames only, no @) related to IPTV, streaming, TV channels, or cord-cutting in these languages: English, French, Arabic, Spanish, German, Dutch, Italian, Portuguese, Turkish. Return ONLY a comma-separated list of channel usernames. Do not include @ symbol.`
    const result = await generate(prompt, { timeout: 30000, maxTokens: 500 })
    const channels = result.split(',').map(c => c.trim().replace(/^@/, '')).filter(c => c.length > 0)

    for (const ch of channels) {
      if (!existing.includes(ch)) {
        try {
          db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('telegram', ?, ?, 1, 'ai_discovery')")
            .run(ch, ch)
        } catch (e) { /* skip */ }
      }
    }
    return channels.length
  } catch (e) {
    console.error('Telegram source discovery error:', e.message)
    return 0
  }
}

const DEFAULT_CHANNELS = [
  'iptvchat', 'iptvcommunity', 'iptv_providers', 'iptv_deutschland',
  'iptv_espanol', 'iptvbrasil', 'iptv_india', 'arabic_iptv',
  'iptv_france', 'iptv_italia', 'iptv_nederlands', 'iptv_turkey',
  'iptv_poland', 'iptv_russia', 'iptv_portugal', 'iptv_dutch',
  'iptv_free', 'iptvtest', 'iptv_trial', 'iptv_cordcutters',
  'smart_iptv', 'iptv_smarters', 'tivimate', 'xtream_iptv'
]

function seedDefaults() {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) as c FROM sniffer_sources WHERE platform = 'telegram'").get().c
  if (existing === 0) {
    for (const ch of DEFAULT_CHANNELS) {
      db.prepare("INSERT OR IGNORE INTO sniffer_sources (platform, name, query, enabled, discovered_by) VALUES ('telegram', ?, ?, 1, 'seed')")
        .run(ch, ch)
    }
  }
}

module.exports = { sniffTelegram, discoverTelegramSources, seedDefaults }
