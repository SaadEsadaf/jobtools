const { getDb } = require('../db');
const nodemailer = require('nodemailer');
const { sendViaSendGrid } = require('./sendgridService');

function getMailer() {
  const db = getDb();
  const host = (db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_host'").get() || {}).value;
  const port = parseInt((db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_port'").get() || {}).value || '587');
  const user = (db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_user'").get() || {}).value;
  const pass = (db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_pass'").get() || {}).value;
  const fromName = (db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_from_name'").get() || {}).value || 'Dalletek';
  const fromEmail = (db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_from_email'").get() || {}).value;

  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const t = nodemailer.createTransport({
    host: host || 'smtp-relay.brevo.com',
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    ...(isLocal ? { tls: { rejectUnauthorized: false }, ignoreTLS: true } : {}),
  });
  t.fromName = fromName;
  t.fromEmail = fromEmail;
  return t;
}

function renderEmailTemplate(templateKey, vars) {
  const db = getDb();
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateKey);
  let body = t ? t.content : '';
  let subject = t ? (t.meta ? JSON.parse(t.meta).subject : '') : '';
  if (!body) return null;
  for (const [k, v] of Object.entries(vars)) {
    if (v !== null && v !== undefined) {
      body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return { body, subject };
}

async function sendMail(to, subject, html) {
  const mailer = getMailer();
  if (!mailer.fromEmail) {
    throw new Error('SMTP not configured — set smtp_host, smtp_user, smtp_pass, smtp_from_email in Settings');
  }
  try {
    const info = await mailer.sendMail({
      from: `"${mailer.fromName || 'Dalletek'}" <${mailer.fromEmail}>`,
      to,
      subject,
      html,
    });
    return info;
  } catch (e) {
    console.error(`[MarketingMailer] SMTP failed (${e.message}), trying SendGrid...`);
    return await sendViaSendGrid(to, mailer.fromName || 'Dalletek', subject, html);
  }
}

module.exports = { getMailer, renderEmailTemplate, sendMail };
