const { getDb } = require('../db')
const { google } = require('@googleapis/youtube')
const fs = require('fs')
const path = require('path')

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtubepartner'
]

function getOAuth2Client() {
  const db = getDb()
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'social_apis'").get()
  if (!raw) throw new Error('Social APIs not configured')
  const apis = JSON.parse(raw.value)
  const yt = apis.youtube
  if (!yt.clientId || !yt.clientSecret) throw new Error('YouTube OAuth credentials not set')
  const oauth2Client = new google.auth.OAuth2(
    yt.clientId,
    yt.clientSecret,
    yt.redirectUri || `${getBaseUrl()}/api/youtube/oauth/callback`
  )
  return { oauth2Client, apis: yt }
}

function getBaseUrl() {
  const db = getDb()
  const domain = db.prepare("SELECT value FROM app_settings WHERE key = 'site_domain'").get()
  return domain ? `https://${domain.value}` : 'http://localhost:3002'
}

async function getAuthUrl() {
  const { oauth2Client } = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })
}

async function handleOAuthCallback(code) {
  const { oauth2Client } = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
  const me = await youtube.channels.list({ part: ['id', 'snippet', 'statistics'], mine: true })
  const channel = me.data.items?.[0]
  if (!channel) throw new Error('No YouTube channel found for this account')

  const db = getDb()
  const existing = db.prepare("SELECT id FROM yt_channels WHERE channel_id = ?").get(channel.id)
  if (existing) {
    db.prepare("UPDATE yt_channels SET access_token = ?, refresh_token = ?, title = ?, token_expires_at = ?, is_active = 1 WHERE id = ?")
      .run(tokens.access_token, tokens.refresh_token || '', channel.snippet?.title || '', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, existing.id)
  } else {
    db.prepare("INSERT INTO yt_channels (channel_id, title, access_token, refresh_token, token_expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(channel.id, channel.snippet?.title || '', tokens.access_token, tokens.refresh_token || '', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null)
  }
  return { channelId: channel.id, title: channel.snippet?.title, subscriberCount: channel.statistics?.subscriberCount }
}

async function getAuthenticatedClient(channelId) {
  const db = getDb()
  const channel = channelId
    ? db.prepare("SELECT * FROM yt_channels WHERE channel_id = ? AND is_active = 1").get(channelId)
    : db.prepare("SELECT * FROM yt_channels WHERE is_active = 1 ORDER BY id DESC LIMIT 1").get()
  if (!channel) throw new Error('No YouTube channel connected')

  const { oauth2Client } = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: channel.access_token,
    refresh_token: channel.refresh_token
  })

  if (oauth2Client.isTokenExpiring()) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    db.prepare("UPDATE yt_channels SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE channel_id = ?")
      .run(credentials.access_token, credentials.refresh_token || channel.refresh_token,
        credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null, channel.channel_id)
    oauth2Client.setCredentials(credentials)
  }

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
  return { youtube, channel, oauth2Client }
}

async function getChannels() {
  const db = getDb()
  return db.prepare("SELECT * FROM yt_channels WHERE is_active = 1 ORDER BY created_at DESC").all()
}

async function disconnectChannel(channelId) {
  const db = getDb()
  db.prepare("UPDATE yt_channels SET is_active = 0 WHERE channel_id = ?").run(channelId)
}

async function uploadVideo(channelId, { filePath: videoPath, title, description, tags, privacyStatus, categoryId, thumbnailPath }) {
  const { youtube } = await getAuthenticatedClient(channelId)
  const fileSize = fs.statSync(videoPath).size

  const requestBody = {
    snippet: {
      title: title || 'Untitled Video',
      description: description || '',
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
      categoryId: categoryId || '22',
      defaultLanguage: 'en',
      defaultAudioLanguage: 'en'
    },
    status: {
      privacyStatus: privacyStatus || 'private',
      selfDeclaredMadeForKids: false
    }
  }

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody,
    media: { body: fs.createReadStream(videoPath) }
  })

  const video = res.data

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId: video.id,
        media: { body: fs.createReadStream(thumbnailPath) }
      })
    } catch (e) { /* thumbnail optional */ }
  }

  const db = getDb()
  const channel = await getAuthenticatedClient(channelId)
  const channelRec = channel.channel
  db.prepare(`INSERT INTO yt_videos (channel_id, youtube_id, title, description, tags, privacy_status, thumbnail_path, views, likes, comments_count, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`)
    .run(channelRec.id, video.id, video.snippet?.title || title, video.snippet?.description || description,
      JSON.stringify(video.snippet?.tags || []), video.status?.privacyStatus || privacyStatus,
      thumbnailPath || '', new Date().toISOString())

  return { youtubeId: video.id, title: video.snippet?.title, privacyStatus: video.status?.privacyStatus }
}

async function uploadFromUrl(channelId, { url, title, description, tags, privacyStatus, categoryId }) {
  const tmpDir = path.join(__dirname, '..', '..', 'data', 'tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const ext = path.extname(new URL(url).pathname) || '.mp4'
  const tmpFile = path.join(tmpDir, `yt_upload_${Date.now()}${ext}`)

  const res = await fetch(url, { signal: AbortSignal.timeout(600000) })
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(tmpFile, buffer)

  try {
    const result = await uploadVideo(channelId, {
      filePath: tmpFile, title, description, tags, privacyStatus, categoryId
    })
    return result
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (e) { /* cleanup */ }
  }
}

async function uploadFromBuffer(channelId, { buffer, fileName, title, description, tags, privacyStatus, categoryId }) {
  const tmpDir = path.join(__dirname, '..', '..', 'data', 'tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const ext = path.extname(fileName) || '.mp4'
  const tmpFile = path.join(tmpDir, `yt_upload_${Date.now()}${ext}`)
  fs.writeFileSync(tmpFile, buffer)

  try {
    const result = await uploadVideo(channelId, {
      filePath: tmpFile, title, description, tags, privacyStatus, categoryId
    })
    return result
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (e) { /* cleanup */ }
  }
}

async function listVideos(channelId) {
  const db = getDb()
  if (channelId) {
    const channel = db.prepare("SELECT id FROM yt_channels WHERE channel_id = ?").get(channelId)
    if (!channel) return []
    return db.prepare("SELECT * FROM yt_videos WHERE channel_id = ? ORDER BY uploaded_at DESC LIMIT 50").all(channel.id)
  }
  return db.prepare("SELECT * FROM yt_videos ORDER BY uploaded_at DESC LIMIT 50").all()
}

async function syncVideoStats(channelId) {
  const db = getDb()
  const videos = channelId
    ? db.prepare("SELECT yv.*, yc.channel_id as yt_channel_id FROM yt_videos yv JOIN yt_channels yc ON yv.channel_id = yc.id WHERE yc.channel_id = ? AND yv.youtube_id IS NOT NULL").all(channelId)
    : db.prepare("SELECT yv.*, yc.channel_id as yt_channel_id FROM yt_videos yv JOIN yt_channels yc ON yv.channel_id = yc.id WHERE yv.youtube_id IS NOT NULL").all()

  for (const video of videos) {
    try {
      const { youtube } = await getAuthenticatedClient(video.yt_channel_id)
      const res = await youtube.videos.list({
        part: ['statistics', 'snippet'],
        id: [video.youtube_id]
      })
      const item = res.data.items?.[0]
      if (item) {
        const stats = item.statistics || {}
        db.prepare("UPDATE yt_videos SET views = ?, likes = ?, comments_count = ?, title = ?, last_synced = ? WHERE id = ?")
          .run(
            parseInt(stats.viewCount) || 0, parseInt(stats.likeCount) || 0,
            parseInt(stats.commentCount) || 0, item.snippet?.title || video.title,
            new Date().toISOString(), video.id
          )
      }
    } catch (e) { /* skip failed syncs */ }
  }
  return true
}

async function listComments(videoId, channelId) {
  const { youtube } = await getAuthenticatedClient(channelId)
  const res = await youtube.commentThreads.list({
    part: ['snippet', 'replies'],
    videoId,
    maxResults: 50,
    order: 'time'
  })
  return res.data.items || []
}

async function replyToComment(channelId, commentId, text) {
  const { youtube } = await getAuthenticatedClient(channelId)
  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId: commentId,
        textOriginal: text
      }
    }
  })
  const db = getDb()
  const vid = db.prepare(`SELECT yv.id FROM yt_videos yv
    JOIN yt_comments yc ON yc.video_id = yv.id
    WHERE yc.youtube_comment_id = ?`).get(commentId)
  if (vid) {
    db.prepare("UPDATE yt_comments SET is_replied = 1, reply_text = ? WHERE youtube_comment_id = ?")
      .run(text, commentId)
  }
  return res.data
}

async function moderateComment(channelId, commentId, action) {
  const { youtube } = await getAuthenticatedClient(channelId)
  const statusMap = { approve: 'published', hide: 'heldForReview', spam: 'likelySpam', reject: 'rejected' }
  const moderationStatus = statusMap[action]
  if (!moderationStatus) throw new Error(`Invalid action: ${action}`)

  await youtube.comments.setModerationStatus({
    id: commentId,
    moderationStatus
  })

  const db = getDb()
  db.prepare("UPDATE yt_comments SET moderation_status = ? WHERE youtube_comment_id = ?")
    .run(moderationStatus, commentId)

  return { commentId, moderationStatus }
}

async function fetchAndStoreComments(channelId, videoYoutubeId) {
  const db = getDb()
  const video = db.prepare("SELECT * FROM yt_videos WHERE youtube_id = ?").get(videoYoutubeId)
  if (!video) throw new Error('Video not found in database')

  const comments = await listComments(videoYoutubeId, channelId)
  let count = 0
  for (const item of comments) {
    const snippet = item.snippet?.topLevelComment?.snippet || {}
    const commentId = item.id
    if (!commentId) continue
    try {
      db.prepare(`INSERT OR IGNORE INTO yt_comments
        (video_id, youtube_comment_id, parent_comment_id, author, author_channel_url, text, moderation_status, published_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        video.id, commentId, '', snippet.authorDisplayName || '',
        snippet.authorChannelUrl || '', snippet.textDisplay || '',
        snippet.moderationStatus || 'published',
        snippet.publishedAt || new Date().toISOString(), new Date().toISOString()
      )
      count++
    } catch (e) { /* skip duplicates */ }

    if (item.replies?.comments) {
      for (const reply of item.replies.comments) {
        const rs = reply.snippet || {}
        try {
          db.prepare(`INSERT OR IGNORE INTO yt_comments
            (video_id, youtube_comment_id, parent_comment_id, author, author_channel_url, text, moderation_status, published_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            video.id, reply.id, commentId, rs.authorDisplayName || '',
            rs.authorChannelUrl || '', rs.textDisplay || '',
            rs.moderationStatus || 'published',
            rs.publishedAt || new Date().toISOString(), new Date().toISOString()
          )
          count++
        } catch (e) { /* skip duplicates */ }
      }
    }
  }
  db.prepare("UPDATE yt_videos SET comments_count = ?, last_synced = ? WHERE id = ?").run(count, new Date().toISOString(), video.id)
  return { stored: count, total: comments.length }
}

async function getStoredComments(videoId, moderationFilter) {
  const db = getDb()
  let query = "SELECT yc.*, yv.youtube_id as video_youtube_id, yv.title as video_title FROM yt_comments yc JOIN yt_videos yv ON yc.video_id = yv.id WHERE yv.youtube_id = ?"
  const params = [videoId]
  if (moderationFilter) {
    query += " AND yc.moderation_status = ?"
    params.push(moderationFilter)
  }
  query += " ORDER BY yc.published_at DESC LIMIT 100"
  return db.prepare(query).all(...params)
}

module.exports = {
  getAuthUrl, handleOAuthCallback, getChannels, disconnectChannel,
  uploadVideo, uploadFromUrl, uploadFromBuffer,
  listVideos, syncVideoStats,
  listComments, replyToComment, moderateComment,
  fetchAndStoreComments, getStoredComments
}
