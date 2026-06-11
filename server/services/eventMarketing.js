const { getDb } = require('../db');
const { getMailer } = require('./marketingMailer');
const { notifyIptvBoss } = require('./brainBridge');

function getUpcomingEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const events = [];

  if (year === 2026 && month >= 5 && month <= 6) {
    events.push({ name: "Coupe du Monde FIFA 2026", sport: "Football", period: "Juin-Juillet 2026", icon: "🏆", hook: "Tous les 64 matchs en direct 4K !", trialMessage: "Regardez la Coupe du Monde 2026 en 4K gratuite pendant 24h ⚽", active: true, endDate: new Date(2026, 6, 19) });
  }
  if (month >= 8 || month <= 4) {
    events.push({ name: "UEFA Champions League", sport: "Football", period: "Saison 2025-2026", icon: "⭐", hook: "Tous les matchs en direct, demi-finales et finale !", trialMessage: "Champions League en direct 4K — essai gratuit 24h ⭐", active: true, endDate: new Date(year, 5, 31) });
  }
  if (month >= 7 || month <= 4) {
    events.push({ name: "Premier League", sport: "Football", period: "Saison 2025-2026", icon: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", hook: "Tous les matchs en direct chaque week-end !", trialMessage: "Premier League en direct — essai gratuit 24h ⚽", active: true, endDate: new Date(year, 4, 25) });
  }
  if (month >= 9 || month <= 5) {
    events.push({ name: "NBA Basketball", sport: "Basketball", period: "Playoffs en cours !", icon: "🏀", hook: "Tous les matchs NBA en direct 4K !", trialMessage: "NBA en direct 4K — essai gratuit 24h 🏀", active: true, endDate: new Date(year, 5, 30) });
  }
  if (month >= 5 && month <= 7) {
    events.push({ name: "UFC & MMA", sport: "Combat", period: "Été 2026", icon: "🥊", hook: "Tous les combats UFC en direct !", trialMessage: "UFC en direct — essai gratuit 24h 🥊", active: true, endDate: new Date(year, 8, 1) });
  }
  if (month >= 4 && month <= 5) {
    events.push({ name: "Roland Garros", sport: "Tennis", period: "Mai-Juin 2026", icon: "🎾", hook: "Tout Roland Garros en direct 4K !", trialMessage: "Roland Garros en direct — essai gratuit 24h 🎾", active: true, endDate: new Date(year, 5, 7) });
  }
  if (month === 6) {
    events.push({ name: "Tour de France", sport: "Cyclisme", period: "Juillet 2026", icon: "🚴", hook: "Toutes les étapes en direct !", trialMessage: "Tour de France en direct — essai gratuit 24h 🚴", active: true, endDate: new Date(year, 6, 27) });
  }

  return events.filter(e => e.endDate > now);
}

function getTopEvents() {
  return getUpcomingEvents().slice(0, 3).map(e => ({
    ...e,
    daysRemaining: Math.max(0, Math.ceil((e.endDate - new Date()) / (1000 * 60 * 60 * 24))),
  }));
}

function createEventEmail(event, siteName, trialUrl) {
  return `
    <div style="text-align:center;padding:20px;">
      <div style="font-size:56px;margin-bottom:8px;">${event.icon}</div>
      <h2 style="color:#ffd700;font-size:22px;margin:0 0 4px;">${event.name}</h2>
      <p style="color:#a0a0a0;font-size:14px;margin:0 0 4px;">${event.hook}</p>
      <p style="color:#00d4ff;font-size:16px;font-weight:600;margin:0 0 20px;">🎁 ${event.trialMessage}</p>
      <a href="${trialUrl}" style="display:inline-block;background:linear-gradient(135deg,#ff6b35,#ff2d92);color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">🚀 Essai Gratuit 24h</a>
      <p style="color:#666;font-size:12px;margin-top:12px;">${event.daysRemaining ? `🔥 Plus que ${event.daysRemaining} jours` : ''}</p>
    </div>`;
}

async function sendEventCampaign() {
  const db = getDb();
  const enabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'event_marketing_enabled'").get() || {}).value;
  if (enabled === '0') return { sent: 0, reason: 'disabled' };

  const siteName = (db.prepare("SELECT value FROM app_settings WHERE key = 'site_name'").get() || {}).value || 'Dalletek';
  const siteUrl = (db.prepare("SELECT value FROM app_settings WHERE key = 'site_url'").get() || {}).value || 'https://dalletek.live';

  const events = getUpcomingEvents();
  if (events.length === 0) return { sent: 0, reason: 'no_events' };

  const event = events[0];
  const trialUrl = `${siteUrl}/#plans`;

  const leads = db.prepare(`
    SELECT DISTINCT id, username, email, language, content, intent_score
    FROM leads
    WHERE intent_score >= 40 AND status NOT IN ('converted', 'blocked')
      AND (email IS NOT NULL AND email != '')
      AND id NOT IN (
        SELECT DISTINCT CAST(target AS INTEGER) FROM injection_log
        WHERE injection_type = 'event_campaign' AND target GLOB '[0-9]*'
      )
    ORDER BY intent_score DESC
    LIMIT 50
  `).all();

  let sent = 0;

  for (const lead of leads) {
    try {
      const emailBody = createEventEmail(event, siteName, trialUrl);
      const mailer = getMailer();

      await mailer.sendMail({
        from: `"${siteName}" <${mailer.fromEmail}>`,
        to: lead.email,
        subject: `${event.icon} ${event.name} — ${event.trialMessage}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;padding:20px;">
          <div style="max-width:560px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;padding:20px;">
            ${emailBody}
            <div style="text-align:center;padding:16px;border-top:1px solid #1a1a1a;color:#666;font-size:12px;">
              <p>${siteName} — <a href="${siteUrl}" style="color:#00d4ff;">${siteUrl}</a></p>
            </div>
          </div>
        </div>`,
      });

      db.prepare(`
        INSERT INTO injection_log (injection_type, target, status, campaign_id, details, notified_to_brain, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run('event_campaign', lead.email, 'sent', lead.id, `Sent ${event.name} offer`, 0);

      sent++;
    } catch (e) {
      console.error('Event campaign error:', e.message);
      db.prepare(`
        INSERT INTO injection_log (injection_type, target, status, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('event_campaign', lead.email || String(lead.id), 'failed', `Event ${event.name}: ${e.message}`);
    }

    if (sent >= 10) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (sent > 0) {
    try {
      await notifyIptvBoss('event_campaign', {
        event: event.name,
        sent,
        totalLeads: leads.length,
        icon: event.icon,
      });
    } catch {}
  }

  return { sent, event: event.name, totalLeads: leads.length };
}

function getTrendingEvents() {
  return getUpcomingEvents().map(e => ({
    name: e.name,
    icon: e.icon,
    hook: e.hook,
    daysRemaining: Math.max(0, Math.ceil((e.endDate - new Date()) / (1000 * 60 * 60 * 24))),
  }));
}

module.exports = { getUpcomingEvents, getTopEvents, sendEventCampaign, getTrendingEvents, createEventEmail };
