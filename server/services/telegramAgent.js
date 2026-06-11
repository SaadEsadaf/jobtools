const { getDb } = require('../db')

const OFFERS = {
  en: {
    trial: "🎁 Free 24h IPTV trial! 34,000+ channels, 4K quality, all sports events.\n👉 Reply for your free credentials instantly!",
    worldcup: "🏆 Watch World Cup 2026 in 4K! Free 24h trial available.\n👉 Reply to claim yours!",
    premium: "🚀 Premium IPTV: 34K channels, 4K, all sports & VOD. From €9.99.\n👉 Free trial available — reply to start!",
  },
  fr: {
    trial: "🎁 Essai gratuit IPTV 24h ! 34 000+ chaînes, qualité 4K, tous les sports.\n👉 Répondez pour recevoir vos identifiants !",
    worldcup: "🏆 Coupe du Monde 2026 en 4K ! Essai gratuit 24h disponible.\n👉 Répondez pour le réclamer !",
    premium: "🚀 IPTV Premium : 34K chaînes, 4K, tous sports & VOD. À partir de 9.99€.\n👉 Essai gratuit disponible — répondez !",
  },
  ar: {
    trial: "🎁 تجربة مجانية IPTV لمدة 24 ساعة! أكثر من 34,000 قناة، جودة 4K.\n👉 رد للحصول على بيانات الدخول مجانًا!",
    worldcup: "🏆 كأس العالم 2026 بجودة 4K! تجربة مجانية 24 ساعة.\n👉 رد للحصول عليها!",
    premium: "🚀 IPTV بريميوم: 34K قناة، 4K، جميع الرياضات. من 9.99€.\n👉 تجربة مجانية متاحة — رد للبدء!",
  },
  es: {
    trial: "🎁 ¡Prueba gratuita IPTV 24h! 34,000+ canales, calidad 4K.\n👉 ¡Responde para tus credenciales gratis!",
    premium: "🚀 IPTV Premium: 34K canales, 4K, deportes & VOD. Desde 9.99€.\n👉 Prueba gratis disponible — responde!",
  },
}

function detectLanguage(text) {
  if (!text) return 'en'
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[éèêëàâîïôûùçœæ]/i.test(text)) return 'fr'
  if (/[éíóúñ¿¡]/i.test(text)) return 'es'
  return 'en'
}

function getKeywords() {
  return {
    looking: ['iptv', 'iptv service', 'best iptv', 'iptv provider', 'good iptv', 'cheap iptv', 'recommend iptv', 'looking for iptv', 'need iptv', 'want iptv', 'iptv subscription', 'iptv trial', 'free iptv', 'iptv channel', 'streaming iptv', 'iptv france', 'iptv arabic', 'iptv deutschland', 'iptv españa', 'iptv brasil', 'iptv italia', 'iptv nederlands'],
    buying: ['buy iptv', 'purchase iptv', 'subscribe iptv', 'pay iptv', 'iptv price', 'iptv cost', 'iptv plan', 'premium iptv', 'iptv 4k'],
    problems: ['iptv not working', 'iptv buffering', 'iptv down', 'need new iptv', 'replace iptv', 'better iptv', 'iptv alternative', 'current iptv'],
  }
}

function isQuestion(text) {
  const questions = ['?', 'looking', 'need', 'want', 'recommend', 'best', 'good', 'cheap', 'trial', 'free', 'suggest', 'know any', 'where', 'how', 'which', 'please help']
  const lower = (text || '').toLowerCase()
  return questions.some(q => lower.includes(q))
}

function buildReply(lead, offerKey = 'trial') {
  const lang = lead.language || detectLanguage(lead.content || '')
  const offer = OFFERS[lang] || OFFERS.en
  return offer[offerKey] || offer.trial
}

async function postToTelegramGroup(botToken, groupName, message) {
  if (!botToken || !groupName) return { sent: false, reason: 'missing_params' }
  try {
    const axios = require('axios')
    const cleanGroup = groupName.replace('@', '')
    const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: `@${cleanGroup}`,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, { timeout: 15000 })
    return { sent: true, ok: res.data?.ok }
  } catch (e) {
    return { sent: false, reason: e.message }
  }
}

async function findAndReply(botToken) {
  if (!botToken) return { replies: 0, reason: 'no_bot_token' }
  const db = getDb()
  const axios = require('axios')
  let replies = 0

  // Get recent messages from groups the bot is in
  try {
    const updates = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      params: { timeout: 5, limit: 100, allowed_updates: ['message'] },
      timeout: 10000,
    })

    const messages = updates.data?.result || []
    const processed = new Set()

    for (const update of messages) {
      const msg = update.message
      if (!msg?.text) continue
      const chatId = msg.chat?.id
      const chatTitle = msg.chat?.title || msg.chat?.username || String(chatId)
      const text = msg.text
      const fromId = msg.from?.id
      const fromName = msg.from?.first_name || msg.from?.username || 'User'
      const msgId = update.update_id

      // Avoid duplicates
      if (processed.has(msgId)) continue
      processed.add(msgId)
      if (processed.size > 50) break

      // Check if it's a question about IPTV
      const lower = text.toLowerCase()
      const keywords = getKeywords()
      const isIptvRelated = [...keywords.looking, ...keywords.buying, ...keywords.problems].some(k => lower.includes(k))

      if (!isIptvRelated && !isQuestion(text)) continue

      // Check if we already replied to this user in the last 7 days
      const alreadyReplied = db.prepare(`
        SELECT id FROM injection_log WHERE target = ? AND created_at > datetime('now', '-7 days')
      `).get(String(fromId))
      if (alreadyReplied) continue

      // Determine language and offer
      const lang = detectLanguage(text)
      const isBuyingKeyword = keywords.buying.some(k => lower.includes(k))
      const hasProblem = keywords.problems.some(k => lower.includes(k))

      let offerKey = 'trial'
      if (isBuyingKeyword) offerKey = 'premium'
      if (hasProblem) offerKey = 'trial'

      const reply = OFFERS[lang]?.[offerKey] || OFFERS.en[offerKey]

      try {
        // Send DM to the user
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: fromId,
          text: reply,
          parse_mode: 'HTML',
        }, { timeout: 10000 })
        replies++

        // Log the reply
        db.prepare(`
          INSERT INTO injection_log (injection_type, target, status, details, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run('telegram_dm', String(fromId), 'sent', `Replied to ${fromName} in ${chatTitle}: "${text.substring(0, 80)}..."`)

        // Create a lead entry
        const existing = db.prepare('SELECT id FROM leads WHERE username = ? AND source = ?').get(String(fromId), 'telegram_dm')
        if (!existing) {
          db.prepare(`
            INSERT INTO leads (source, username, language, content, intent_score, status, created_at, notes)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
          `).run('telegram_dm', fromName || String(fromId), lang, text, hasProblem ? 70 : isBuyingKeyword ? 85 : 60, 'contacted', `Replied with ${offerKey} offer`)

          // Bridge to IPTV Boss
          try {
            const { notifyIptvBoss } = require('./brainBridge')
            await notifyIptvBoss('new_telegram_lead', {
              username: fromName || String(fromId),
              chat: chatTitle,
              message: text.substring(0, 500),
              language: lang,
              intent_score: hasProblem ? 70 : isBuyingKeyword ? 85 : 60,
              reply_sent: reply.substring(0, 100),
            })
          } catch {}
        }

        // Wait between replies to avoid rate limits
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) {
        console.error('DM failed:', e.message)
      }
    }
  } catch (e) {
    console.error('Telegram poll error:', e.message)
  }

  return { replies, groupsChecked: 1 }
}

async function runGroupCampaign(botToken) {
  if (!botToken) return { posted: 0, reason: 'no_bot_token' }
  const db = getDb()

  // Get unique Telegram groups from leads
  const groups = db.prepare(`
    SELECT DISTINCT username as group_name FROM leads 
    WHERE source = 'telegram' AND username IS NOT NULL AND username != ''
    ORDER BY COUNT(*) DESC
  `).all()

  let posted = 0
  const offerKeys = ['trial', 'worldcup', 'premium']
  const hour = new Date().getHours()

  for (const group of groups) {
    const groupName = group.group_name
    // Check if we posted to this group recently
    const recentPost = db.prepare(`
      SELECT id FROM injection_log 
      WHERE target_id = ? AND created_at > datetime('now', '-24 hours')
    `).get(groupName)
    if (recentPost) continue

    // Rotate offers
    const offerKey = offerKeys[posted % offerKeys.length]
    const message = OFFERS.en[offerKey]

    const result = await postToTelegramGroup(botToken, groupName, message)
    if (result.sent) {
      db.prepare(`
        INSERT INTO injection_log (injection_type, target, status, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run('telegram_group', groupName, 'sent', `Posted ${offerKey} offer`)
      posted++
      await new Promise(r => setTimeout(r, 5000)) // 5s between posts
    }
    if (posted >= 5) break // Max 5 posts per cycle
  }

  return { posted, totalGroups: groups.length }
}

module.exports = { findAndReply, runGroupCampaign, postToTelegramGroup, buildReply, OFFERS }