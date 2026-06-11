const { execSync } = require('child_process');
const { getDb } = require('../db');

const DOMAIN_PATTERNS = [
  'iptv', 'smartiptv', 'xtream', 'xui', 'ott',
  'tivimate', 'm3u', 'epicstream', 'strongiptv',
  'v6iptv', 'iptvsmarters', 'ssiptv', 'iptvpro',
  'perfectplayer', 'gseiptv', 'iptvlist', 'iptvsub',
  'iptvpanel', 'iptvdream', 'iptvstream', 'iptvshop',
  'iptvservice', 'iptvprovider', 'iptvsubscription',
  'iptvbuy', 'iptvsale', 'iptvdeal', 'iptvcheap',
  'iptvpremium', 'iptvgold', 'iptvbest', 'iptvtop',
  'iptvfrance', 'iptvfr', 'iptvcanal', 'iptvcanalplus',
  'iptvbouygues', 'iptvorange', 'iptvsfr', 'iptvfree',
  'canaliptv', 'meilleurIPTV', 'iptvabonnement', 'iptvabo',
  'iptvstreaming', 'iptvhd', 'iptv4k', 'iptvultra',
  'iptvmax', 'iptvking', 'iptvmaster', 'iptvworld'
];

const TLDs = ['.com', '.net', '.org', '.fr', '.eu', '.info', '.store', '.shop', '.xyz', '.online', '.site', '.live', '.tv'];

const KNOWN_DOMAINS = [
  'dalletek.live', 'iptvboss.com', 'iptvregion.eu.org',
  'xtream-ui.com', 'xtreamui.com', 'xui.pt',
  'whmcssmarters.com', 'whmcssmarters.fr',
  'iptvsmarters-pro.com', 'iptvsmarterspro.com',
  'tivimate.com', 'ott-navigator.com',
  'megaiptv.com', 'megaiptv.fr',
  'nordvpn.com', 'justvpn.fr',
  'canalplus.com', 'canal-plus.com',
  'free.fr', 'orange.fr', 'sfr.fr', 'bouyguestelecom.fr',
  'iptv-france.net', 'iptvfrancais.com',
  'le-bon-iptv.com', 'iptvabonnement.fr',
  'meilleur-iptv.fr', 'top-iptv.fr',
  'iptv-stream.org', 'iptv-premium.net',
  'iptvsmart.club', 'iptv2025.com'
];

function generateDomains() {
  const domains = [];
  for (const p of DOMAIN_PATTERNS) {
    for (const t of TLDs) {
      domains.push(`${p}${t}`);
      domains.push(`get${p}${t}`);
      domains.push(`best${p}${t}`);
      domains.push(`top${p}${t}`);
      domains.push(`buy${p}${t}`);
      domains.push(`www.${p}${t}`);
    }
  }
  return [...new Set([...domains, ...KNOWN_DOMAINS])];
}

function extractWhoisEmails(text) {
  const emails = [];
  const patterns = [
    /Registrant Email:\s*([^\s]+)/gi,
    /Admin Email:\s*([^\s]+)/gi,
    /Tech Email:\s*([^\s]+)/gi,
    /Contact E-mail:\s*([^\s]+)/gi,
    /E-mail:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/gi,
    /email:\s*([^\s@]+@[^\s@]+\.[^\s@]+)/gi,
    /OrgAbuseEmail:\s*([^\s]+)/gi,
    /OrgTechEmail:\s*([^\s]+)/gi,
    /OrgAdminEmail:\s*([^\s]+)/gi,
  ];
  for (const pat of patterns) {
    const matches = [...text.matchAll(pat)];
    for (const m of matches) {
      const e = m[1].toLowerCase().trim().replace(/\.$/, '');
      if (e.includes('@') && !e.includes('example') && !e.includes('@whois') && !e.includes('@iana')) {
        emails.push(e);
      }
    }
  }
  return [...new Set(emails)];
}

async function checkWhois(domain) {
  try {
    const output = execSync(`whois "${domain}" 2>/dev/null || true`, { timeout: 8000, encoding: 'utf8' });
    return output;
  } catch (e) {
    return '';
  }
}

async function runMine(maxDomains = 500) {
  const db = getDb();
  const results = { checked: 0, found: 0, harvested: 0, errors: 0, domains_with_emails: [] };

  const existing = new Set(
    db.prepare("SELECT email FROM leads WHERE email IS NOT NULL AND email != ''").all().map(r => r.email.toLowerCase())
  );

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO leads (email, source, source_name, language, intent_score, status, imported_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'lead', 'whois_miner', ?, ?)"
  );

  const domains = generateDomains();
  const toCheck = domains.slice(0, maxDomains);

  for (let i = 0; i < toCheck.length; i += 5) {
    const batch = toCheck.slice(i, i + 5);
    const promises = batch.map(async (domain) => {
      results.checked++;
      const whoisText = await checkWhois(domain);
      if (!whoisText || whoisText.length < 50) return;
      const emails = extractWhoisEmails(whoisText);
      if (emails.length === 0) return;
      results.found += emails.length;
      for (const email of emails) {
        if (existing.has(email)) continue;
        existing.add(email);
        const domain_ = email.split('@')[1];
        const lang = domain_ && ['.fr', '.be', '.ch'].some(s => domain_.endsWith(s)) ? 'fr' : 'en';
        try {
          const info = stmt.run(
            email, 'whois_miner', `whois_${domain}`,
            lang, 70,
            new Date().toISOString(), new Date().toISOString()
          );
          if (info.changes > 0) results.harvested++;
        } catch (e) {
          results.errors++;
        }
      }
      results.domains_with_emails.push({ domain, emails });
    });
    await Promise.all(promises);
    await new Promise(r => setTimeout(r, 1500));
  }

  return results;
}

module.exports = { generateDomains, extractWhoisEmails, runMine, checkWhois };
