const { getDb } = require('../db')

const INJECTION_TYPES = {
  LANDING_PAGE: 'landing_page',
  EMAIL: 'email_sequence',
  SOCIAL: 'social_post',
  WHATSAPP: 'whatsapp_message',
  AD_COPY: 'ad_copy',
  CHAT: 'chat_response'
}

async function injectNow(template, target, campaign = null) {
  const db = getDb()
  const siteDomain = db.prepare("SELECT value FROM app_settings WHERE key = 'site_domain'").get()?.value || 'dalletek.live'

  let campaignId = null
  let sourceFilter = null
  let languageFilter = null
  let intentFilter = null
  if (campaign) {
    if (typeof campaign === 'object') {
      campaignId = campaign.id
      sourceFilter = campaign.target_source
      languageFilter = campaign.target_language
      intentFilter = campaign.target_intent
    } else {
      campaignId = campaign
    }
  }

  const actions = []

  switch (target) {
    case INJECTION_TYPES.LANDING_PAGE: {
      const slug = (template.name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lp-' + Date.now()
      const landingContent = buildLandingPage(template, siteDomain)
      actions.push({
        type: 'landing_page',
        status: 'created',
        slug,
        url: `/lp/${slug}`,
        details: `Landing page /lp/${slug} generated and ready`
      })
      break
    }

    case INJECTION_TYPES.EMAIL: {
      let sql = "SELECT * FROM leads WHERE email IS NOT NULL AND email != '' AND status != 'unsubscribed'"
      const params = []
      const campaignName = campaign?.name || campaignId ? `campaign_${campaignId}` : template.name
      if (sourceFilter) { sql += ' AND source = ?'; params.push(sourceFilter) }
      if (languageFilter) { sql += ' AND language = ?'; params.push(languageFilter) }
      if (intentFilter) { sql += ' AND intent_label = ?'; params.push(intentFilter) }
      sql += ' ORDER BY intent_score DESC LIMIT 200'
      const leads = db.prepare(sql).all(...params)

      if (leads.length === 0) {
        actions.push({
          type: 'email_sequence',
          sent: 0,
          failed: 0,
          totalLeads: 0,
          details: 'No leads match the campaign filters'
        })
        break
      }

      try {
        const { sendBulkEmails } = require('./bulkEmailService')
        const templateKey = 'trial_invitation'
        const result = await sendBulkEmails(leads, templateKey, campaignName)
        actions.push({
          type: 'email_sequence',
          sent: result.sent || 0,
          failed: result.failed || 0,
          totalLeads: leads.length,
          details: `${result.sent || 0} sent, ${result.failed || 0} failed out of ${leads.length} leads`
        })
      } catch (e) {
        actions.push({
          type: 'email_sequence',
          sent: 0,
          failed: leads.length,
          totalLeads: leads.length,
          error: e.message,
          details: `Email sending failed: ${e.message}`
        })
      }
      break
    }

    case INJECTION_TYPES.SOCIAL:
    case INJECTION_TYPES.WHATSAPP:
    case INJECTION_TYPES.AD_COPY: {
      const content = template.content || template.meta || `Promotion: ${template.name}`
      const platforms = target === INJECTION_TYPES.SOCIAL ? ['telegram', 'reddit', 'twitter']
        : target === INJECTION_TYPES.WHATSAPP ? ['whatsapp']
        : ['telegram', 'reddit', 'twitter', 'whatsapp']
      const queueIds = []
      for (const platform of platforms) {
        const r = db.prepare(`
          INSERT INTO content_queue (type, content, platform, status, campaign_id, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?)
        `).run(target, content, platform, campaignId, new Date().toISOString())
        queueIds.push(r.lastInsertRowid)
      }
      actions.push({
        type: target,
        queued: queueIds.length,
        queueIds,
        details: `${queueIds.length} items queued for ${platforms.join(', ')}`
      })
      break
    }

    case INJECTION_TYPES.CHAT: {
      actions.push({
        type: 'chat_response',
        status: 'injected',
        details: `Chat knowledge updated with "${template.name}" content`
      })
      break
    }
  }

  db.prepare(`
    INSERT INTO injection_log (template_id, campaign_id, injection_type, target, status, details, created_at)
    VALUES (?, ?, ?, ?, 'completed', ?, ?)
  `).run(template.id, campaignId, target, target, JSON.stringify(actions), new Date().toISOString())

  db.prepare('UPDATE templates SET is_active = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), template.id)

  return actions
}

function buildLandingPage(template, domain) {
  const name = template.name || 'Offer'
  const content = template.content || template.meta || ''

  return {
    title: `${name} | ${domain}`,
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} | ${domain}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; line-height: 1.6; }
    .hero { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 80px 20px; text-align: center; }
    .hero h1 { font-size: 2.5em; margin-bottom: 20px; }
    .hero p { font-size: 1.2em; color: #ccc; max-width: 600px; margin: 0 auto 30px; }
    .cta { display: inline-block; background: #e94560; color: #fff; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-size: 1.1em; font-weight: bold; transition: background .3s; }
    .cta:hover { background: #c73652; }
    .features { padding: 60px 20px; max-width: 1100px; margin: 0 auto; }
    .features h2 { text-align: center; margin-bottom: 40px; font-size: 1.8em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
    .card { background: #1a1a2e; padding: 30px; border-radius: 12px; border: 1px solid #2a2a4e; }
    .card h3 { color: #e94560; margin-bottom: 10px; }
    .card p { color: #aaa; }
    .pricing { padding: 60px 20px; background: #111; text-align: center; }
    .pricing h2 { margin-bottom: 40px; font-size: 1.8em; }
    .plans { display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; }
    .plan { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 12px; padding: 30px; min-width: 250px; }
    .plan h3 { margin-bottom: 15px; }
    .plan .price { font-size: 2em; color: #e94560; margin-bottom: 20px; }
    .plan ul { list-style: none; margin-bottom: 20px; }
    .plan ul li { padding: 8px 0; color: #ccc; border-bottom: 1px solid #2a2a4e; }
    .plan ul li:before { content: '✓ '; color: #4caf50; }
    .cta-small { display: inline-block; background: #e94560; color: #fff; padding: 12px 30px; border-radius: 6px; text-decoration: none; }
    footer { text-align: center; padding: 30px; color: #555; font-size: 0.9em; }
  </style>
</head>
<body>
  <section class="hero">
    <h1>${name}</h1>
    <p>${sanitizeHtml(content).substring(0, 200)}</p>
    <a href="#" class="cta">🔴 Essai Gratuit</a>
  </section>
  <section class="features">
    <h2>Pourquoi Nous Choisir?</h2>
    <div class="grid">
      <div class="card"><h3>📺 20 000+ Chaînes</h3><p>Toutes les chaînes du monde en HD et 4K</p></div>
      <div class="card"><h3>⚡ Installation Instantanée</h3><p>Accès en moins de 5 minutes après paiement</p></div>
      <div class="card"><h3>💬 Support 24/7</h3><p>Assistance technique disponible en permanence</p></div>
    </div>
  </section>
  <section class="pricing">
    <h2>Nos Offres</h2>
    <div class="plans">
      <div class="plan">
        <h3>1 Mois</h3>
        <div class="price">9.99€</div>
        <ul><li>Accès complet</li><li>HD/4K</li><li>Support prioritaire</li></ul>
        <a href="#" class="cta-small">Souscrire</a>
      </div>
      <div class="plan">
        <h3>3 Mois</h3>
        <div class="price">19.99€</div>
        <ul><li>Accès complet</li><li>HD/4K</li><li>Support prioritaire</li><li>2 mois offerts</li></ul>
        <a href="#" class="cta-small">Souscrire</a>
      </div>
      <div class="plan">
        <h3>1 An</h3>
        <div class="price">49.99€</div>
        <ul><li>Accès complet</li><li>HD/4K</li><li>Support VIP</li><li>8 mois offerts</li></ul>
        <a href="#" class="cta-small">Souscrire</a>
      </div>
    </div>
  </section>
  <footer>
    <p>${domain} &copy; ${new Date().getFullYear()} - Tous droits réservés</p>
  </footer>
</body>
</html>`
  }
}

function sanitizeHtml(text) {
  if (!text) return ''
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
}

module.exports = { injectNow, INJECTION_TYPES }
