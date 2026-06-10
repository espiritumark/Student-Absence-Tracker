export const FEEDBACK_WORD_MIN = 30
export const FEEDBACK_WORD_MAX = 50

export function countFeedbackWords(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function isValidFeedbackWordCount(text) {
  const count = countFeedbackWords(text)
  return count >= FEEDBACK_WORD_MIN && count <= FEEDBACK_WORD_MAX
}

export function feedbackWordCountStatus(text) {
  const count = countFeedbackWords(text)
  if (count === 0) return 'empty'
  if (count < FEEDBACK_WORD_MIN) return 'short'
  if (count > FEEDBACK_WORD_MAX) return 'long'
  return 'ok'
}

export function mergeFeedbackDraft(existing, draft, mode) {
  const prev = String(existing ?? '').trim()
  const next = String(draft ?? '').trim()
  if (!next) return prev
  if (mode === 'replace' || !prev) return next
  return `${prev.replace(/\s+$/, '')} ${next}`.trim()
}

export function truncateFeedbackPreview(text, maxWords = 12) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return trimmed
  return `${words.slice(0, maxWords).join(' ')}…`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove the learning partner's name from AI output; keep generic "the learning partner" phrasing. */
export function stripPartnerNameFromFeedback(text, partnerName) {
  let result = String(text ?? '').trim()
  const name = String(partnerName ?? '').trim()
  if (!result || !name) return result

  const escaped = escapeRegExp(name)

  result = result.replace(
    new RegExp(`^(?:the\\s+)?learning\\s+partner\\s+${escaped}\\s*[,:-]?\\s*`, 'i'),
    '',
  )
  result = result.replace(new RegExp(`^${escaped}\\s*[,:-]?\\s*`, 'i'), '')
  result = result.replace(
    new RegExp(`learning\\s+partner\\s+${escaped}`, 'gi'),
    'the learning partner',
  )
  result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'the learning partner')
  result = result.replace(/\bthe\s+the\s+learning\s+partner\b/gi, 'the learning partner')

  result = result.replace(/\s+/g, ' ').trim()
  if (result) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }

  return result
}

/** Hard-cap feedback at max words, preferring a sentence boundary when possible. */
export function clampFeedbackWords(text, max = FEEDBACK_WORD_MAX) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return trimmed

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length <= max) return trimmed

  let clamped = words.slice(0, max).join(' ')
  const lastEnd = Math.max(
    clamped.lastIndexOf('.'),
    clamped.lastIndexOf('!'),
    clamped.lastIndexOf('?'),
  )

  if (lastEnd > clamped.length * 0.45) {
    clamped = clamped.slice(0, lastEnd + 1).trim()
  } else if (!/[.!?]$/.test(clamped)) {
    clamped = `${clamped.replace(/[,;:\-–—\s]+$/, '')}.`
  }

  return clamped
}

/** Normalize AI-refined feedback: drop names and enforce the word ceiling. */
export function sanitizeRefinedFeedback(text, { partnerName, max = FEEDBACK_WORD_MAX } = {}) {
  const stripped = stripPartnerNameFromFeedback(text, partnerName)
  return clampFeedbackWords(stripped, max)
}
