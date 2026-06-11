import { APP_NAME } from '../constants/branding'
import {
  FEEDBACK_WORD_MAX,
  FEEDBACK_WORD_MIN,
  countFeedbackWords,
  sanitizeRefinedFeedback,
  sanitizeRefinedNotes,
} from './feedbackWords'
import { isVisionLlmConfigured } from './visionLlm'

function defaultBaseUrl() {
  return import.meta.env.VITE_VISION_LLM_BASE_URL?.trim() || 'http://localhost:11434/v1'
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

const SYSTEM_PROMPT = `You are a teacher writing formal report feedback for one learning partner (never say "student"). Write exactly one paragraph of ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words in a warm, professional UK school tone.

Tone and framing:
- Stay positive and encouraging; highlight strengths where the brief supports them.
- For any development area, focus on practical steps the learning partner can take themselves to improve.
- Use growth language (e.g. "would benefit from", "can build on", "aim to", "continue to develop") rather than blame, criticism, or discouragement.
- Avoid negative or harsh wording (e.g. concern, poor, lazy, fail, urgent, disengaged, inadequate).
- Refer to them as "the learning partner" or "they" — never include their name.
- Start directly with the feedback; no greeting or label.
- Do not invent facts beyond the brief.
Return only the feedback text.`

function buildUserPrompt(draft, context) {
  return `Context for accuracy only — do not repeat the learning partner's name in your output:
Learning partner name: ${context.partnerName}
Class: ${context.className}
Total absences (days): ${context.total}
Current absence streak (days): ${context.consecutive}
Hard limit: ${FEEDBACK_WORD_MAX} words maximum.
Tone: positive and constructive — focus on strengths and practical steps the learning partner can take to improve; avoid negative or harsh wording.

Teacher notes to weave in if relevant:
${context.extraNotes || '(none)'}

${context.existingFeedback ? `Existing saved feedback (may build on or replace):\n${context.existingFeedback}\n\n` : ''}Draft to refine:
${draft}`
}

async function requestCompletion(messages, config, opts = {}) {
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
      messages,
      max_tokens: opts.maxTokens ?? 180,
      temperature: opts.temperature ?? 0.35,
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

function normalizeRefinedOutput(raw, partnerName) {
  return sanitizeRefinedFeedback(raw, { partnerName, max: FEEDBACK_WORD_MAX })
}

function isWithinWordTarget(text) {
  const count = countFeedbackWords(text)
  return count >= FEEDBACK_WORD_MIN && count <= FEEDBACK_WORD_MAX
}

/**
 * Polish a draft into one professional paragraph; always uses "learning partner", never their name.
 */
export async function refineFeedbackWithLlm(draft, context, opts = {}) {
  const config = getFeedbackLlmConfig()
  if (!config) {
    throw new Error(
      'AI refinement is not configured. Set VITE_VISION_LLM_API_KEY or use local Ollama (see .env.example).',
    )
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(draft, context) },
  ]

  let raw = await requestCompletion(messages, config, opts)
  let refined = normalizeRefinedOutput(raw, context.partnerName)

  if (!isWithinWordTarget(refined)) {
    const firstCount = countFeedbackWords(refined)
    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content: `Your response was ${firstCount} words. Rewrite as one paragraph of exactly ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words. Keep a positive, constructive tone focused on what the learning partner can work on themselves. Do not include the learning partner's name. Start directly with the feedback. Return only the feedback text.`,
    })

    raw = await requestCompletion(messages, config, opts)
    refined = normalizeRefinedOutput(raw, context.partnerName)
  }

  if (countFeedbackWords(refined) > FEEDBACK_WORD_MAX) {
    refined = sanitizeRefinedFeedback(refined, {
      partnerName: context.partnerName,
      max: FEEDBACK_WORD_MAX,
    })
  }

  return refined
}

const NOTES_SYSTEM_PROMPT = `You edit a teacher's private notes. Fix grammar, organize ideas, and summarize only when it helps clarity. Preserve every factual detail from the input. Do not add headers, labels, metadata, class names, attendance stats, or character limits unless they already appear in the notes. Do not invent facts. Return only the edited notes text.`

/** Polish private extra notes; no report word limit, capped at FEEDBACK_NOTES_MAX characters. */
export async function refineNotesWithLlm(draft, opts = {}) {
  const config = getFeedbackLlmConfig()
  if (!config) {
    throw new Error(
      'AI refinement is not configured. Set VITE_VISION_LLM_API_KEY or use local Ollama (see .env.example).',
    )
  }

  const messages = [
    { role: 'system', content: NOTES_SYSTEM_PROMPT },
    { role: 'user', content: String(draft ?? '').trim() },
  ]

  const raw = await requestCompletion(messages, config, { ...opts, maxTokens: 640 })
  return sanitizeRefinedNotes(raw)
}

export function isFeedbackLlmConfigured() {
  return Boolean(getFeedbackLlmConfig())
}

