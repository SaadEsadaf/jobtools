const express = require('express')
const router = express.Router()
const { verifySignature } = require('../services/internalAuth')
const { buildPage } = require('../services/pageBuilder')

// Health check — no auth required (used by EngineWatcher)
router.get('/health', (req, res) => {
  const start = Date.now();
  try {
    const { getDb } = require('../db');
    const db = getDb();
    const checks = {};

    try {
      const c = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'").get().c;
      checks.db = { status: 'ok', tables: c };
    } catch (e) { checks.db = { status: 'error', error: e.message }; }

    try {
      const leads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at > datetime('now', '-1 day')").get().c;
      checks.leads_24h = leads;
    } catch { checks.leads_24h = -1; }

    try {
      const websites = db.prepare('SELECT COUNT(*) as c FROM websites').get().c;
      const blogs = db.prepare('SELECT COUNT(*) as c FROM blog_posts').get().c;
      const pages = db.prepare('SELECT COUNT(*) as c FROM landing_pages').get().c;
      checks.content = { websites, blog_posts: blogs, landing_pages: pages };
    } catch (e) { checks.content = { error: e.message }; }

    try {
      const aiRaw = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_providers'").get();
      const aiProviders = aiRaw ? Object.values(JSON.parse(aiRaw.value)).filter(p => p.enabled).length : 0;
      checks.ai_providers = { configured: aiProviders };
    } catch { checks.ai_providers = { configured: 0 }; }

    res.json({
      engine: 'marketing',
      status: checks.db.status === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - start,
      checks,
    });
  } catch (e) {
    res.status(500).json({ engine: 'marketing', status: 'error', error: e.message });
  }
});

// All internal routes require signature verification
router.use(express.json())
router.use(verifySignature)

// POST /api/internal/provision-website — receive new website from Business Engine
router.post('/provision-website', async (req, res) => {
  try {
    const { website_id, name, domain, slug, site_name, language } = req.body
    if (!website_id || !domain) {
      return res.status(400).json({ error: 'website_id and domain required' })
    }

    const { getDb } = require('../db')
    const db = getDb()

    // Upsert website into local DB
    const existing = db.prepare('SELECT id FROM websites WHERE slug = ? OR domain = ?').get(slug || domain, domain)
    if (existing) {
      db.prepare('UPDATE websites SET name = ?, domain = ?, site_name = ?, language = ? WHERE id = ?')
        .run(name || domain, domain, site_name || '', language || 'fr', existing.id)
      res.json({ success: true, website_id: existing.id, action: 'updated' })
    } else {
      const result = db.prepare('INSERT INTO websites (name, domain, slug, site_name, language) VALUES (?, ?, ?, ?, ?)')
        .run(name || domain, domain, slug || domain.replace(/\./g, '-'), site_name || '', language || 'fr')
      // Generate initial SEO content for new website
      const { autoBuildFromLeads } = require('../services/seoAgent')
      autoBuildFromLeads(result.lastInsertRowid).catch(e => console.error('[Internal] Auto-build failed:', e.message))
      res.json({ success: true, website_id: result.lastInsertRowid, action: 'created' })
    }
  } catch (err) {
    console.error('[Internal] Provision error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/internal/seo-audit — trigger SEO audit for a website
router.post('/seo-audit', async (req, res) => {
  try {
    const { website_id } = req.body
    const { runSEOAudit } = require('../services/seoAgent')
    await runSEOAudit(website_id || null)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
