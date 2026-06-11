const { getDb } = require('../db')

let interval = null

function startScheduler(intervalMs = 60000) {
  if (interval) clearInterval(interval)
  interval = setInterval(checkAndPost, intervalMs)
  console.log(`[Scheduler] Started, checking every ${intervalMs}ms`)
  checkAndPost()
}

function stopScheduler() {
  if (interval) { clearInterval(interval); interval = null }
}

let telegramRunCount = 0

async function checkAndPost() {
  const db = getDb()
  const now = new Date().toISOString()

  // Run Telegram agent periodically
  telegramRunCount++
  try {
    const botToken = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegram_bot_token'").get() || {}).value
    // Skip if token looks like OpenAI key (sk-...) or is invalid format
    const isValidTelegramToken = botToken && /^\d+:[\w-]+$/.test(botToken)
    if (isValidTelegramToken) {
      const { findAndReply, runGroupCampaign } = require('./telegramAgent')

      // Reply to questions every 1 minute
      const replies = await findAndReply(botToken)
      if (replies.replies > 0) console.log(`[Telegram] ${replies.replies} replies sent`)

      // Post offers to groups every 60 runs (~1 hour at 60s interval)
      if (telegramRunCount % 60 === 0) {
        const campaign = await runGroupCampaign(botToken)
        if (campaign.posted > 0) console.log(`[Telegram] ${campaign.posted} group posts sent`)
      }
    }
  } catch (e) {
    console.error('[Telegram] Agent error:', e.message)
  }

  // Original scheduled post logic
  const due = db.prepare(`
    SELECT * FROM scheduled_posts
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
    LIMIT 5
  `).all(now)

  for (const post of due) {
    try {
      await executePost(post)
      db.prepare('UPDATE scheduled_posts SET status = ?, posted_at = ? WHERE id = ?')
        .run('posted', new Date().toISOString(), post.id)
      console.log(`[Scheduler] Posted #${post.id} to ${post.platform}`)
    } catch (err) {
      db.prepare('UPDATE scheduled_posts SET status = ?, result = ? WHERE id = ?')
        .run('failed', err.message, post.id)
      console.error(`[Scheduler] Failed #${post.id}: ${err.message}`)
    }
  }
}

async function executePost(post) {
  let params = {}
  try { params = JSON.parse(post.params || '{}') } catch { params = {} }

  const { postToReddit, postToFacebook, postToYoutube } = require('./socialPublisher')
  const { generate } = require('./aiProvider')

  let content = post.content

  // If content is a template with AI generation marker, expand it
  if (content.startsWith('AI:')) {
    const prompt = content.substring(3)
    content = await generate(prompt, { timeout: 60000, provider: 'ollama' })
  }

  switch (post.platform) {
    case 'reddit':
      return await postToReddit(post.action_type, { ...params, text: content })
    case 'facebook':
      return await postToFacebook(post.action_type, { ...params, message: content })
    case 'youtube':
      return await postToYoutube(post.action_type, { ...params, text: content })
    default:
      throw new Error(`Unsupported platform: ${post.platform}`)
  }
}

module.exports = { startScheduler, stopScheduler }
