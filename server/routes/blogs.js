const express = require('express')
const router = express.Router()
const { getDb } = require('../db')
const { generate } = require('../services/aiProvider')

const SEO_TOPICS = [
  'Meilleur IPTV France 2026',
  'IPTV pas cher abonnement',
  'IPTV légal ou pas France',
  'Comment installer IPTV sur Firestick',
  'IPTV 4K chaînes françaises',
  'Comparatif IPTV vs Canal+',
  'IPTV pour match foot Ligue 1',
  'Guide IPTV TiviMate complet',
  'IPTV sur Smart TV Samsung',
  'IPTV pour expatriés français',
  'Application IPTV Smarters guide',
  'IPTV sans buffering solution',
  'Liste M3U IPTV gratuite',
  'IPTV VPN nécessaire ou pas',
  'IPTV bouquet sportif complet',
  'Best IPTV service USA 2026',
  'IPTV for Premier League',
  'IPTV Spanish channels',
  'IPTV Arabic channels Europe',
  'IPTV Deutschland 2026',
  'IPTV Nederlands beste aanbieder',
  'IPTV para ver fútbol español',
  'IPTV Morocco Maroc chaînes',
  'IPTV Algeria Algérie',
  'IPTV Africa bouquets',
]

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function detectLang(topic) {
  if (/[éèêëàâîïôûùçœæ]/i.test(topic)) return 'fr'
  if (/[äöüß]/i.test(topic)) return 'de'
  if (/[éíóúñ]/i.test(topic)) return 'es'
  if (/[àèéìòù]/i.test(topic) && /[^a-z]/i.test(topic)) return 'it'
  if (/[\u0600-\u06FF]/.test(topic)) return 'ar'
  if (/[ğüşıöç]/i.test(topic)) return 'tr'
  return 'en'
}

// GET /api/blogs/topics — return available topics
router.get('/topics', (req, res) => {
  res.json(SEO_TOPICS.map(t => ({ topic: t, lang: detectLang(t), slug: slugify(t) })))
})

// GET /api/blogs/websites — list all websites
router.get('/websites', (req, res) => {
  const db = getDb()
  const sites = db.prepare('SELECT * FROM websites ORDER BY name').all()
  res.json(sites)
})

// POST /api/blogs/websites — add website
router.post('/websites', (req, res) => {
  const db = getDb()
  const { name, domain, slug, site_name, language } = req.body
  if (!name || !domain || !slug) return res.status(400).json({ error: 'name, domain, slug required' })
  try {
    db.prepare('INSERT INTO websites (name, domain, slug, site_name, language) VALUES (?, ?, ?, ?, ?)')
      .run(name, domain, slug, site_name || name, language || 'fr')
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// PUT /api/blogs/websites/:id
router.put('/websites/:id', (req, res) => {
  const db = getDb()
  const { name, domain, slug, site_name, language } = req.body
  try {
    db.prepare('UPDATE websites SET name=?, domain=?, slug=?, site_name=?, language=?, updated_at=datetime("now") WHERE id=?')
      .run(name, domain, slug, site_name, language, req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// DELETE /api/blogs/websites/:id
router.delete('/websites/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM blog_posts WHERE website_id = ?').run(req.params.id)
  db.prepare('DELETE FROM websites WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/blogs/websites/:id/posts — list posts for website
router.get('/websites/:id/posts', (req, res) => {
  const db = getDb()
  const posts = db.prepare('SELECT id, slug, title, excerpt, language, topic, published, created_at, updated_at FROM blog_posts WHERE website_id = ? ORDER BY created_at DESC').all(req.params.id)
  res.json(posts)
})

// GET /api/blogs/websites/:id/posts/:postId
router.get('/websites/:id/posts/:postId', (req, res) => {
  const db = getDb()
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ? AND website_id = ?').get(req.params.postId, req.params.id)
  if (!post) return res.status(404).json({ error: 'Not found' })
  res.json(post)
})

// DELETE /api/blogs/websites/:id/posts/:postId
router.delete('/websites/:id/posts/:postId', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM blog_posts WHERE id = ? AND website_id = ?').run(req.params.postId, req.params.id)
  res.json({ ok: true })
})

// PUT /api/blogs/websites/:id/posts/:postId — toggle publish / update
router.put('/websites/:id/posts/:postId', (req, res) => {
  const db = getDb()
  const { published, title, excerpt, content } = req.body
  if (published !== undefined) {
    db.prepare('UPDATE blog_posts SET published = ?, updated_at = datetime("now") WHERE id = ? AND website_id = ?')
      .run(published ? 1 : 0, req.params.postId, req.params.id)
  } else {
    db.prepare('UPDATE blog_posts SET title=?, excerpt=?, content=?, updated_at=datetime("now") WHERE id=? AND website_id=?')
      .run(title, excerpt, content, req.params.postId, req.params.id)
  }
  res.json({ ok: true })
})

// POST /api/blogs/websites/:id/generate — generate one article from topic
router.post('/websites/:id/generate', async (req, res) => {
  const db = getDb()
  const { topic } = req.body
  if (!topic) return res.status(400).json({ error: 'topic required' })

  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id)
  if (!website) return res.status(404).json({ error: 'Website not found' })

  const slug = slugify(topic)
  const existing = db.prepare('SELECT id FROM blog_posts WHERE website_id = ? AND slug = ?').get(req.params.id, slug)
  if (existing) return res.json({ slug, existing: true })

  const lang = detectLang(topic)
  const siteName = website.site_name || website.name
  const domain = website.domain

  let prompt
  if (lang === 'fr') {
    prompt = `Rédige un article de blog complet et bien structuré en HTML sur le thème : "${topic}"

Exigences :
- Titre en H1 optimisé SEO
- Au moins 500 mots
- Inclus des sous-titres H2, H3
- Listes à puces si approprié
- Sois informatif, authentique, avec des exemples concrets
- Termine par un CTA invitant à essayer un essai gratuit sur ${siteName} (${domain})
- Utilise HTML pour la mise en forme mais ne mets PAS de balises <html> ou <body>
- Écris en FRANÇAIS uniquement
- Sois naturel, pas commercial
- Chaque paragraphe doit pouvoir se lire indépendamment`
  } else {
    prompt = `Write a comprehensive, well-structured blog article in HTML format about: "${topic}"

Requirements:
- Title as H1 optimized for SEO
- At least 500 words
- Include H2, H3 subheadings
- Bullet points where appropriate
- Be informative, authentic, with real examples
- End with a CTA to try a free trial at ${siteName} (${domain})
- Output ONLY the HTML content (no <html><body> tags)
- Write in a natural, non-salesy tone
- Each paragraph should be self-contained`
  }

  try {
    const result = await generate(prompt, { provider: 'groq', maxTokens: 3072, temperature: 0.7, timeout: 180000 })
    const html = typeof result === 'string' ? result : (result.text || result.response || '')
    if (!html || html.length < 200) throw new Error(`Article too short (${html.length} chars)`)

    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : topic
    const cleanText = html.replace(/<[^>]+>/g, '').trim()
    const excerpt = cleanText.substring(0, 200).replace(/\s+\S*$/, '') + '...'
    const keywords = topic.split(/[\s,]+/).filter(w => w.length > 2)

    db.prepare(`
      INSERT INTO blog_posts (website_id, slug, title, excerpt, content, language, keywords, topic, published, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(req.params.id, slug, title, excerpt, html, lang, JSON.stringify(keywords), topic)

    res.json({ slug, existing: false, title, chars: html.length })
  } catch (e) {
    res.status(500).json({ error: e.message, topic })
  }
})

// POST /api/blogs/websites/:id/generate-all — generate all missing topics
router.post('/websites/:id/generate-all', async (req, res) => {
  const db = getDb()
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id)
  if (!website) return res.status(404).json({ error: 'Website not found' })

  const results = []
  for (const topic of SEO_TOPICS) {
    const slug = slugify(topic)
    const existing = db.prepare('SELECT id FROM blog_posts WHERE website_id = ? AND slug = ?').get(req.params.id, slug)
    if (existing) {
      results.push({ topic, slug, existing: true })
      continue
    }

    try {
      const lang = detectLang(topic)
      const siteName = website.site_name || website.name
      const domain = website.domain

      let prompt
      if (lang === 'fr') {
        prompt = `Rédige un article de blog complet et bien structuré en HTML sur le thème : "${topic}"

Exigences :
- Titre en H1 optimisé SEO
- Au moins 500 mots
- Inclus des sous-titres H2, H3
- Listes à puces si approprié
- Sois informatif, authentique, avec des exemples concrets
- Termine par un CTA invitant à essayer un essai gratuit sur ${siteName} (${domain})
- Utilise HTML pour la mise en forme mais ne mets PAS de balises <html> ou <body>
- Écris en FRANÇAIS uniquement
- Sois naturel, pas commercial`
      } else {
        prompt = `Write a comprehensive, well-structured blog article in HTML format about: "${topic}"

Requirements:
- Title as H1 optimized for SEO
- At least 500 words
- Include H2, H3 subheadings
- Bullet points where appropriate
- Be informative, authentic, with real examples
- End with a CTA to try a free trial at ${siteName} (${domain})
- Output ONLY the HTML content (no <html><body> tags)
- Write in natural language
- Each paragraph should be self-contained`
      }

    const result = await generate(prompt, { provider: 'groq', maxTokens: 3072, temperature: 0.7, timeout: 180000 })
      const html = typeof result === 'string' ? result : (result.text || result.response || '')
      if (!html || html.length < 200) throw new Error(`Short article (${html.length}c)`)

      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : topic
      const cleanText = html.replace(/<[^>]+>/g, '').trim()
      const excerpt = cleanText.substring(0, 200).replace(/\s+\S*$/, '') + '...'
      const keywords = topic.split(/[\s,]+/).filter(w => w.length > 2)

      db.prepare(`
        INSERT INTO blog_posts (website_id, slug, title, excerpt, content, language, keywords, topic, published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(req.params.id, slug, title, excerpt, html, lang, JSON.stringify(keywords), topic)

      results.push({ topic, slug, existing: false, chars: html.length })
    } catch (e) {
      results.push({ topic, slug, error: e.message })
    }

    // Small delay between generations
    await new Promise(r => setTimeout(r, 2000))
  }

  const generated = results.filter(r => !r.existing && !r.error).length
  const failed = results.filter(r => r.error).length
  res.json({ generated, failed, total: results.length, results })
})

module.exports = router