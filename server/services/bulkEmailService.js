const { getDb } = require('../db');

const IPTV_BOSS_URL = process.env.IPTV_BOSS_URL || 'http://localhost:3001';

const TEMPLATES = {
  trial: {
    template_key: 'trial_invitation',
    subject: '🎁 Your Free IPTV Trial is Waiting — Watch World Cup 2026 in 4K',
    body_html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
<div style="background:linear-gradient(135deg,#1a1a3e,#0d2818);padding:32px 20px;text-align:center;border-bottom:3px solid #ffd700;">
<h1 style="color:#ffd700;font-size:24px;margin:0;">🏆 Watch the World Cup 2026</h1>
<p style="color:#a0d0ff;font-size:14px;margin:8px 0 0;">72h Free Trial — All 64 Matches Live in 4K</p>
</div>
<div style="background:#1a1a1a;padding:32px 24px;border-radius:8px;margin:16px;">
<p style="color:#e0e0e0;font-size:15px;line-height:1.7;">Hi {{customer_name}},</p>
<p style="color:#b0b0b0;font-size:14px;line-height:1.7;">The World Cup 2026 is here and we want you to experience every match live in stunning 4K quality — completely free.</p>
<ul style="color:#b0b0b0;font-size:13px;line-height:2;padding-left:20px;">
<li>All 64 matches live</li>
<li>Multi-language commentary (FR, EN, AR, ES)</li>
<li>Works on Firestick, Android, iOS, Smart TV</li>
<li>179,915 channels + VOD</li>
</ul>
<div style="text-align:center;margin:28px 0;">
<a href="{{claim_url}}" style="display:inline-block;background:linear-gradient(135deg,#ffd700,#ff8c00);color:#000;text-decoration:none;padding:16px 40px;border-radius:50px;font-weight:800;font-size:16px;">🎁 CLAIM MY FREE TRIAL</a>
<p style="color:#888;font-size:12px;margin-top:10px;">No credit card required • Limited codes available</p>
</div>
</div>
<div style="text-align:center;padding:20px;color:#555;font-size:12px;">
<p>{{site_name}} — <a href="{{unsubscribe_url}}" style="color:#555;">Unsubscribe</a></p>
</div>
<img src="{{tracking_pixel}}" width="1" height="1" style="display:none;" />
</div></body></html>`,
    variables: ['customer_name', 'customer_email', 'site_name', 'site_url', 'claim_url', 'tracking_pixel', 'unsubscribe_url']
  },
  site_invite: {
    template_key: 'site_invitation',
    subject: 'Discover Premium IPTV — 179,915 Channels Starting at €9.99',
    body_html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
<div style="background:linear-gradient(135deg,#0d2818,#1a1a3e);padding:32px 20px;text-align:center;">
<h1 style="color:#00d4ff;font-size:24px;margin:0;">📺 Premium IPTV Access</h1>
<p style="color:#a0d0ff;font-size:14px;margin:8px 0 0;">179,915 channels • 4K • All devices</p>
</div>
<div style="background:#1a1a1a;padding:32px 24px;border-radius:8px;margin:16px;">
<p style="color:#e0e0e0;font-size:15px;line-height:1.7;">Hi {{customer_name}},</p>
<p style="color:#b0b0b0;font-size:14px;line-height:1.7;">We offer the largest IPTV library available — all your favorite channels, sports, movies, and series at unbeatable prices.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#0f0f0f;border-radius:8px;">
<tr><td style="padding:12px;border-bottom:1px solid #1a1a1a;"><span style="color:#fff;">Premium 1 Month</span></td><td style="padding:12px;text-align:right;color:#00d4ff;">€14.99</td></tr>
<tr><td style="padding:12px;border-bottom:1px solid #1a1a1a;"><span style="color:#fff;">Premium 3 Months</span></td><td style="padding:12px;text-align:right;color:#00d4ff;">€29.99</td></tr>
<tr><td style="padding:12px;"><span style="color:#fff;">Annual 12 Months</span></td><td style="padding:12px;text-align:right;color:#ffd700;">€69.99</td></tr>
</table>
<div style="text-align:center;margin:28px 0;">
<a href="{{site_url}}" style="display:inline-block;background:#00d4ff;color:#000;text-decoration:none;padding:16px 40px;border-radius:50px;font-weight:800;font-size:16px;">🛒 VISIT OUR STORE</a>
</div>
</div>
<div style="text-align:center;padding:20px;color:#555;font-size:12px;">
<p>{{site_name}} — <a href="{{unsubscribe_url}}" style="color:#555;">Unsubscribe</a></p>
</div>
<img src="{{tracking_pixel}}" width="1" height="1" style="display:none;" />
</div></body></html>`,
    variables: ['customer_name', 'customer_email', 'site_name', 'site_url', 'tracking_pixel', 'unsubscribe_url']
  },
  event: {
    template_key: 'special_event',
    subject: '{{event_name}} — Special IPTV Access Just for You',
    body_html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
<div style="background:linear-gradient(135deg,#2a0a2a,#1a0a2a);padding:32px 20px;text-align:center;border-bottom:3px solid {{event_color}};">
<h1 style="color:{{event_color}};font-size:24px;margin:0;">{{event_emoji}} {{event_name}}</h1>
<p style="color:#a0a0ff;font-size:14px;margin:8px 0 0;">{{event_subtitle}}</p>
</div>
<div style="background:#1a1a1a;padding:32px 24px;border-radius:8px;margin:16px;">
<p style="color:#e0e0e0;font-size:15px;line-height:1.7;">Hi {{customer_name}},</p>
<p style="color:#b0b0b0;font-size:14px;line-height:1.7;">{{event_message}}</p>
<div style="background:#0f0f0f;border-radius:8px;padding:16px;margin:16px 0;">
{{#if event_details}}
<p style="color:#a0a0a0;font-size:13px;margin:0;">{{event_details}}</p>
{{/if}}
</div>
<div style="text-align:center;margin:28px 0;">
<a href="{{claim_url}}" style="display:inline-block;background:{{event_color}};color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-weight:800;font-size:16px;">{{event_cta}}</a>
</div>
</div>
<div style="text-align:center;padding:20px;color:#555;font-size:12px;">
<p>{{site_name}} — <a href="{{unsubscribe_url}}" style="color:#555;">Unsubscribe</a></p>
</div>
<img src="{{tracking_pixel}}" width="1" height="1" style="display:none;" />
</div></body></html>`,
    variables: ['customer_name', 'customer_email', 'site_name', 'site_url', 'claim_url', 'tracking_pixel', 'unsubscribe_url', 'event_name', 'event_subtitle', 'event_message', 'event_details', 'event_color', 'event_emoji', 'event_cta']
  }
};

const BATCH_SIZES = [50, 100, 150, 200, 300, 400, 500];

async function getLeadsForBatch(batchSize, priority = 0) {
  const db = getDb();
  const prioFilter = priority > 0 ? "AND intent_score >= " + (priority === 1 ? 60 : priority === 2 ? 45 : priority === 3 ? 30 : 15) : "";
  return db.prepare(`
    SELECT * FROM leads 
    WHERE email IS NOT NULL AND email != ''
      AND intent_score IS NOT NULL AND intent_score > 0
      AND (notes IS NULL OR (notes NOT LIKE '%no_mx%' AND notes NOT LIKE '%invalid%' AND notes NOT LIKE '%disposable%'))
      AND (status IS NULL OR status NOT IN ('contacted', 'unsubscribed'))
    ${prioFilter}
    ORDER BY intent_score DESC, id ASC
    LIMIT ?
  `).all(batchSize);
}

async function sendBulkEmails(leads, templateKey, campaignName = 'bulk_campaign', variables = {}) {
  if (!leads || leads.length === 0) return { sent: 0, total: 0 };

  const db = getDb();
  const siteUrl = 'https://dalletek.live';
  const trackingBase = `${siteUrl}/api/tracking`;

  // Rate limit: 20/hr = 1 every 3 min or batch faster
  // For now send with 3s delay between each
  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const email = lead.email;
    const name = lead.name || lead.first_name || lead.email.split('@')[0];

    const trackingPixel = `${trackingBase}/pixel.gif?campaign=${encodeURIComponent(campaignName)}&email=${encodeURIComponent(email)}&t=${Date.now()}`;
    const claimUrl = `${siteUrl}/trial?email=${encodeURIComponent(email)}&utm_source=email&utm_medium=${encodeURIComponent(campaignName)}`;
    const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}`;

    try {
      const resp = await fetch(`${IPTV_BOSS_URL}/api/campaigns/blast-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          template_key: templateKey,
          campaign_name: campaignName,
          variables: {
            customer_name: name,
            customer_email: email,
            site_name: 'Dalletek',
            site_url: siteUrl,
            claim_url: claimUrl,
            trial_code: '',
            tracking_pixel: trackingPixel,
            unsubscribe_url: unsubscribeUrl,
            ...variables,
          },
        }),
      });
      const data = await resp.json();
      if (data.sent) {
        sent++;
        db.prepare("UPDATE leads SET status = 'contacted', notes = COALESCE(NULLIF(notes, ''), '') || ' | " + campaignName + "_sent' WHERE id = ?").run(lead.id);
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.error(`[BulkEmail] Failed to ${email}:`, e.message);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  return { sent, failed, total: leads.length };
}

async function createTemplateInIPTVBoss(templateKey, name, subject, bodyHtml, variables) {
  try {
    const resp = await fetch(`${IPTV_BOSS_URL}/api/campaigns/templates/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_key: templateKey, name, subject, body_html: bodyHtml, variables: JSON.stringify(variables) })
    });
    const data = await resp.json();
    return data;
  } catch (e) {
    console.error(`[BulkEmail] Template create failed:`, e.message);
    return { error: e.message };
  }
}

async function ensureTemplates() {
  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    await createTemplateInIPTVBoss(tpl.template_key, tpl.subject, tpl.subject, tpl.body_html, tpl.variables);
  }
}

module.exports = { getLeadsForBatch, sendBulkEmails, ensureTemplates, TEMPLATES, BATCH_SIZES };
