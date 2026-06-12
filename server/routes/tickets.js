const express = require('express');
const router = express.Router();
const IPTV_BOSS = process.env.IPTV_BOSS_URL || 'http://localhost:3001';

// Proxy all ticket requests to IPTV Boss
router.all('/*', async (req, res) => {
  try {
    const target = `${IPTV_BOSS}/api/tickets${req.path === '/' ? '' : req.path}${Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : ''}`;
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const response = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('[Tickets Proxy]', e.message);
    res.status(502).json({ error: 'Backend unavailable' });
  }
});

// Handle root path
router.get('/', async (req, res) => {
  try {
    const target = `${IPTV_BOSS}/api/tickets${Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : ''}`;
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const response = await fetch(target);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('[Tickets Proxy]', e.message);
    res.status(502).json({ error: 'Backend unavailable' });
  }
});

module.exports = router;
