import { nameSimilarity, normalizeName } from './nameMatching'

/** Minimum similarity (0–1) to show a row when searching by name. */
export const TABLE_NAME_SEARCH_MIN_SCORE = 0.9

/**
 * Whether a roster/display name matches a search query (substring or fuzzy).
 */
export function matchesNameSearch(query, candidateName, minScore = TABLE_NAME_SEARCH_MIN_SCORE) {
  const q = normalizeName(query)
  if (!q) return true
  const name = normalizeName(candidateName)
  if (!name) return false

  if (name.includes(q)) return true
  if (nameSimilarity(q, name) >= minScore) return true

  const qParts = q.split(/\s+/).filter(Boolean)
  const nameParts = name.split(/\s+/).filter(Boolean)

  if (qParts.length > 1) {
    return qParts.every(
      (part) =>
        name.includes(part) ||
        nameParts.some(
          (np) => np.includes(part) || nameSimilarity(part, np) >= minScore,
        ),
    )
  }

  return nameParts.some(
    (part) =>
      part.includes(q) ||
      q.includes(part) ||
      nameSimilarity(q, part) >= minScore,
  )
}

/**
 * Filter table rows by name search. Empty query returns all items.
 * @param {Array} items
 * @param {string} query
 * @param {(item: unknown) => string} getName
 */
export function filterByNameSearch(items, query, getName, minScore = TABLE_NAME_SEARCH_MIN_SCORE) {
  const trimmed = String(query ?? '').trim()
  if (!trimmed) return items
  return items.filter((item) => matchesNameSearch(trimmed, getName(item), minScore))
}
