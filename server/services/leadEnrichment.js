const { getDb } = require('../db')
const { generate } = require('./aiProvider')

const EMAIL_RE = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g
const PHONE_RE = /\+\d{7,15}/g
const LOCAL_PHONE_RE = /0[1-9]\d{8,10}/g

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

  if ((!lead.pain_point || !lead.opportunity || !lead.intent_score || lead.intent_score === 0) && lead.content) {
    try {
      const aiResult = await generate(
        `Analyze this message from a potential IPTV customer and extract:
1. pain_point: what problem are they trying to solve?
2. opportunity: how can an IPTV service help them?
3. intent_score: number from 0-100 indicating how ready to buy they are
4. language: detected language code (en/fr/ar/es/de/nl/it/pt/tr/pl/ru)

Message: "${lead.content.substring(0, 1000)}"

Return ONLY valid JSON: {"pain_point": "...", "opportunity": "...", "intent_score": 0-100, "language": "xx"}`,
        { timeout: 15000, maxTokens: 300 }
      )
      const parsed = JSON.parse(aiResult)
      if (parsed.pain_point) { lead.pain_point = parsed.pain_point; enriched = true }
      if (parsed.opportunity) { lead.opportunity = parsed.opportunity; enriched = true }
      if (typeof parsed.intent_score === 'number') { lead.intent_score = Math.min(100, Math.max(0, parsed.intent_score)); enriched = true }
      if (parsed.language) { lead.language = parsed.language; enriched = true }
    } catch (e) {
      if (!lead.intent_score || lead.intent_score === 0) {
        lead.intent_score = 40
        enriched = true
      }
    }
  }

  if (!lead.intent_score || lead.intent_score === 0) {
    lead.intent_score = 40
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
        UPDATE leads SET email = ?, phone = ?, pain_point = ?, opportunity = ?, intent_score = ?, language = ?, updated_at = ?
        WHERE id = ?
      `).run(
        enrichedLead.email || null, enrichedLead.phone || null,
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
    WHERE email IS NULL AND (raw_data LIKE '%@%' OR content LIKE '%@%')
    LIMIT ?
  `).all(limit)

  let extracted = 0
  const insertStmt = db.prepare("UPDATE leads SET email = ?, updated_at = ? WHERE id = ? AND (email IS NULL OR email = '')")

  for (const lead of candidates) {
    const textToSearch = [lead.content, lead.raw_data, lead.username].filter(Boolean).join(' ')
    const emails = extractEmails(textToSearch)
    if (emails.length === 0) continue
    try {
      const result = insertStmt.run(emails[0], new Date().toISOString(), lead.id)
      if (result.changes > 0) extracted++
    } catch (e) { /* duplicate skipped by UNIQUE index */ }
  }
  return { scanned: candidates.length, extracted }
}

module.exports = { enrichLead, enrichStaleLeads, extractAllFromRawData, extractEmails, extractPhones }