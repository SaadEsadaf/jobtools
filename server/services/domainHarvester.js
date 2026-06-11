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

async function checkDomain(domain) {
  const result = { domain, emails: [], exists: false };
  
  // Check if domain has any DNS records (A, AAAA, MX, NS)
  try {
    const a = await dns.resolve4(domain).catch(() => []);
    const aaaa = await dns.resolve6(domain).catch(() => []);
    const mx = await dns.resolveMx(domain).catch(() => []);
    const ns = await dns.resolveNs(domain).catch(() => []);
    result.exists = a.length > 0 || aaaa.length > 0 || mx.length > 0 || ns.length > 0;
    
    // Extract emails from DNS records
    const soaEmails = await extractEmailsFromSOA(domain);
    result.emails.push(...soaEmails);
    
    const dmarcEmails = await extractEmailsFromDMARC(domain);
    result.emails.push(...dmarcEmails);
    
    if (result.emails.length === 0) {
      const spfEmails = await extractEmailsFromSPF(domain);
      result.emails.push(...spfEmails);
    }
    
    if (result.emails.length === 0 && mx.length > 0) {
      const mxEmails = await extractEmailsFromMX(domain);
      result.emails.push(...mxEmails);
    }
  } catch(e) {}

  result.emails = [...new Set(result.emails)];
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
      for (const email of info.emails) {
        if (existing.has(email)) continue;
        existing.add(email);
        const domain_ = email.split('@')[1];
        const lang = domain_ && ['.fr', '.be', '.ch', '.re'].some(s => domain_.endsWith(s)) ? 'fr' : language;
        try {
          const info2 = stmt.run(
            email, 'dns_harvester', `dns_${info.domain}`,
            lang, 70,
            new Date().toISOString(), new Date().toISOString()
          );
          if (info2.changes > 0) batchHarvested++;
        } catch(e) {}
      }
      results.harvested += batchHarvested;
      
      if (batchHarvested > 0) {
        results.domains_with_emails.push({
          domain: info.domain,
          emails: info.emails,
          exists: info.exists,
          harvested: batchHarvested
        });
      }
    }
  }

  return results;
}

module.exports = { runHarvest, checkDomain, generateDomainList, extractEmailsFromDMARC };
