const Database = require('better-sqlite3')
const path = require('path')
const bcrypt = require('bcryptjs')

let db

function getDb() {
  if (!db) {
    const dbPath = path.join(__dirname, '..', 'data', 'jobtools.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate()
    seed()
  }
  return db
}

function migrate() {
  try { db.exec("ALTER TABLE leads ADD COLUMN content TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN campaign_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN country TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN pain_point TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN opportunity TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN source_url TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN platform TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN source_name TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE leads ADD COLUMN phone TEXT"); } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      language TEXT,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT,
      content TEXT,
      name TEXT,
      campaign_name TEXT,
      country TEXT,
      pain_point TEXT,
      opportunity TEXT,
      source_url TEXT,
      platform TEXT,
      intent_score INTEGER DEFAULT 0,
      intent_label TEXT,
      status TEXT DEFAULT 'new',
      notes TEXT,
      raw_data TEXT,
      imported_from TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sniffer_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      query TEXT,
      enabled INTEGER DEFAULT 1,
      lead_count INTEGER DEFAULT 0,
      sniff_count INTEGER DEFAULT 0,
      last_sniffed DATETIME,
      discovered_by TEXT DEFAULT 'seed',
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, name)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT,
      status TEXT DEFAULT 'draft',
      target_source TEXT,
      target_language TEXT,
      target_intent TEXT,
      template_id INTEGER,
      scheduled_at DATETIME,
      executed_at DATETIME,
      results TEXT,
      notified_to_brain INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      meta TEXT,
      is_active INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS injection_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER,
      campaign_id INTEGER,
      injection_type TEXT,
      target TEXT,
      status TEXT DEFAULT 'pending',
      details TEXT,
      notified_to_brain INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      content TEXT,
      platform TEXT,
      status TEXT DEFAULT 'pending',
      campaign_id INTEGER,
      posted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS brain_bridge_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT,
      payload TEXT,
      response TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT NOT NULL,
      platform TEXT NOT NULL,
      action_type TEXT DEFAULT 'post',
      params TEXT,
      scheduled_at DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      campaign_id INTEGER,
      ai_generated INTEGER DEFAULT 0,
      provider_used TEXT,
      result TEXT,
      posted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      model TEXT,
      prompt_length INTEGER,
      response_length INTEGER,
      duration_ms INTEGER,
      success INTEGER DEFAULT 1,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      site_name TEXT DEFAULT '',
      language TEXT DEFAULT 'fr',
      logo_url TEXT DEFAULT '',
      settings TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      content TEXT DEFAULT '',
      language TEXT DEFAULT 'fr',
      keywords TEXT DEFAULT '[]',
      topic TEXT DEFAULT '',
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (website_id) REFERENCES websites(id),
      UNIQUE(website_id, slug)
    );

    CREATE TABLE IF NOT EXISTS ad_platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      account_name TEXT DEFAULT '',
      account_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT DEFAULT '',
      token_expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      meta TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_id TEXT,
      platform_account_id TEXT,
      name TEXT NOT NULL,
      objective TEXT,
      status TEXT DEFAULT 'PAUSED',
      daily_budget TEXT,
      currency TEXT DEFAULT 'USD',
      insights TEXT DEFAULT '{}',
      last_synced DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS yt_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE,
      title TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      refresh_token TEXT DEFAULT '',
      token_expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS yt_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER REFERENCES yt_channels(id),
      youtube_id TEXT UNIQUE,
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      privacy_status TEXT DEFAULT 'private',
      thumbnail_path TEXT DEFAULT '',
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      uploaded_at DATETIME,
      last_synced DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS yt_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER REFERENCES yt_videos(id),
      youtube_comment_id TEXT UNIQUE,
      parent_comment_id TEXT DEFAULT '',
      author TEXT DEFAULT '',
      author_channel_url TEXT DEFAULT '',
      text TEXT DEFAULT '',
      moderation_status TEXT DEFAULT 'published',
      is_replied INTEGER DEFAULT 0,
      reply_text TEXT DEFAULT '',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS landing_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id),
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      keyword TEXT,
      audience TEXT,
      html_content TEXT NOT NULL,
      language TEXT DEFAULT 'fr',
      active INTEGER DEFAULT 1,
      provider_id INTEGER,
      plan_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(website_id, slug)
    );

    CREATE TABLE IF NOT EXISTS demand_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id),
      keyword TEXT,
      source TEXT,
      language TEXT,
      content TEXT,
      pain_point TEXT,
      opportunity TEXT,
      intent_score INTEGER DEFAULT 0,
      intent_label TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seo_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER REFERENCES websites(id),
      run_type TEXT,
      action TEXT,
      keyword TEXT,
      details TEXT,
      result TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT,
      action TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash)
  }
  const brainUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()
  if (!brainUrl) {
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").run('iptv_boss_url', 'http://localhost:3001')
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").run('iptv_boss_token', '')
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").run('site_domain', 'dalletek.live')
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").run('payment_engine_url', process.env.PAYMENT_ENGINE_URL || 'http://localhost:3004')
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").run('internal_api_secret', process.env.INTERNAL_API_SECRET || 'dev-secret-change-in-production')
  }
  // Seed default website if none exists
  const existing = db.prepare('SELECT COUNT(*) as c FROM websites').get().c
  if (existing === 0) {
    db.prepare("INSERT INTO websites (name, domain, slug, site_name, language) VALUES (?, ?, ?, ?, ?)")
      .run('Dalletek', 'dalletek.live', 'dalletek', 'Dalletek', 'fr')
  }
}

module.exports = { getDb }
