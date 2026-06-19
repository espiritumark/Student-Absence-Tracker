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

const SYSTEM_PROMPT = `You are a teacher polishing formal report feedback for one learning partner (never say "student"). Write exactly one paragraph of ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words in a fair, professional UK school tone.

Your job is to REPHRASE and tighten the draft — not to expand it with new content.

Strict factual rules:
- Use ONLY facts, traits, and observations already present in the draft or teacher notes below.
- Do NOT invent behaviours, examples, recommendations, action steps, or improvements that are not stated in the source text.
- Do NOT add generic advice (e.g. "volunteer for group work", "share insights more often", "support steady progress") unless that exact idea appears in the draft or notes.
- Do NOT infer or guess what the learning partner should do; if the source does not mention a next step, do not add one.
- Preserve every specific point from the draft and notes — rephrase professionally but do not omit them (e.g. quiet, good behaviour, absences, work quality).
- If attendance, participation, or assignment quality is already described in the draft, keep that meaning; do not upgrade or soften it beyond what the draft says.

Tone:
- Be honest and constructive when the source mentions areas to improve; do not hide issues behind vague praise.
- Use respectful language — no insults, labels, or discouragement.
- Refer to them as "the learning partner" or "they" — never include their name.
- Start directly with the feedback; no greeting or label.
- Length: output MUST be ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words. If the source is brief, reach the minimum by fuller phrasing of the same points — not by adding new facts.

Return only the feedback text.`

function buildUserPrompt(draft, context) {
  return `Context for accuracy only — do not repeat the learning partner's name in your output:
Learning partner name: ${context.partnerName}
Class: ${context.className}
Total absences (days): ${context.total}
Current absence streak (days): ${context.consecutive}
Hard limit: ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words (must not be shorter than ${FEEDBACK_WORD_MIN}).

IMPORTANT: You may only use facts from the draft and teacher notes below. Do not add new suggestions, examples, or behaviours.

Teacher notes (factual source — do not go beyond this):
${context.extraNotes || '(none)'}

${context.existingFeedback ? `Existing saved feedback (may build on or replace):\n${context.existingFeedback}\n\n` : ''}Draft to refine (factual source — do not go beyond this):
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
      temperature: opts.temperature ?? 0.15,
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

function buildLengthRetryPrompt(wordCount, mode) {
  if (mode === 'short') {
    return `Your response was ${wordCount} words but must be at least ${FEEDBACK_WORD_MIN}. Rewrite as one paragraph of ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words. Expand only by fuller phrasing of facts already in the draft and notes — do not add new behaviours, examples, or suggestions. Do not include the learning partner's name. Start directly with the feedback. Return only the feedback text.`
  }
  return `Your response was ${wordCount} words. Rewrite as one paragraph of exactly ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words. Rephrase only — use the same facts as the draft and notes; do not add new suggestions or examples. Do not include the learning partner's name. Start directly with the feedback. Return only the feedback text.`
}

function pickLongerFactualFallback(refined, draft, partnerName) {
  const refinedCount = countFeedbackWords(refined)
  const draftCount = countFeedbackWords(draft)
  const candidate = draftCount > refinedCount ? draft : refined
  return sanitizeRefinedFeedback(candidate, { partnerName, max: FEEDBACK_WORD_MAX })
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
  let lastLlmWordCount = countFeedbackWords(refined)

  if (!isWithinWordTarget(refined)) {
    const tooShort = lastLlmWordCount < FEEDBACK_WORD_MIN
    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content: buildLengthRetryPrompt(lastLlmWordCount, tooShort ? 'short' : 'long'),
    })

    raw = await requestCompletion(messages, config, opts)
    refined = normalizeRefinedOutput(raw, context.partnerName)
    lastLlmWordCount = countFeedbackWords(refined)
  }

  if (!isWithinWordTarget(refined)) {
    if (lastLlmWordCount < FEEDBACK_WORD_MIN) {
      refined = pickLongerFactualFallback(refined, draft, context.partnerName)
    }
  }

  if (
    countFeedbackWords(refined) < FEEDBACK_WORD_MIN &&
    countFeedbackWords(draft) < FEEDBACK_WORD_MIN
  ) {
    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content: buildLengthRetryPrompt(lastLlmWordCount, 'short'),
    })
    raw = await requestCompletion(messages, config, opts)
    refined = normalizeRefinedOutput(raw, context.partnerName)
    lastLlmWordCount = countFeedbackWords(refined)
  }

  if (countFeedbackWords(refined) < FEEDBACK_WORD_MIN) {
    refined = pickLongerFactualFallback(refined, draft, context.partnerName)
  }

  if (countFeedbackWords(refined) > FEEDBACK_WORD_MAX) {
    refined = sanitizeRefinedFeedback(refined, {
      partnerName: context.partnerName,
      max: FEEDBACK_WORD_MAX,
    })
  }

  return refined
}

const NOTES_SYSTEM_PROMPT = `You edit a teacher's private notes. Fix grammar and polish wording only. Preserve every factual detail from the input exactly — do not add observations, recommendations, or examples that are not in the original. Do not add headers, labels, metadata, class names, or attendance stats. Return only the edited notes text.`

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
