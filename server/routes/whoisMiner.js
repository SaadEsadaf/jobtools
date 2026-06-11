const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const domainHarvester = require('../services/domainHarvester');

const router = express.Router();

router.get('/status', authMiddleware, (req, res) => {
  const db = getDb();
  const totalDns = db.prepare("SELECT COUNT(*) as c FROM leads WHERE source = 'dns_harvester'").get().c || 0;
  const totalLeads = db.prepare("SELECT COUNT(*) as c FROM leads").get().c || 0;
  const bySource = db.prepare("SELECT source, COUNT(*) as c FROM leads WHERE source = 'dns_harvester' GROUP BY source").all();
  const withEmail = db.prepare("SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL AND email != ''").get().c || 0;
  res.json({ totalDns, totalLeads, bySource, withEmail });
});

// DNS Harvester - checks DMARC/DNS records for email discovery
router.post('/harvest', authMiddleware, async (req, res) => {
  req.setTimeout(0);
  try {
    const config = {
      area: req.body.area || 'all',
      language: req.body.language || 'fr',
      targetCount: Math.min(parseInt(req.body.targetCount) || 50, 500),
      checkDmarc: req.body.checkDmarc !== false,
      checkSpf: req.body.checkSpf === true,
      checkMx: req.body.checkMx === true,
      maxDomains: Math.min(parseInt(req.body.maxDomains) || 500, 2000)
    };

    const results = await domainHarvester.runHarvest(config);
    res.json({
      mode: 'dns_harvester',
      area: config.area,
      language: config.language,
      targetCount: config.targetCount,
      discovered: results.discovered,
      exists: results.exists,
      domains_checked: results.domains_checked,
      emails_found: results.emails_found,
      harvested: results.harvested,
      errors: results.errors.slice(0, 10),
      domains_with_emails: results.domains_with_emails.slice(0, 30)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/check/:domain', authMiddleware, async (req, res) => {
  req.setTimeout(0);
  try {
    const domain = req.params.domain.toLowerCase().trim();
    const info = await domainHarvester.checkDomain(domain);
    res.json({
      domain: info.domain,
      emails: info.emails,
      exists: info.exists,
      total: info.emails.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/domains', authMiddleware, (req, res) => {
  const domains = domainHarvester.generateDomainList();
  res.json({ total: domains.length, domains: domains.slice(0, 100) });
});

module.exports = router;
