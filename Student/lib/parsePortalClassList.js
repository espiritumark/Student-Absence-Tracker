import { parseClassHeader } from '../src/utils/classFormat.js'

export function stripHtml(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function addEntry(map, portalClassId, label) {
  if (!Number.isFinite(portalClassId) || portalClassId <= 0) return
  const clean = String(label || '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.length < 3) return

  const classMeta = parseClassHeader(clean)
  const entry = {
    portalClassId,
    label: clean,
    classMeta:
      classMeta ||
      ({
        intake: null,
        level: null,
        qualification: clean,
        group: null,
      }),
  }

  const existing = map.get(portalClassId)
  if (!existing || clean.length > existing.label.length) {
    map.set(portalClassId, entry)
  }
}

/**
 * Extract portal class links from server-rendered HTML.
 * Supports href="index.php?class=242" and <option value="242"> labels.
 */
export function extractPortalClassLinks(html) {
  const byId = new Map()
  const text = String(html || '')

  const hrefRe = /href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = hrefRe.exec(text)) !== null) {
    const href = match[1]
    const classMatch = href.match(/(?:\?|&)class=(\d+)/i)
    if (!classMatch) continue
    addEntry(byId, Number(classMatch[1]), stripHtml(match[2]))
  }

  const optRe = /<option[^>]*value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi
  while ((match = optRe.exec(text)) !== null) {
    const label = stripHtml(match[2])
    if (!label || /^(select|choose|--)/i.test(label)) continue
    if (!/INTAKE|LEVEL|GROUP/i.test(label) && !parseClassHeader(label)) continue
    addEntry(byId, Number(match[1]), label)
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function looksLikePortalLoginPage(html) {
  const text = String(html || '')
  return (
    /<input[^>]*type=["']password["']/i.test(text) &&
    /<form[^>]*>/i.test(text)
  )
}
