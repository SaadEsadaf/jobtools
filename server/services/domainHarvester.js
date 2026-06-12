const dns = require('dns').promises;
const { getDb } = require('../db');

// ==================== DOMAIN SOURCES ====================
const DOMAIN_PATTERNS = [
  // TV Box forums & review sites
  'tvboxforum', 'tvboxforums', 'androidtvforum',
  'tvboxreview', 'tvboxreviews', 'androidtvreview',
  'firetvstickforum', 'firestickforum',
  'kodi-forum', 'kodi-forum-fr', 'kodi-forumfr',
  'kodiaddon', 'kodiaddons', 'kodireview',
  'kodiguide', 'koditutorial', 'kodi-help',
  'androidtvhelp', 'androidtvfr',
  'iptv-review', 'iptvreviews', 'iptv-reviewfr',
  'iptv-france-review', 'meilleuriptv-review',
  'iptvpourlesnuls', 'iptvfrguide', 'iptvtuto',
  'tvfrance-iptv', 'iptv-infos',
  'cordcutting', 'cordcutter', 'cordcutters',
  'cordcuttingreview', 'cordcutterguide',
  'streamingreview', 'streamingfrance',
  'box-streaming', 'streamingbox-review',
  
  // IPTV core
  'iptv', 'smartiptv', 'xtream', 'megaiptv', 'bestiptv',
  'iptvabonnement', 'iptvservice', 'iptvprovider', 'iptvpremium',
  'iptvfrance', 'iptvfr', 'iptvhd', 'iptv4k', 'iptvstreaming',
  'iptvboss', 'iptvshop', 'iptvdeal', 'iptvrevendeur',
  'iptvreseller', 'iptvbusiness', 'iptvsmart', 'iptvworld',
  'iptvchoice', 'iptvaccess', 'iptvconnect', 'iptvnetwork',
  'iptvsolution', 'iptvtech', 'iptvmedia', 'iptvdigital',
  'iptvstore', 'iptvmarket', 'iptvzone',
  'getiptv', 'buyiptv', 'topiptv', 'bestiptv', 'cheapiptv',
  'premiumiptv', 'ultraiptv', 'superiptv', 'proiptv',
  'abonnementiptv', 'meilleuriptv', 'iptvabonnement',
  'leboniptv', 'moniptv', 'tv-iptv', 'iptv-tv',
  'canaliptv', 'beinsport-iptv', 'france-iptv', 'iptv-france',
  'iptvtest', 'iptvtrial', 'iptvfree', 'iptvservices',
  'iptvs', 'iptv2025', 'iptv2026',
  
  // TV Boxes & Android TV
  'tvbox', 'androidtv', 'android-tv', 'androidtvbox',
  'tv-box', 'tvboxandroid', 'smarttv', 'smart-tv',
  'googletv', 'googletvbox', 'googletvchromecast',
  'chromecast', 'googletvstreamer',
  'nvidiatv', 'nvidiatvshield', 'shieldtv', 'shield-tv',
  'nvidiashield', 'shieldandroidtv',
  'firetv', 'firetvstick', 'firestick', 'amazonfiretv',
  'firetvstick', 'firetvstick4k', 'firetvsticklite',
  'xiaomitv', 'xiaomi-mi-tv', 'xiaomibox', 'mi-tv-box',
  'mibox', 'miboxs', 'xiaomitvstick',
  'rokutv', 'roku', 'rokustick', 'rokuplayer',
  'appletv', 'apple-tv',
  'formuler', 'formulertv', 'formulerbox',
  'formuleriptv', 'formuleriptvbox',
  'magbox', 'magboxiptv', 'magtv', 'magiptv',
  'infomir', 'infomirmag', 'infomirmagbox',
  'enigma2', 'enigma2box', 'enigma2iptv',
  'dreambox', 'dreamboxenigma', 'dreamboxiptv',
  'vuplus', 'vuplusbox', 'vuplusiptv',
  'kodi', 'kodiplayer', 'kodiabox', 'kodibox',
  'kodileia', 'koditvbox', 'koditv',
  'stbemu', 'stbemuplayer', 'stbemutv',
  'tivimate', 'tivimateplayer', 'tivimatesmart',
  'ottplayer', 'ott-navigator', 'ottnavigator',
  'smartersplayer', 'iptvsmarters', 'iptvsmarterspro',
  'ssiptv', 'smartstb', 'smartiptv',
  'gseiptv', 'gseiptvplayer', 'gseiptvandroid',
  
  // Streaming & Cord Cutting
  'cordcutting', 'cordcutter', 'cord-cutters',
  'cutcord', 'cutthecord',
  'streamingservice', 'streamingbox', 'streamingdevice',
  'streamstv', 'streamonline', 'streamfree',
  'netflix', 'netflixabonnement', 'netflixfrance',
  'disneyplus', 'disney+', 'hbo', 'hbomax',
  'primevideo', 'amazonprimevideo', 'paramountplus',
  'peacocktv', 'hulu', 'huluplus',
  'molotov', 'molotovtv', 'salto', 'saltofr',
  'canalplus', 'canal-plus', 'canalplusfr',
  
  // Kodi addons & IPTV apps
  'kodiiptv', 'kodiaddon', 'kodiaddons',
  'koditutorial', 'kodiguide',
  'iptvhunter', 'iptvhunt', 'iptvfinder',
  'iptvm3u', 'm3ulist', 'm3uiptv', 'iptvliste',
  'iptvflix', 'iptvstreamz',
  
  // French TV & IPTV related
  'free', 'freebox', 'freefr', 'free-television',
  'orange', 'orange-box', 'orange-tv',
  'sfr', 'sfrbox', 'sfrtv', 'sfr-television',
  'bouyguestelecom', 'bouyguesbox', 'bouyguestv',
  'numericable', 'numéricable',
  'tvfrench', 'frenchtv', 'tvfr',
  'tnthd', 'tvnt',
  
  // TV Box sellers & reviews
  'tvboxreview', 'tvboxreviews', 'androidtvreview',
  'streamingreview', 'streamerpro',
  'besttvbox', 'bestandroidtvbox', 'topandroidtv',
  'tvboxfr', 'tvboxfrance', 'tvboxacheter',
  'achetertvbox', 'tvboxprix', 'tvboxpasher',
  'hometvbox', 'tvboxmedia',
  
  // Enigma2 & LinuxTV
  'linuxsat', 'linuxsatellite', 'linux-satellite',
  'satuapo', 'satellite-iptv', 'satbox',
  'hdfreaks', 'hd-freaks',
  'digitalfernsehen', 'digital-tv',
];

const TLDs = ['.com', '.net', '.org', '.fr', '.eu', '.info', '.store', '.shop', '.live', '.tv', '.online', '.site', '.xyz'];

const KNOWN_DOMAINS = [
  'dalletek.live', 'iptvregion.eu.org', 'iptv-org.github.io',
  'ott-navigator.com', 'tivimate.com',
  'whmcssmarters.com', 'iptvsmarters.com', 'iptvsmarterspro.com',
  'megaiptv.fr', 'megaiptv.com',
  'canalplus.com', 'free.fr', 'orange.fr', 'sfr.fr',
  'bouyguestelecom.fr', 'gmail.com', 'outlook.com', 'protonmail.com',
  // TV Box brands
  'nvidia.com', 'nvidia-shield.com', 'shield.nvidia.com',
  'amazon.com', 'amazon.fr', 'amazon.de',
  'xiaomi.com', 'xiaomi.fr', 'mi.com',
  'roku.com', 'appletv.com', 'apple.com',
  'formuler.tv', 'formuler.fr',
  'infomir.com', 'magbox.eu',
  'dreambox.de', 'dream-multimedia-tv.de',
  'vuplus.com', 'vuplus.de',
  'kodi.tv', 'kodi-fr.org',
  'minix.com.hk', 'minix.us',
  'tanix.com', 'tanix-box.com',
  'uugotv.com', 'buzztv.com',
  'dynalink.live', 'onntv.com',
  'philips.com', 'samsung.com', 'lg.com', 'sony.com',
  'hisense.com', 'tcl.com', 'panasonic.com',
  'google.com/chromecast', 'store.google.com',
  'wetek.com', 'homatics.com',
  'rocktek.com', 'videostrong.com',
];

// ==================== DNS-BASED EMAIL EXTRACTION ====================
async function extractEmailsFromDMARC(domain) {
  const emails = [];
  try {
    const txt = await dns.resolveTxt('_dmarc.' + domain);
    const flat = txt.flat().join(' ');
    const match = flat.match(/mailto:([^\s";>]+)/);
    if (match) {
      const email = match[1].toLowerCase().trim();
      if (email.includes('@') && !email.includes('example')) emails.push(email);
    }
  } catch(e) {}
  return emails;
}

async function extractEmailsFromSOA(domain) {
  const emails = [];
  try {
    const soa = await dns.resolveSoa(domain);
    if (soa.hostmaster) {
      let email = soa.hostmaster.replace(/\.$/, '').toLowerCase();
      if (email.includes('@')) {
        emails.push(email);
      } else {
        // RFC 2142: hostmaster.example.com -> hostmaster@example.com
        const parts = email.split('.');
        if (parts.length >= 2) {
          const name = parts[0];
          const domain_ = parts.slice(1).join('.');
          emails.push(`${name}@${domain_}`);
        }
      }
    }
  } catch(e) {}
  return emails;
}

async function extractEmailsFromSPF(domain) {
  const emails = [];
  try {
    const txt = await dns.resolveTxt(domain);
    const flat = txt.flat().join(' ');
    const redirectMatch = flat.match(/redirect=([^\s]+)/);
    if (redirectMatch) {
      const redirectDomain = redirectMatch[1];
      const dmarcEmails = await extractEmailsFromDMARC(redirectDomain);
      emails.push(...dmarcEmails);
    }
  } catch(e) {}
  return emails;
}

async function extractEmailsFromMX(domain) {
  const emails = [];
  try {
    const mx = await dns.resolveMx(domain);
    for (const record of mx.slice(0, 3)) {
      const mxDomain = record.exchange;
      const dmarcEmails = await extractEmailsFromDMARC(mxDomain);
      emails.push(...dmarcEmails);
    }
  } catch(e) {}
  return emails;
}

const COMMON_MAILBOXES = [
  { prefix: 'info', score: 15, role: 'info' },
  { prefix: 'sales', score: 20, role: 'sales' },
  { prefix: 'contact', score: 15, role: 'contact' },
  { prefix: 'support', score: 10, role: 'support' },
  { prefix: 'admin', score: 10, role: 'admin' },
  { prefix: 'webmaster', score: 5, role: 'webmaster' },
  { prefix: 'postmaster', score: 5, role: 'postmaster' },
  { prefix: 'hostmaster', score: 5, role: 'hostmaster' },
  { prefix: 'abuse', score: 5, role: 'abuse' },
  { prefix: 'newsletter', score: 15, role: 'newsletter' },
  { prefix: 'service', score: 15, role: 'service' },
  { prefix: 'order', score: 20, role: 'order' },
  { prefix: 'register', score: 15, role: 'register' },
  { prefix: 'help', score: 10, role: 'help' },
  { prefix: 'team', score: 15, role: 'team' },
  { prefix: 'hello', score: 10, role: 'hello' },
  { prefix: 'care', score: 15, role: 'care' },
  { prefix: 'message', score: 10, role: 'message' },
  { prefix: 'business', score: 20, role: 'business' },
  { prefix: 'partner', score: 20, role: 'partner' },
]

const SOCIAL_PATTERNS = [
  { regex: /t\.me\/([a-zA-Z0-9_]{5,})/gi, type: 'telegram_group' },
  { regex: /@([a-zA-Z0-9_]{5,})/g, type: 'telegram_handle' },
  { regex: /wa\.me\/(\d+)/gi, type: 'whatsapp' },
  { regex: /whatsapp\.com\/(\d+)/gi, type: 'whatsapp' },
  { regex: /wa\.link\/[a-zA-Z0-9]+/gi, type: 'whatsapp' },
  { regex: /instagram\.com\/([a-zA-Z0-9_.]+)/gi, type: 'instagram' },
  { regex: /facebook\.com\/([a-zA-Z0-9.]+)/gi, type: 'facebook' },
  { regex: /youtube\.com\/(@[a-zA-Z0-9_]+)/gi, type: 'youtube' },
  { regex: /discord\.(gg|com\/invite)\/([a-zA-Z0-9]+)/gi, type: 'discord' },
  { regex: /(?:^|\s)(\+?\d{7,15})(?:\s|$)/g, type: 'phone' },
]

function extractSocialLinks(text) {
  if (!text) return []
  const found = []
  for (const pattern of SOCIAL_PATTERNS) {
    const matches = [...text.matchAll(pattern.regex)]
    for (const m of matches) {
      const handle = m[m.length - 1] || m[0]
      if (handle && !handle.startsWith('@') && pattern.type === 'telegram_handle' && m[0].startsWith('@')) continue // already handled
      if (handle && !['http', 'www', 'example', 'test'].some(t => handle.toLowerCase().includes(t))) {
        found.push({ type: pattern.type, value: handle, original: m[0] })
      }
    }
  }
  return found
}

async function checkCommonEmails(domain, mxRecords) {
  const results = []
  if (mxRecords.length === 0) return results
  
  for (const mailbox of COMMON_MAILBOXES) {
    results.push({
      email: `${mailbox.prefix}@${domain}`,
      score: mailbox.score,
      role: mailbox.role,
      method: 'common_mailbox'
    })
  }
  return results
}

async function checkDomain(domain) {
  const result = { domain, emails: [], exists: false, mx_records: [] };
  
  try {
    const a = await dns.resolve4(domain).catch(() => []);
    const aaaa = await dns.resolve6(domain).catch(() => []);
    const mx = await dns.resolveMx(domain).catch(() => []);
    const ns = await dns.resolveNs(domain).catch(() => []);
    result.exists = a.length > 0 || aaaa.length > 0 || mx.length > 0 || ns.length > 0;
    result.mx_records = mx.map(m => m.exchange);
    
    const soaEmails = await extractEmailsFromSOA(domain);
    result.emails.push(...soaEmails.map(e => ({ email: e, score: 70, role: 'admin', method: 'soa' })));
    
    const dmarcEmails = await extractEmailsFromDMARC(domain);
    result.emails.push(...dmarcEmails.map(e => ({ email: e, score: 60, role: 'admin', method: 'dmarc' })));
    
    if (result.emails.length === 0) {
      const spfEmails = await extractEmailsFromSPF(domain);
      result.emails.push(...spfEmails.map(e => ({ email: e, score: 50, role: 'admin', method: 'spf' })));
    }
    
    if (result.emails.length === 0 && mx.length > 0) {
      const mxEmails = await extractEmailsFromMX(domain);
      result.emails.push(...mxEmails.map(e => ({ email: e, score: 40, role: 'admin', method: 'mx' })));
    }
    
    if (mx.length > 0) {
      const commonEmails = await checkCommonEmails(domain, mx);
      result.emails.push(...commonEmails);
    }
  } catch(e) {}

  result.emails = [...new Map(result.emails.map(e => [e.email, e])).values()];
  return result;
}

function generateDomainList() {
  const domains = new Set();
  
  // Pattern-based generation
  for (const p of DOMAIN_PATTERNS) {
    for (const t of TLDs) {
      domains.add(`${p}${t}`);
    }
  }
  
  // Known domains
  for (const d of KNOWN_DOMAINS) {
    domains.add(d);
  }
  
  return [...domains].filter(d => d.includes('.') && d.split('.').pop().length >= 2);
}

// ==================== MAIN ====================
async function runHarvest(config = {}) {
  const db = getDb();
  const {
    area = 'all',
    language = 'fr',
    targetCount = 50,
    checkDmarc = true,
    checkSpf = false,
    checkMx = false,
    maxDomains = 500
  } = config;

  const results = {
    discovered: 0, exists: 0, emails_found: 0, harvested: 0,
    domains_checked: 0, errors: [], domains_with_emails: []
  };

  const domains = generateDomainList();
  results.discovered = domains.length;

  // Filter by area (preferred TLDs)
  const areaTlds = area === 'fr' ? ['.fr', '.re'] : 
                   area === 'eu' ? ['.eu', '.de', '.es', '.it', '.nl', '.be', '.uk', '.ch'] : [];

  let sorted = [...domains];
  if (areaTlds.length > 0) {
    sorted.sort((a, b) => {
      const aArea = areaTlds.some(t => a.endsWith(t)) ? 0 : 1;
      const bArea = areaTlds.some(t => b.endsWith(t)) ? 0 : 1;
      return aArea - bArea;
    });
  }

  const toCheck = sorted.slice(0, Math.min(maxDomains, targetCount * 3));

  // Existing emails in DB
  const existing = new Set(
    db.prepare("SELECT email FROM leads WHERE email IS NOT NULL AND email != ''").all().map(r => r.email.toLowerCase())
  );
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO leads (email, source, source_name, language, intent_score, status, imported_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'lead', 'dns_harvester', ?, ?)"
  );

  const batchSize = 20;
  let checked = 0;
  
  for (let i = 0; i < toCheck.length && checked < targetCount; i += batchSize) {
    const batch = toCheck.slice(i, i + batchSize);
    const results_batch = await Promise.allSettled(batch.map(d => checkDomain(d)));

    for (const r of results_batch) {
      if (r.status !== 'fulfilled') continue;
      const info = r.value;
      results.domains_checked++;
      
      if (info.exists) results.exists++;
      if (info.emails.length === 0) continue;
      
      results.emails_found += info.emails.length;
      checked++;
      
      let batchHarvested = 0;
      for (const entry of info.emails) {
        const emailStr = typeof entry === 'string' ? entry : entry.email
        const score = typeof entry === 'string' ? 70 : entry.score
        const role = typeof entry === 'string' ? 'admin' : entry.role
        
        if (existing.has(emailStr)) continue;
        existing.add(emailStr);
        const domain_ = emailStr.split('@')[1];
        const lang = domain_ && ['.fr', '.be', '.ch', '.re'].some(s => domain_.endsWith(s)) ? 'fr' : language;
        try {
          const info2 = stmt.run(
            emailStr, 'dns_harvester', `dns_${info.domain}`,
            lang, score,
            new Date().toISOString(), new Date().toISOString()
          );
          if (info2.changes > 0) batchHarvested++;
        } catch(e) {}
      }
      results.harvested += batchHarvested;
      
      if (batchHarvested > 0) {
        results.domains_with_emails.push({
          domain: info.domain,
          emails: info.emails.map(e => typeof e === 'string' ? e : `${e.email} (${e.role}, score:${e.score})`),
          exists: info.exists,
          harvested: batchHarvested
        });
      }
    }
  }

  return results;
}

module.exports = { runHarvest, checkDomain, generateDomainList, extractEmailsFromDMARC };
