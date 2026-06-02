import { APP_NAME } from '../constants/branding'
import { isVisionLlmConfigured } from './visionLlm'

function defaultBaseUrl() {
  return import.meta.env.VITE_VISION_LLM_BASE_URL?.trim() || 'http://localhost:11434/v1'
}

function isLocalEndpoint(baseUrl = defaultBaseUrl()) {
  return /localhost|127\.0\.0\.1/.test(baseUrl)
}

function getFeedbackLlmConfig() {
  if (!isVisionLlmConfigured()) return null

  const baseUrl = defaultBaseUrl().replace(/\/$/, '')
  const apiKey = import.meta.env.VITE_VISION_LLM_API_KEY?.trim()
  const model =
    import.meta.env.VITE_FEEDBACK_LLM_MODEL?.trim() ||
    import.meta.env.VITE_VISION_LLM_MODEL?.trim() ||
    'llama3.2'

  return {
    apiKey: apiKey || 'ollama',
    baseUrl,
    model,
  }
}

function readMessageContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('')
      .trim()
  }
  return ''
}

/**
 * Polish a draft into 1–2 professional paragraphs; always uses "learning partner".
 */
export async function refineFeedbackWithLlm(draft, context, opts = {}) {
  const config = getFeedbackLlmConfig()
  if (!config) {
    throw new Error(
      'AI refinement is not configured. Set VITE_VISION_LLM_API_KEY or use local Ollama (see .env.example).',
    )
  }

  const system = `You are a teacher writing formal report feedback. Use "learning partner" (never "student"). Write 1–2 concise paragraphs in UK professional school tone. Do not invent facts beyond the brief. Return only the feedback text.`

  const user = `Learning partner: ${context.partnerName}
Class: ${context.className}
Total absences (days): ${context.total}
Current absence streak (days): ${context.consecutive}

Teacher notes to weave in if relevant:
${context.extraNotes || '(none)'}

Draft to refine:
${draft}`

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  if (config.baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = APP_NAME
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1024,
      temperature: 0.35,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Feedback AI failed (${response.status}). ${errText.slice(0, 160)}`)
  }

  const data = await response.json()
  const text = readMessageContent(data.choices?.[0]?.message?.content)
  if (!text) throw new Error('Feedback AI returned no text.')
  return text
}

export function isFeedbackLlmConfigured() {
  return Boolean(getFeedbackLlmConfig())
}
