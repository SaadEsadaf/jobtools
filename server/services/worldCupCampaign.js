const { getDb } = require('../db');
const { validateAndScore } = require('./emailValidator');

const IPTV_BOSS_URL = process.env.IPTV_BOSS_URL || 'http://localhost:3001';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || 'jobtools-bridge-key-2024';

async function validateLeads() {
  const db = getDb();
  const leads = db.prepare(`
    SELECT l.*, 
      CASE 
        WHEN l.source LIKE '%dns%' THEN 'dns_harvester'
        WHEN l.source LIKE '%leak%' OR l.source LIKE '%iptv-list%' THEN 'iptv_list_leak'
        WHEN l.source LIKE '%paste%' THEN 'pastebin'
        WHEN l.source LIKE '%youtube%' THEN 'youtube'
        ELSE 'other'
      END as source_type
    FROM leads l 
    WHERE l.email IS NOT NULL AND l.email != ''
      AND (l.intent_score IS NULL OR (
        SELECT COUNT(*) FROM leads l2 WHERE l2.email = l.email AND l2.intent_score IS NOT NULL
      ) = 0)
    ORDER BY l.id
  `).all();

  const results = { total: leads.length, validated: 0, byPriority: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, failed: 0 };

  // Get existing validation to avoid rework
  const validatedSet = new Set(
    db.prepare("SELECT email FROM leads WHERE intent_score IS NOT NULL AND intent_score > 0 AND email IS NOT NULL AND email != ''")
      .all().map(r => r.email.toLowerCase())
  );

  for (const lead of leads) {
    if (validatedSet.has(lead.email.toLowerCase())) continue;

    const validated = await validateAndScore(lead.email, lead.source_type || 'other', { domain: lead.source_name || '' });
    results.validated++;

    db.prepare(`UPDATE leads SET intent_score = ?, intent_label = ?, notes = COALESCE(NULLIF(notes, ''), ?) 
      WHERE id = ?`).run(
      validated.score,
      'P' + validated.priority + '_' + (validated.valid ? 'VALID' : 'INVALID'),
      validated.reasons.join(', ') + (validated.mx_valid ? ', mx_ok' : ', no_mx'),
      lead.id
    );

    if (validated.valid) {
      const p = validated.priority;
      if (results.byPriority[p] !== undefined) results.byPriority[p]++;
    } else {
      results.failed++;
    }

    // Small delay to avoid hammering DNS
    await new Promise(r => setTimeout(r, 100));
  }

  results.validated_count = db.prepare("SELECT COUNT(*) as c FROM leads WHERE intent_score IS NOT NULL AND intent_score > 0").get().c;
  return results;
}

async function getTopLeads(limit = 20, minPriority = 3) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM leads 
    WHERE email IS NOT NULL AND email != ''
      AND intent_score IS NOT NULL AND intent_score > 0
      AND (notes IS NULL OR notes NOT LIKE '%no_mx%')
    ORDER BY intent_score DESC, id ASC
    LIMIT ?
  `).all(limit);
}

async function syncToIptvBoss(leads) {
  if (!leads || leads.length === 0) return { synced: 0 };

  try {
    const resp = await fetch(`${IPTV_BOSS_URL}/api/brain/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'jobtools',
        api_key: BRIDGE_API_KEY,
        event: 'leads_sync',
        payload: {
          leads: leads.map(l => ({
            email: l.email,
            name: l.name || l.first_name || l.username || l.email.split('@')[0],
            phone: l.phone || '',
            source: l.source_type || l.source || 'jobtools',
            language: l.language || 'fr',
            intent_score: l.intent_score || 50,
            content: l.content || l.notes || '',
            campaign_name: 'worldcup_2026',
          })),
        },
      }),
    });
    const data = await resp.json();
    return { synced: data.received ? leads.length : 0 };
  } catch (e) {
    console.error('[WorldCupCampaign] Sync to IPTV Boss failed:', e.message);
    return { synced: 0, error: e.message };
  }
}

async function sendWorldCupCampaign(leads) {
  if (!leads || leads.length === 0) return { sent: 0 };

  const db = getDb();
  const siteUrl = 'https://dalletek.live';
  const trackingBase = `${siteUrl}/api/tracking`;

  let sent = 0;
  for (const lead of leads) {
    const email = lead.email;
    const name = lead.name || lead.first_name || lead.email.split('@')[0];
    const campaignId = 'worldcup_2026';

    // Get available trial code for this lead
    let trialCode = null;
    try {
      const iptvDb = require('../db2');
      // We can't directly query IPTV Boss DB from here, skip trial assignment for now
    } catch (e) {}

    const trackingPixel = `${trackingBase}/pixel.gif?campaign=${encodeURIComponent(campaignId)}&email=${encodeURIComponent(email)}&t=${Date.now()}`;
    const trialUrl = `${siteUrl}/trial?code=CLAIM&email=${encodeURIComponent(email)}&utm_source=email&utm_medium=worldcup&utm_campaign=${campaignId}`;
    const clickUrl = `${trackingBase}/click?campaign=${encodeURIComponent(campaignId)}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(trialUrl)}`;
    const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}`;

    try {
      const resp = await fetch(`${IPTV_BOSS_URL}/api/campaigns/blast-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          template_key: 'worldcup_2026',
          campaign_name: campaignId,
          variables: {
            customer_name: name,
            customer_email: email,
            site_name: 'Dalletek',
            site_url: siteUrl,
            trial_url: trialUrl,
            trial_code: 'CLAIM',
            tracking_pixel: trackingPixel,
            unsubscribe_url: unsubscribeUrl,
          },
        }),
      });
      const data = await resp.json();
      if (data.sent) {
        sent++;
        db.prepare("UPDATE leads SET status = 'contacted', notes = COALESCE(NULLIF(notes, ''), '') || ' | worldcup_campaign_sent' WHERE id = ?").run(lead.id);
      }
    } catch (e) {
      console.error(`[WorldCupCampaign] Failed to send to ${email}:`, e.message);
    }

    // Rate limit: 20/hr = 1 per 3 minutes
    await new Promise(r => setTimeout(r, 3000));
  }

  return { sent };
}

async function runCampaign() {
  console.log('[WorldCupCampaign] Starting validation...');
  const validation = await validateLeads();
  console.log(`[WorldCupCampaign] Validated: ${validation.validated} total, P1:${validation.byPriority[1]}, P2:${validation.byPriority[2]}, failed: ${validation.failed}`);

  const topLeads = await getTopLeads(20, 3);
  console.log(`[WorldCupCampaign] Top leads: ${topLeads.length}`);

  const sync = await syncToIptvBoss(topLeads);
  console.log(`[WorldCupCampaign] Synced to IPTV Boss: ${sync.synced}`);

  const send = await sendWorldCupCampaign(topLeads.slice(0, 9));
  console.log(`[WorldCupCampaign] World Cup emails sent: ${send.sent}`);

  return {
    validated: validation.validated,
    byPriority: validation.byPriority,
    topLeads: topLeads.length,
    synced: sync.synced,
    sent: send.sent,
  };
}

module.exports = { validateLeads, getTopLeads, syncToIptvBoss, sendWorldCupCampaign, runCampaign };
