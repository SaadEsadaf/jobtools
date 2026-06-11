const dns = require('dns').promises;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', 'grr.la',
  'yopmail.com', 'throwaway.email', 'temp-mail.org', 'tempmail.com',
  '10minutemail.com', 'burnermail.io', 'trashmail.com', 'maildrop.cc',
  'getnada.com', 'mail.tm', 'temp-mail.io', 'emailfake.com', 'tempmail.net',
  'mailnator.com', 'mytemp.email', 'spamgourmet.com', 'discard.email',
  'mohmal.com', 'guerrillamail.org', 'guerrillamail.net',
  'mailmetrash.com', 'thankyou2010.com', 'trash2009.com',
  'mt2009.com', 'trashymail.com', 'tyldd.com', 'uggsrock.com',
  'wegwerfmail.de', 'wh4f.org', 'whyspam.me', 'willselfdestruct.com',
  'winemaven.info', 'wronghead.com', 'wuzup.net', 'xagma.com',
  'xemaps.com', 'xents.com', 'xmaily.com', 'xoxy.net', 'yep.it',
  'yogamaven.com', 'yopmail.fr', 'yopmail.net', 'ypmail.webarnak.com.eu.org',
  'zzz.com', 'zzz.pl', 'fakemail.com', 'fakemailgenerator.com',
]);

function validateSyntax(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email);
}

function isDisposable(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

async function checkMX(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

function scoreEmail(email, source, sourceMeta = {}) {
  let score = 0;
  let priority = 5;
  let reasons = [];

  const domain = email.split('@')[1]?.toLowerCase();
  const local = email.split('@')[0]?.toLowerCase();

  if (!validateSyntax(email)) return { valid: false, score: 0, priority: 5, reasons: ['invalid_syntax'] };

  if (isDisposable(email)) return { valid: false, score: 0, priority: 5, reasons: ['disposable'] };

  if (source === 'dns_harvester' && sourceMeta.domain) {
    score += 25;
    reasons.push('dns_verified_admin');
  }

  if (source === 'dns_harvester') {
    score += 10;
    reasons.push('dns_source');
  }

  if (domain && (domain.endsWith('.fr') || domain.endsWith('.eu'))) {
    score += 10;
    reasons.push('european_domain');
  }

  if (domain === 'gmail.com' || domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'yahoo.com') {
    score += 10;
    reasons.push('major_provider');
  }

  if (domain && (domain.endsWith('.com') || domain.endsWith('.net') || domain.endsWith('.org'))) {
    score += 5;
  }

  if (local && local.length > 8) {
    score += 5;
    reasons.push('long_username');
  }

  if (local && !/[0-9]/.test(local)) {
    score += 5;
    reasons.push('no_numbers');
  }

  if (local === 'admin' || local === 'hostmaster' || local === 'postmaster' || local === 'webmaster' || local === 'dns') {
    score += 15;
    reasons.push('admin_role');
  }

  if (local === 'contact' || local === 'info' || local === 'support' || local === 'sales') {
    score += 10;
    reasons.push('business_role');
  }

  if (source === 'iptv_list_leak') {
    score += 20;
    reasons.push('direct_iptv_leak');
  }

  if (source === 'pastebin') {
    score += 15;
    reasons.push('pastebin_leak');
  }

  if (source === 'youtube') {
    score += 5;
    reasons.push('youtube_source');
  }

  if (score >= 60) priority = 1;
  else if (score >= 45) priority = 2;
  else if (score >= 30) priority = 3;
  else if (score >= 15) priority = 4;

  return { valid: true, score, priority, reasons };
}

async function validateAndScore(email, source, sourceMeta = {}) {
  const scored = scoreEmail(email, source, sourceMeta);
  if (!scored.valid) return { ...scored, mx_valid: false };

  const domain = email.split('@')[1];
  const mxValid = await checkMX(domain);

  if (!mxValid) {
    scored.valid = false;
    scored.score = Math.max(0, scored.score - 20);
    scored.reasons.push('no_mx_record');
    if (scored.score < 15) scored.priority = 5;
  } else {
    scored.mx_valid = true;
    scored.score = Math.min(100, scored.score + 10);
    scored.reasons.push('mx_valid');
  }

  if (scored.score >= 60) scored.priority = 1;
  else if (scored.score >= 45) scored.priority = 2;
  else if (scored.score >= 30) scored.priority = 3;
  else if (scored.score >= 15) scored.priority = 4;

  return scored;
}

module.exports = { validateAndScore, scoreEmail, validateSyntax, isDisposable, checkMX };
