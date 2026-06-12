const { getDb } = require('../db');
const { sendMail } = require('./marketingMailer');
const { sendViaSendGrid, getSendGridLimit } = require('./sendgridService');

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

function getDailyCount() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`sent_count_${today}`);
  return parseInt(row?.value || '0');
}

function incrementDailyCount() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const key = `sent_count_${today}`;
  const current = getDailyCount();
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(key, String(current + 1));
}

function getBrevoLimit() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'brevo_daily_limit'").get();
  return parseInt(row?.value || '300');
}

function getCombinedDailyLimit() {
  return getBrevoLimit() + getSendGridLimit();
}

function getReservedQuota() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'reserved_quota'").get();
  return parseInt(row?.value || '10');
}

function getCampaignQuota() {
  return Math.max(0, getCombinedDailyLimit() - getReservedQuota());
}

function addTrackingToHtml(html, campaignName, email, siteUrl) {
  const trackingBase = `${siteUrl}/api/tracking`;
  const trackingPixel = `${trackingBase}/pixel.gif?campaign=${encodeURIComponent(campaignName)}&email=${encodeURIComponent(email)}&t=${Date.now()}`;
  const trackedHtml = html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gi, (match, before, url, after) => {
    if (url.includes('/unsubscribe') || url.includes('unsubscribe_url') || url.indexOf('http') !== 0) return match;
    const clickUrl = `${trackingBase}/click?campaign=${encodeURIComponent(campaignName)}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(url)}`;
    return `<a ${before}href="${clickUrl}"${after}>`;
  });
  return trackedHtml + `<img src="${trackingPixel}" width="1" height="1" style="display:none;" />`;
}

async function sendEmailFallback(lead, subject, html, campaignName) {
  const db = getDb();
  const email = lead.email;
  const name = lead.name || lead.first_name || lead.email.split('@')[0];
  const siteUrl = 'https://dalletek.live';

  // Generate tracking URLs
  const trackingBase = `${siteUrl}/api/tracking`;
  const trackingPixel = `${trackingBase}/pixel.gif?campaign=${encodeURIComponent(campaignName)}&email=${encodeURIComponent(email)}&t=${Date.now()}`;
  const claimUrl = `${trackingBase}/click?campaign=${encodeURIComponent(campaignName)}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(siteUrl + '/trial?email=' + encodeURIComponent(email) + '&utm_source=email&utm_medium=' + encodeURIComponent(campaignName))}`;
  const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}`;

  // Build tracking-enriched HTML for fallback paths
  const htmlWithTracking = addTrackingToHtml(html, campaignName, email, siteUrl);

  // Try IPTV-Boss bridge first
  try {
    const resp = await fetch(`${IPTV_BOSS_URL}/api/campaigns/blast-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name,
        template_key: 'trial_invitation',
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
        },
      }),
    });
    const data = await resp.json();
    if (data.sent) {
      incrementDailyCount();
      db.prepare("UPDATE leads SET status = 'contacted', notes = COALESCE(NULLIF(notes, ''), '') || ' | " + campaignName + "_sent' WHERE id = ?").run(lead.id);
      return true;
    }
  } catch (e) {
    // IPTV-Boss bridge failed — fall through to direct SMTP
  }

  // Fallback 1: send directly via SMTP
  try {
    await sendMail(email, subject, htmlWithTracking);
    incrementDailyCount();
    db.prepare("UPDATE leads SET status = 'contacted', notes = COALESCE(NULLIF(notes, ''), '') || ' | " + campaignName + "_sent_direct' WHERE id = ?").run(lead.id);
    return true;
  } catch (e) {
    console.error(`[BulkEmail] Direct SMTP failed for ${email}:`, e.message);
  }

  // Fallback 2: send via SendGrid API
  try {
    await sendViaSendGrid(email, name, subject, htmlWithTracking);
    incrementDailyCount();
    db.prepare("UPDATE leads SET status = 'contacted', notes = COALESCE(NULLIF(notes, ''), '') || ' | " + campaignName + "_sent_sendgrid' WHERE id = ?").run(lead.id);
    return true;
  } catch (e) {
    console.error(`[BulkEmail] SendGrid failed for ${email}:`, e.message);
    return false;
  }
}

async function sendBulkEmails(leads, templateKey, campaignName = 'bulk_campaign', variables = {}) {
  if (!leads || leads.length === 0) return { sent: 0, total: 0 };

  const db = getDb();
  const dailyLimit = getCampaignQuota();
  const sentToday = getDailyCount();
  const remaining = Math.max(0, dailyLimit - sentToday);
  const maxToSend = Math.min(leads.length, remaining);

  if (maxToSend === 0) {
    return { sent: 0, failed: leads.length, total: leads.length, dailyLimitReached: true, sentToday, dailyLimit };
  }

  let sent = 0;
  let failed = 0;
  let stoppedByLimit = false;

  for (let i = 0; i < maxToSend; i++) {
    const lead = leads[i];
    const email = lead.email;
    const name = lead.name || lead.first_name || lead.email.split('@')[0];
    const subject = variables.subject || `🎁 Free IPTV Trial — Just for You!`;
    const html = variables.html || `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:12px;">
        <h1 style="color:#ffd700;">🎁 Free Trial Waiting</h1>
        <p>Hi ${name},</p>
        <p>Claim your <strong>72-hour free trial</strong> and enjoy 179,915+ channels in 4K.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="https://dalletek.live/trial?email=${encodeURIComponent(email)}" style="display:inline-block;background:#ffd700;color:#000;padding:14px 36px;border-radius:50px;font-weight:800;text-decoration:none;">🎁 CLAIM FREE TRIAL</a>
        </div>
        <p style="color:#888;font-size:12px;">No credit card needed · 24/7 support</p>
        <p style="color:#555;font-size:11px;margin-top:16px;"><a href="https://dalletek.live/unsubscribe?email=${encodeURIComponent(email)}" style="color:#555;">Unsubscribe</a></p>
      </div>`;

    const ok = await sendEmailFallback(lead, subject, html, campaignName);
    if (ok) sent++;
    else failed++;

    // Check if we hit daily limit mid-batch
    const currentSent = getDailyCount();
    if (currentSent >= dailyLimit && i < leads.length - 1) {
      stoppedByLimit = true;
      const skipped = leads.length - i - 1;
      failed += skipped;
      console.log(`[BulkEmail] Daily limit ${dailyLimit} reached. Stopping. Skipped ${skipped} leads.`);
      break;
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  return { sent, failed, total: leads.length, sentToday: getDailyCount(), dailyLimit, stoppedByLimit };
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

module.exports = { getLeadsForBatch, sendBulkEmails, ensureTemplates, getDailyCount, getBrevoLimit, getCombinedDailyLimit, getCampaignQuota, getReservedQuota, TEMPLATES, BATCH_SIZES };
