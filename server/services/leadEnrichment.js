const { getDb } = require('../db')
const { generate } = require('./aiProvider')

async function enrichLead(lead) {
  let enriched = false

  if (!lead.email && lead.content) {
    const emailMatch = lead.content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
    if (emailMatch) {
      lead.email = emailMatch[1].toLowerCase()
      enriched = true
    }
  }

  if (!lead.phone && lead.content) {
    const patterns = [/\+\d{7,15}/g, /0[1-9]\d{8,10}/g, /\d{9,12}/g]
    for (const p of patterns) {
      const matches = lead.content.match(p)
      if (matches) { lead.phone = matches[0]; enriched = true; break }
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
      // AI enrichment failed, use defaults
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
    SELECT * FROM leads WHERE (intent_score = 0 OR intent_score IS NULL) AND content IS NOT NULL AND content != ''
    ORDER BY created_at ASC LIMIT ?
  `).all(limit)

  let enriched = 0
  for (const lead of stale) {
    try {
      const { lead: enrichedLead } = await enrichLead(lead)
      db.prepare(`
        UPDATE leads SET email = ?, phone = ?, pain_point = ?, opportunity = ?, intent_score = ?, language = ?, updated_at = ?
        WHERE id = ?
      `).run(
        enrichedLead.email || '', enrichedLead.phone || '',
        enrichedLead.pain_point || '', enrichedLead.opportunity || '',
        enrichedLead.intent_score || 40, enrichedLead.language || 'en',
        new Date().toISOString(), lead.id
      )
      enriched++
    } catch (e) { /* skip */ }
  }
  return enriched
}

module.exports = { enrichLead, enrichStaleLeads }
