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
      intent_score INTEGER DEFAULT 0,
      intent_label TEXT,
      status TEXT DEFAULT 'new',
      notes TEXT,
      raw_data TEXT,
      imported_from TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  }
}

module.exports = { getDb }
