export function normalizeName(name) {
  if (name == null) return ''
  const text = typeof name === 'string' ? name : String(name)
  return text.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Same spelling, ignoring case and extra spaces — used for roster and import matching. */
export function namesMatchBySpelling(a, b) {
  const left = normalizeName(a)
  return left !== '' && left === normalizeName(b)
}

/** @param {string} a @param {string} b @returns {number} 0–1 */
export function nameSimilarity(a, b) {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const dist = levenshtein(left, right)
  const maxLen = Math.max(left.length, right.length, 1)
  return 1 - dist / maxLen
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const prev = new Array(b.length + 1)
  const cur = new Array(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }

  return prev[b.length]
}

const SIMILAR_MIN_SCORE = 0.88
const SIMILAR_MAX_GAP = 0.06

/**
 * Roster students similar to an import name (excludes exact matches).
 * @returns {{ id: string, name: string, score: number }[]}
 */
export function findSimilarRosterMatches(importName, rosterStudents, { minScore = SIMILAR_MIN_SCORE } = {}) {
  const normalizedImport = normalizeName(importName)
  const scored = []

  for (const student of rosterStudents ?? []) {
    const rosterName = student.name
    const normalizedRoster = normalizeName(rosterName)
    if (!normalizedRoster) continue
    if (normalizedRoster === normalizedImport) continue

    const score = nameSimilarity(importName, rosterName)
    if (score >= minScore) {
      scored.push({ id: student.id, name: rosterName, score })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return scored
}

/** Same rounding as UI labels (0–100). */
export function similarityDisplayPercent(score) {
  return Math.round((score ?? 0) * 100)
}

export function formatSimilarityPercent(score) {
  return `${similarityDisplayPercent(score)}%`
}

const NAME_PARTICLES = new Set([
  'bin',
  'binti',
  'bt',
  'bte',
  'van',
  'von',
  'de',
  'del',
  'della',
  'di',
  'da',
  'al',
  'el',
  'af',
  'ibn',
])

function titleCaseWord(word) {
  if (!word) return ''
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Present stored roster names (often ALL CAPS) in readable title case. */
export function formatPersonName(name) {
  const text = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!text) return ''

  return text
    .split(' ')
    .map((word, index) => {
      const segments = word.split(/(-|'|\.)+/).filter((part) => part.length > 0)
      return segments
        .map((part, segmentIndex) => {
          if (/^[-'.]+$/.test(part)) return part
          const lower = part.toLowerCase()
          if (index > 0 && segmentIndex === 0 && NAME_PARTICLES.has(lower)) {
            return lower
          }
          return titleCaseWord(part)
        })
        .join('')
    })
    .join(' ')
}
