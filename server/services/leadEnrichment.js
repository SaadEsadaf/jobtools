const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const EMAIL_RE = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g
const PHONE_RE = /\+\d{7,15}/g
const LOCAL_PHONE_RE = /0[1-9]\d{8,10}/g

const SOCIAL_PATTERNS = [
  { re: /t\.me\/([a-zA-Z0-9_]{5,})/gi, type: 'telegram' },
  { re: /@([a-zA-Z0-9_]{5,})/g, type: 'telegram_handle' },
  { re: /wa\.me\/(\d+)/gi, type: 'whatsapp' },
  { re: /wa\.link\/[a-zA-Z0-9]+/gi, type: 'whatsapp' },
  { re: /discord\.gg\/([a-zA-Z0-9]+)/gi, type: 'discord' },
  { re: /discord\.com\/invite\/([a-zA-Z0-9]+)/gi, type: 'discord' },
  { re: /instagram\.com\/([a-zA-Z0-9_.]+)/gi, type: 'instagram' },
  { re: /facebook\.com\/([a-zA-Z0-9.]+)/gi, type: 'facebook' },
  { re: /youtube\.com\/@([a-zA-Z0-9_]+)/gi, type: 'youtube' },
  { re: /reddit\.com\/r\/([a-zA-Z0-9_]+)/gi, type: 'reddit' },
]

const INTENT_KEYWORDS = {
  high: [
    'subscribe', 'buy', 'abonne', 'acheter', 'purchase', 'order', 'commander',
    'price', 'prix', 'how much', 'combien', 'cost', 'coût', 'tarif',
    'trial', 'essai', 'test', 'demo', 'free', 'gratuit',
    'looking for', 'cherche', 'je cherche', 'recommend', 'recommande',
    'provider', 'fournisseur', 'premium', 'vip',
    'quality', 'qualité', 'stable', 'buffer', 'buffering',
    'hd', '4k', 'fhd', 'ultra', 'canal', 'channel',
    'instant', 'immediat', 'setup', 'configuration',
    'reseller', 'revendeur', 'wholesale', 'gros',
    'bouquet', 'france', 'français', 'maroc', 'algerie', 'tunisie',
  ],
  medium: [
    'iptv', 'm3u', 'playlist', 'xtream', 'portal', 'mac address',
    'mag', 'stb', 'smart tv', 'android tv', 'firestick', 'fire stick',
    'tivimate', 'ott navigator', 'smarters', 'ssiptv',
    'foot', 'sport', 'match', 'live', 'direct',
    'movie', 'film', 'série', 'series', 'vod',
    'app', 'application', 'install', 'installer',
    'service', 'server', 'serveur',
    'fr', 'eng', 'arabic', 'english', 'francais', 'espagnol',
    'channel list', 'liste', 'bouquet',
    'adult', 'xxx',
  ],
  low: [
    'hello', 'bonjour', 'hi', 'salut', 'thank', 'merci', 'plz', 'please',
    'help', 'aide', 'sos', 'urgent', 'problem', 'probleme',
    'not working', 'ne marche pas', 'error', 'erreur', 'bug',
    'want', 'veux', 'vais', 'peux', 'pouvez', 'possible',
    'info', 'information', 'plus', 'more',
  ],
}

const LANGUAGE_KEYWORDS = {
  fr: ['bonjour', 'salut', 'merci', 'svp', 'stp', 'je', 'tu', 'nous', 'vous', 'français', 'france', 'abonnement', 'abonne', 'acheter', 'combien', 'prix', 'qualité', 'canal', 'bouquet', 'revendeur', 'gratuit', 'essai', 'cherche', 'immediat', 'configuration', 'maroc', 'algerie', 'tunisie'],
  ar: ['مرحبا', 'شكرا', 'الرجاء', 'iptv', 'قنوات', 'اشتراك', 'سعر', 'جودة', 'تجربة', 'مشاهدة', 'بث', 'مباشر', 'عربية', 'arabic'],
  es: ['hola', 'gracias', 'por favor', 'quiero', 'precio', 'canales', 'calidad', 'prueba', 'gratis', 'español', 'compra', 'suscripción', 'fútbol', 'deportes'],
  de: ['hallo', 'danke', 'bitte', 'preis', 'kanäle', 'qualität', 'testen', 'kostenlos', 'deutsch', 'abonnement', 'kaufen', 'sport', 'filme'],
  nl: ['hallo', 'dank', 'prijs', 'kanalen', 'kwaliteit', 'gratis', 'proef', 'nederlands', 'abonnement', 'kopen', 'sport'],
  it: ['ciao', 'grazie', 'prezzo', 'canali', 'qualità', 'prova', 'gratis', 'italiano', 'abbonamento', 'acquistare', 'calcio', 'sport'],
  pt: ['olá', 'obrigado', 'preço', 'canais', 'qualidade', 'teste', 'grátis', 'português', 'assinatura', 'comprar', 'futebol', 'esporte'],
  tr: ['merhaba', 'teşekkür', 'fiyat', 'kanallar', 'kalite', 'deneme', 'ücretsiz', 'türkçe', 'abonelik', 'satın', 'spor'],
  pl: ['cześć', 'dziękuję', 'cena', 'kanały', 'jakość', 'test', 'darmowy', 'polski', 'subskrypcja', 'kupić', 'sport'],
  ru: ['здравствуйте', 'спасибо', 'цена', 'каналы', 'качество', 'тест', 'бесплатно', 'русский', 'подписка', 'купить', 'спорт'],
}

function extractEmails(text) {
  if (!text) return []
  const matches = [...text.matchAll(EMAIL_RE)]
  return [...new Set(matches.map(m => m[1].toLowerCase().trim()))]
}

function extractPhones(text) {
  if (!text) return []
  const matches = [...text.matchAll(PHONE_RE)]
  if (matches.length > 0) return [...new Set(matches.map(m => m[0]))]
  const localMatches = [...text.matchAll(LOCAL_PHONE_RE)]
  return [...new Set(localMatches.map(m => m[0]))]
}

function extractSocialHandles(text) {
  if (!text) return []
  const found = []
  for (const pattern of SOCIAL_PATTERNS) {
    const matches = [...text.matchAll(pattern.re)]
    for (const m of matches) {
      const value = m[m.length - 1] || m[0]
      if (value && value.length >= 3 && value.length <= 100) {
        found.push({ type: pattern.type, value })
      }
    }
  }
  return found
}

function calculateIntentScore(content) {
  if (!content || content.length < 5) return 30

  const lower = content.toLowerCase()
  let highMatches = 0
  let mediumMatches = 0
  let lowMatches = 0

  for (const kw of INTENT_KEYWORDS.high) {
    if (lower.includes(kw)) highMatches++
  }
  for (const kw of INTENT_KEYWORDS.medium) {
    if (lower.includes(kw)) mediumMatches++
  }
  for (const kw of INTENT_KEYWORDS.low) {
    if (lower.includes(kw)) lowMatches++
  }

  const baseScore = Math.min(
    (highMatches * 25) + (mediumMatches * 10) + (lowMatches * 2),
    95
  )

  const lengthBonus = Math.min(content.length / 200, 1) * 5
  const questionMark = lower.includes('?') ? 5 : 0

  return Math.min(99, Math.max(10, Math.round(baseScore + lengthBonus + questionMark)))
}

function detectLanguage(content) {
  if (!content) return 'en'
  const lower = content.toLowerCase()
  let bestLang = 'en'
  let bestScore = 0

  for (const [lang, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.length * 2
    }
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }

  return bestLang
}

function detectSourceType(rawData) {
  if (!rawData) return 'web'
  const str = typeof rawData === 'string' ? rawData : JSON.stringify(rawData)
  const lower = str.toLowerCase()
  if (lower.includes('youtube') || lower.includes('youtube')) return 'youtube'
  if (lower.includes('telegram') || lower.includes('t.me')) return 'telegram'
  if (lower.includes('reddit') || lower.includes('reddit')) return 'reddit'
  if (lower.includes('twitter') || lower.includes('x.com')) return 'twitter'
  if (lower.includes('facebook') || lower.includes('fb.com')) return 'facebook'
  if (lower.includes('whatsapp') || lower.includes('wa.me')) return 'whatsapp'
  if (lower.includes('dns_harvester') || lower.includes('soa') || lower.includes('dmarc')) return 'dns'
  if (lower.includes('csv') || lower.includes('json')) return 'import'
  return 'web'
}

async function enrichLead(lead) {
  let enriched = false
  const textToSearch = [lead.content, lead.raw_data, lead.username, lead.first_name, lead.last_name].filter(Boolean).join(' ')

  if (!lead.email && textToSearch) {
    const emails = extractEmails(textToSearch)
    if (emails.length > 0) {
      lead.email = emails[0]
      enriched = true
    }
  }

  if (!lead.phone && textToSearch) {
    const phones = extractPhones(textToSearch)
    if (phones.length > 0) {
      lead.phone = phones[0]
      enriched = true
    }
  }

  const sourceType = detectSourceType(lead.raw_data)
  if (!lead.source && sourceType !== 'web') {
    lead.source = sourceType
    enriched = true
  }

  if (!lead.intent_score || lead.intent_score === 0) {
    lead.intent_score = calculateIntentScore(textToSearch)
    enriched = true
  }

  if (!lead.language || lead.language === 'en') {
    const detected = detectLanguage(textToSearch)
    if (detected !== 'en') {
      lead.language = detected
      enriched = true
    }
  }

  if (!lead.pain_point || !lead.opportunity) {
    if (lead.content && lead.content.length > 30) {
      const lower = lead.content.toLowerCase()
      if (lower.includes('quality') || lower.includes('buffering') || lower.includes('stable')) {
        lead.pain_point = 'Looking for stable, high-quality IPTV without buffering'
        enriched = true
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('cher') || lower.includes('expensive')) {
        lead.pain_point = 'Looking for affordable IPTV pricing options'
        enriched = true
      } else if (lower.includes('channel') || lower.includes('canal') || lower.includes('sport') || lower.includes('foot')) {
        lead.pain_point = 'Looking for specific channel/sports content'
        enriched = true
      } else if (lower.includes('trial') || lower.includes('essai') || lower.includes('test')) {
        lead.pain_point = 'Testing options before committing to a subscription'
        enriched = true
      } else if (lower.includes('reseller') || lower.includes('revendeur') || lower.includes('wholesale')) {
        lead.pain_point = 'Looking for reseller/wholesale IPTV partnership'
        enriched = true
      }

      if (!lead.opportunity) {
        const intent = lead.intent_score || 40
        if (intent >= 70) {
          lead.opportunity = 'High-intent prospect ready for conversion - offer trial or quick purchase'
        } else if (intent >= 40) {
          lead.opportunity = 'Interested prospect - provide information and follow up with offer'
        } else {
          lead.opportunity = 'Early-stage prospect - nurture with educational content'
        }
        enriched = true
      }
    }
  }

  if (!lead.pain_point) {
    lead.pain_point = 'General IPTV interest'
    enriched = true
  }
  if (!lead.opportunity) {
    lead.opportunity = 'Potential customer - needs qualification'
    enriched = true
  }

  return { lead, enriched }
}

async function enrichStaleLeads(limit = 20) {
  const db = getDb()
  const stale = db.prepare(`
    SELECT * FROM leads WHERE email IS NULL AND (content IS NOT NULL AND content != '' OR raw_data IS NOT NULL AND raw_data != '')
    ORDER BY created_at ASC LIMIT ?
  `).all(limit)

  let enriched = 0
  for (const lead of stale) {
    try {
      const { lead: enrichedLead } = await enrichLead(lead)
      if (!enrichedLead.email && !enrichedLead.phone && !enrichedLead.intent_score) continue
      db.prepare(`
        UPDATE leads SET email = ?, phone = ?, source = ?, pain_point = ?, opportunity = ?, intent_score = ?, language = ?, updated_at = ?
        WHERE id = ?
      `).run(
        enrichedLead.email || null, enrichedLead.phone || null, enrichedLead.source || null,
        enrichedLead.pain_point || '', enrichedLead.opportunity || '',
        enrichedLead.intent_score || 40, enrichedLead.language || 'en',
        new Date().toISOString(), lead.id
      )
      enriched++
    } catch (e) { /* skip */ }
  }
  return enriched
}

async function extractAllFromRawData(limit = 500) {
  const db = getDb()
  const candidates = db.prepare(`
    SELECT id, raw_data, content, username FROM leads
    WHERE (email IS NULL OR phone IS NULL) AND (raw_data LIKE '%@%' OR content LIKE '%@%' OR raw_data != '' OR content != '')
    LIMIT ?
  `).all(limit)

  let emailExtracted = 0
  let phoneExtracted = 0
  const updateStmt = db.prepare("UPDATE leads SET email = ?, phone = ?, updated_at = ? WHERE id = ? AND (email IS NULL OR email = '')")

  for (const lead of candidates) {
    const textToSearch = [lead.content, lead.raw_data, lead.username].filter(Boolean).join(' ')
    try {
      const emails = extractEmails(textToSearch)
      const phones = extractPhones(textToSearch)
      const socials = extractSocialHandles(textToSearch)
      if (emails.length > 0) {
        const result = updateStmt.run(emails[0], phones[0] || null, new Date().toISOString(), lead.id)
        if (result.changes > 0) emailExtracted++
      }
      if (phones.length > 0 && !emails.length) {
        const result = updateStmt.run(null, phones[0], new Date().toISOString(), lead.id)
        if (result.changes > 0) phoneExtracted++
      }
    } catch (e) { /* skip */ }
  }
  return { scanned: candidates.length, emailExtracted, phoneExtracted }
}

async function deepEnrichAll(limit = 100) {
  const db = getDb()
  const candidates = db.prepare(`
    SELECT * FROM leads WHERE (intent_score IS NULL OR intent_score = 0 OR language IS NULL OR source IS NULL)
    ORDER BY created_at ASC LIMIT ?
  `).all(limit)

  let updated = 0
  for (const lead of candidates) {
    try {
      const { lead: enrichedLead, enriched } = await enrichLead(lead)
      if (!enriched) continue
      db.prepare(`
        UPDATE leads SET intent_score = ?, language = ?, source = ?, pain_point = ?, opportunity = ?, updated_at = ?
        WHERE id = ?
      `).run(
        enrichedLead.intent_score || 40, enrichedLead.language || 'en', enrichedLead.source || null,
        enrichedLead.pain_point || '', enrichedLead.opportunity || '',
        new Date().toISOString(), lead.id
      )
      updated++
    } catch (e) { /* skip */ }
  }
  return updated
}

module.exports = { enrichLead, enrichStaleLeads, extractAllFromRawData, deepEnrichAll, extractEmails, extractPhones, extractSocialHandles, calculateIntentScore, detectLanguage, detectSourceType }
