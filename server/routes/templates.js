const express = require('express')
const { getDb } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { injectNow } = require('../services/templateInjection')
const { signPayload } = require('../services/internalAuth')

const router = express.Router()

router.get('/', authMiddleware, (req, res) => {
  const db = getDb()
  const templates = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all()
  const parsed = templates.map(t => {
    try { t.meta = JSON.parse(t.meta) } catch { }
    return t
  })
  res.json(parsed)
})

router.post('/', authMiddleware, (req, res) => {
  const db = getDb()
  const { name, type, content, meta } = req.body
  if (!name || !type) return res.status(400).json({ error: 'Name and type required' })

  const r = db.prepare(`
    INSERT INTO templates (name, type, content, meta, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(name, type, content || null, meta ? (typeof meta === 'string' ? meta : JSON.stringify(meta)) : null, new Date().toISOString(), new Date().toISOString())

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(r.lastInsertRowid)
  res.json(template)
})

router.post('/inject/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  const { target, campaign_id } = req.body
  if (!target) return res.status(400).json({ error: 'Target type required' })

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id)
  if (!template) return res.status(404).json({ error: 'Template not found' })

  const actions = await injectNow(template, target, campaign_id || null)
  res.json({ templateId: template.id, type: template.type, target, actions })
})

router.get('/queue', authMiddleware, (req, res) => {
  const db = getDb()
  const items = db.prepare("SELECT * FROM content_queue WHERE status = 'pending' ORDER BY created_at DESC").all()
  res.json(items)
})

router.post('/queue/:id/post', authMiddleware, (req, res) => {
  const db = getDb()
  db.prepare('UPDATE content_queue SET status = ?, posted_at = ? WHERE id = ?')
    .run('posted', new Date().toISOString(), req.params.id)
  res.json({ posted: true })
})

router.get('/log', authMiddleware, (req, res) => {
  const db = getDb()
  const log = db.prepare('SELECT * FROM injection_log ORDER BY created_at DESC LIMIT 50').all()
  res.json(log)
})

// ============== BUSINESS ENGINE TEMPLATE BRIDGE ==============
const BOSS_URL = process.env.IPTV_BOSS_URL || 'http://localhost:3001';

const BOSS_TEMPLATE_TYPES = [
  { key: 'trial_default', name: 'Essai 24h', vars: ['customer_name','customer_email','username','password','server_url','duration_hours','site_name','site_url','provider_name','plan_name','m3u_url','dashboard_url','app_name','app_logo','app_steps'] },
  { key: 'credentials_default', name: 'Creds Paiement', vars: ['customer_name','customer_email','username','password','server_url','code','site_name','provider_name','plan_name'] },
  { key: 'payment_link_default', name: 'Lien Paiement', vars: ['customer_name','customer_email','checkout_url','plan_name','amount','order_id','site_name'] },
];

router.get('/boss/types', authMiddleware, (req, res) => {
  res.json(BOSS_TEMPLATE_TYPES);
});

function getBossToken(req) {
  const h = req.headers.authorization;
  return h || '';
}

router.get('/boss', authMiddleware, async (req, res) => {
  try {
    const resp = await fetch(`${BOSS_URL}/api/campaigns/templates`, {
      headers: { Authorization: getBossToken(req) }
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/boss/:templateKey', authMiddleware, async (req, res) => {
  try {
    const resp = await fetch(`${BOSS_URL}/api/admin/email-templates/${req.params.templateKey}`, {
      headers: { Authorization: getBossToken(req) }
    });
    if (resp.status === 404) return res.json(null);
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/boss/sync', authMiddleware, async (req, res) => {
  try {
    const { template_key, name, subject, body_html, variables } = req.body;
    if (!template_key) return res.status(400).json({ error: 'template_key required' });
    const resp = await fetch(`${BOSS_URL}/api/campaigns/templates/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getBossToken(req) },
      body: JSON.stringify({ template_key, name, subject, body_html, variables: JSON.stringify(variables || []) })
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/boss/preview', authMiddleware, (req, res) => {
  const { body_html, vars } = req.body;
  if (!body_html) return res.json({ html: '' });
  let html = body_html;
  const sampleVars = {
    customer_name: 'Jean',
    customer_email: 'client@email.com',
    username: '446813353907907',
    password: '1593574628',
    server_url: 'http://apcup26.space/',
    duration_hours: '24',
    site_name: 'Dalletek',
    site_url: 'https://dalletek.live',
    provider_name: 'Atlas',
    plan_name: 'Essai 24h',
    m3u_url: 'http://apcup26.space/get.php?username=446813353907907&password=1593574628&type=m3u_plus&output=ts',
    dashboard_url: 'https://dalletek.live/dashboard',
    app_name: 'TiviMate',
    app_logo: '🔥',
    app_steps: '1. Installez TiviMate<br>2. Ajoutez une playlist<br>3. Entrez vos identifiants<br>4. Profitez !',
    code: 'ACTV-XXXX',
    checkout_url: 'https://pay.dalletek.live/checkout/xxx',
    amount: '29.99',
    order_id: 'ORD-123',
  };
  const merged = { ...sampleVars, ...(vars || {}) };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== null && v !== undefined) {
      html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  html = html.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, name, content) => {
    return merged[name] ? content : '';
  });
  res.json({ html });
});

// ============== STOCK OVERVIEW FROM BUSINESS ENGINE ==============
router.get('/stock', authMiddleware, async (req, res) => {
  try {
    const sig = signPayload({});
    const resp = await fetch(`${BOSS_URL}/api/internal/stock-overview?website_id=${req.query.website_id || ''}`, {
      headers: { 'X-Engine-Signature': sig }
    });
    if (!resp.ok) return res.status(502).json({ error: 'Business Engine error: ' + resp.status });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock/sync-campaign — sync stock data + order targets for campaign
router.post('/stock/sync-campaign', authMiddleware, async (req, res) => {
  try {
    const sig = signPayload({});
    const stockResp = await fetch(`${BOSS_URL}/api/internal/stock-overview`, {
      headers: { 'X-Engine-Signature': sig }
    });
    if (!stockResp.ok) return res.status(502).json({ error: 'Business Engine error' });
    const stock = await stockResp.json();
    // Prepare campaign-friendly summary
    const campaignData = {
      lowStockPlans: stock.alerts.lowStock.map(p => `${p.provider} - ${p.plan_name}: ${p.available}/${p.min_stock}`),
      availableTrials: stock.trialCodes.available,
      availableCodes: stock.activationCodes.available,
      trialOrders: stock.orders.trial,
      paidOrders: stock.orders.paid,
      pendingOrders: stock.orders.pending,
      totalRevenue: stock.revenue.total,
      recentOrders: stock.orders.recent.slice(0, 5).map(o => ({
        email: o.customer_email, plan: o.plan_id, type: o.is_trial ? 'trial' : 'paid', amount: o.amount
      })),
    };
    res.json(campaignData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router
