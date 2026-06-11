const { getDb } = require('../db')

function loadProviders() {
  const db = getDb()
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_providers'").get()
  if (!raw) return getDefaultProviders()
  try { return JSON.parse(raw.value) } catch { return getDefaultProviders() }
}

function saveProviders(providers) {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('ai_providers', ?)").run(JSON.stringify(providers))
}

function getDefaultProviders() {
  return {
    ollama: { enabled: true, url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434', model: 'llama3.1:8b-instruct-q8_0', type: 'local' },
    openai: { enabled: false, apiKey: '', model: 'gpt-4o-mini', type: 'paid' },
    gemini: { enabled: false, apiKey: '', model: 'gemini-2.0-flash', type: 'free' },
    groq: { enabled: false, apiKey: '', model: 'mixtral-8x7b-32768', type: 'free' },
    claude: { enabled: false, apiKey: '', model: 'claude-3-haiku-20240307', type: 'paid' },
    deepseek: { enabled: false, apiKey: '', model: 'deepseek-chat', type: 'free' },
    mistral: { enabled: false, apiKey: '', model: 'mistral-small-latest', type: 'free' }
  }
}

async function generate(prompt, options = {}) {
  const providers = loadProviders()
  const preferred = options.provider || Object.keys(providers).find(k => providers[k].enabled) || 'ollama'
  const provider = providers[preferred]
  if (!provider || !provider.enabled) throw new Error(`Provider "${preferred}" not enabled`)

  const start = Date.now()
  try {
    let result
    switch (preferred) {
      case 'ollama': result = await callOllama(prompt, provider, options); break
      case 'openai': result = await callOpenAI(prompt, provider, options); break
      case 'gemini': result = await callGemini(prompt, provider, options); break
      case 'groq': result = await callGroq(prompt, provider, options); break
      case 'claude': result = await callClaude(prompt, provider, options); break
      case 'deepseek': result = await callDeepSeek(prompt, provider, options); break
      case 'mistral': result = await callMistral(prompt, provider, options); break
      default: throw new Error(`Unknown provider: ${preferred}`)
    }
    logUsage(preferred, provider.model || '', prompt.length, result.length, Date.now() - start, true)
    return result
  } catch (err) {
    logUsage(preferred, provider.model || '', prompt.length, 0, Date.now() - start, false, err.message)
    throw err
  }
}

function logUsage(provider, model, promptLen, responseLen, durationMs, success, error) {
  try {
    const db = getDb()
    db.prepare(`
      INSERT INTO ai_usage_log (provider, model, prompt_length, response_length, duration_ms, success, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(provider, model, promptLen, responseLen, durationMs, success ? 1 : 0, error || null, new Date().toISOString())
  } catch (e) { /* silent */ }
}

async function generateWithFallback(prompt, options = {}) {
  const providers = loadProviders()
  const order = options.providerOrder || Object.keys(providers).filter(k => providers[k].enabled)

  for (const name of order) {
    try {
      return await generate(prompt, { ...options, provider: name })
    } catch (err) {
      console.log(`Provider ${name} failed: ${err.message}, trying next...`)
    }
  }
  throw new Error('All AI providers failed')
}

async function callOllama(prompt, provider, options) {
  const url = `${provider.url}/api/generate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model || 'llama3',
      prompt,
      stream: false,
      options: { temperature: options.temperature || 0.7, num_predict: options.maxTokens || 1024 }
    }),
    signal: AbortSignal.timeout(options.timeout || 60000)
  })
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const data = await res.json()
  return data.response || ''
}

async function callOpenAI(prompt, provider, options) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1024
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`OpenAI error: ${e}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callGemini(prompt, provider, options) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model || 'gemini-2.0-flash'}:generateContent?key=${provider.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: options.temperature || 0.7, maxOutputTokens: options.maxTokens || 1024 }
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`Gemini error: ${e}`) }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callGroq(prompt, provider, options) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model || 'mixtral-8x7b-32768',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1024
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`Groq error: ${e}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callClaude(prompt, provider, options) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: provider.model || 'claude-3-haiku-20240307',
      max_tokens: options.maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`Claude error: ${e}`) }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callDeepSeek(prompt, provider, options) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1024
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`DeepSeek error: ${e}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callMistral(prompt, provider, options) {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model || 'mistral-small-latest',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1024
    }),
    signal: AbortSignal.timeout(options.timeout || 30000)
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`Mistral error: ${e}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function testProvider(name) {
  const providers = loadProviders()
  const provider = providers[name]
  if (!provider) return { ok: false, error: 'Provider not found' }
  try {
    const result = await generate('Réponds UNIQUEMENT par "OK" si tu fonctionnes correctement.', { provider: name, maxTokens: 10, timeout: 15000 })
    return { ok: true, response: result.trim().substring(0, 50) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { loadProviders, saveProviders, generate, generateWithFallback, testProvider, getDefaultProviders }
