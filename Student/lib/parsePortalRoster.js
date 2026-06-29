import { stripHtml } from './parsePortalClassList.js'
import { normalizePortalModuleLabel } from './parsePortalStudentAttendance.js'

function readAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')
  const m = String(tag || '').match(re)
  return m?.[1] ?? ''
}

export function normalizePortalName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*$/g, '')
    .trim()
    .toUpperCase()
}

/** Checked checkbox = present; unchecked = absent. */
function readCheckboxPresent(block) {
  for (const input of block.matchAll(/<input([^>]*)\/?>/gi)) {
    const tag = input[1]
    if (readAttr(tag, 'type').toLowerCase() !== 'checkbox') continue
    return /\bchecked\b/i.test(tag)
  }
  return null
}

/** Parse MM/DD/YYYY (or similar) from portal class page HTML into YYYY-MM-DD. */
function parsePortalDateFromHtml(html) {
  const text = String(html || '')
  const labeled = text.match(/Date:?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i)
  const m = labeled || text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (!m) return ''
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const d = new Date(year, month - 1, day)
  if (Number.isNaN(d.getTime())) return ''
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function extractPortalSessionMeta(html) {
  const text = String(html || '')
  const plain = stripHtml(text).replace(/\s+/g, ' ')

  const moduleMatch =
    text.match(/Module:?\s*([A-Z0-9]+\s*\|\s*[^<\n\r]+)/i) ||
    plain.match(/\b(L\d+[A-Z]?\s*\|\s*[^<\n\r]+)/i)
  const startMatch = text.match(/Start\s*Time:?\s*([^<\n\r]+)/i)
  const durationMatch = text.match(/Duration:?\s*([^<\n\r]+)/i)

  return {
    date: parsePortalDateFromHtml(text),
    module: moduleMatch?.[1] ? stripHtml(moduleMatch[1]).trim() : '',
    startTime: startMatch?.[1] ? stripHtml(startMatch[1]).trim() : '',
    duration: durationMatch?.[1] ? stripHtml(durationMatch[1]).trim() : '',
  }
}

/**
 * Parse student rows from a portal class attendance page (`index.php?class=ID`).
 * Students are rendered as `<div class="student_list">` blocks with a label and hidden stdN id.
 */
export function extractPortalRoster(html) {
  const text = String(html || '')
  const students = []

  const divRe = /<div class="student_list">([\s\S]*?)<\/div>/gi
  let match
  while ((match = divRe.exec(text)) !== null) {
    const block = match[1]
    const labelMatch = block.match(/<label>([\s\S]*?)<\/label>/i)
    const name = normalizePortalName(stripHtml(labelMatch?.[1] || ''))
    if (!name) continue

    let portalStudentId = null
    for (const input of block.matchAll(/<input([^>]*)\/?>/gi)) {
      const tag = input[1]
      const inputName = readAttr(tag, 'name')
      if (/^std\d+$/i.test(inputName)) {
        const value = Number(readAttr(tag, 'value'))
        if (Number.isFinite(value) && value > 0) {
          portalStudentId = value
          break
        }
      }
    }

    const indexMatch = stripHtml(block).match(/^(\d+)/)
    const index = indexMatch ? Number(indexMatch[1]) : students.length + 1
    const present = readCheckboxPresent(block)

    students.push({
      index,
      name,
      portalStudentId,
      ...(present === null ? {} : { present }),
    })
  }

  const classLabelMatch = text.match(/<h3>\s*Class:\s*([^<]+)<\/h3>/i)
  const classLabel = classLabelMatch ? stripHtml(classLabelMatch[1]) : ''

  let expectedCount = null
  for (const input of text.matchAll(/<input([^>]*)\/?>/gi)) {
    const tag = input[1]
    if (readAttr(tag, 'name') === 'std_count') {
      const value = Number(readAttr(tag, 'value'))
      if (Number.isFinite(value) && value >= 0) expectedCount = value
      break
    }
  }

  let portalClassId = null
  for (const input of text.matchAll(/<input([^>]*)\/?>/gi)) {
    const tag = input[1]
    if (readAttr(tag, 'name') === 'class_id') {
      const value = Number(readAttr(tag, 'value'))
      if (Number.isFinite(value) && value > 0) portalClassId = value
      break
    }
  }

  return {
    portalClassId,
    classLabel,
    expectedCount,
    students,
  }
}

function isModuleOptionLabel(label) {
  const text = String(label || '').trim()
  if (!text || /^(select|--|choose)/i.test(text)) return false
  return /\|/.test(text) && /[A-Z0-9]/i.test(text)
}

function pushModuleOption(modules, seen, value, label) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim().toUpperCase()
  if (!isModuleOptionLabel(cleanLabel)) return
  const classModuleId = Number(String(value || '').trim())
  if (!Number.isFinite(classModuleId) || classModuleId <= 0) return
  const key = `${classModuleId}`
  if (seen.has(key)) return
  seen.add(key)
  modules.push({ classModuleId, label: cleanLabel })
}

/**
 * Parse module options from the class attendance page (`index.php?class=ID`).
 * Modules come from the class page module picker (`module_id`), including
 * bootstrap-style pages that use a text input plus a hidden option list.
 */
export function extractPortalClassModuleOptions(html) {
  const text = String(html || '')
  const modules = []
  const seen = new Set()

  const selectPatterns = [
    /<select[^>]*\bmodule_id\b[^>]*>([\s\S]*?)<\/select>/gi,
    /<select[^>]*\bselectpicker\b[^>]*\bmodule_id\b[^>]*>([\s\S]*?)<\/select>/gi,
    /<select[^>]*\bname\s*=\s*["']module_id["'][^>]*>([\s\S]*?)<\/select>/gi,
  ]

  for (const selectRe of selectPatterns) {
    let selectMatch
    while ((selectMatch = selectRe.exec(text)) !== null) {
      const block = selectMatch[1]
      for (const opt of block.matchAll(
        /<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi,
      )) {
        pushModuleOption(modules, seen, opt[1], stripHtml(opt[2]))
      }
    }
  }

  if (!modules.length) {
    const moduleFieldIndex = text.search(/\bmodule_id\b/i)
    if (moduleFieldIndex >= 0) {
      const windowText = text.slice(moduleFieldIndex, moduleFieldIndex + 12000)
      for (const opt of windowText.matchAll(
        /<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi,
      )) {
        pushModuleOption(modules, seen, opt[1], stripHtml(opt[2]))
      }
    }
  }

  if (!modules.length) {
    for (const opt of text.matchAll(
      /<option[^>]*value\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi,
    )) {
      pushModuleOption(modules, seen, opt[1], stripHtml(opt[2]))
    }
  }

  return modules.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Portal grid URLs use `view_studentmodule={id}` where id is the roster
 * `classModuleId` (module_id on the class page), e.g. 485 for L5CPT | SECURITY.
 */
export function resolvePortalGridModuleId(module) {
  const classModuleId = Number(module?.classModuleId)
  if (Number.isFinite(classModuleId) && classModuleId > 0) return classModuleId
  const moduleId = Number(module?.moduleId)
  if (Number.isFinite(moduleId) && moduleId > 0) return moduleId
  return null
}

export function normalizePortalClassModules(modules = []) {
  return (modules ?? [])
    .map((mod) => {
      const gridModuleId = resolvePortalGridModuleId(mod)
      if (!gridModuleId) return null
      return {
        ...mod,
        classModuleId: Number(mod.classModuleId) > 0 ? Number(mod.classModuleId) : gridModuleId,
        moduleId: gridModuleId,
      }
    })
    .filter(Boolean)
}

export function resolvePortalModuleByLabel(modules = [], moduleLabel = '') {
  const target = normalizePortalModuleLabel(moduleLabel)
  if (!target) return null
  for (const mod of normalizePortalClassModules(modules)) {
    if (normalizePortalModuleLabel(mod.label) === target) {
      return resolvePortalGridModuleId(mod)
    }
  }
  return null
}

/** Full class page parse: roster, session meta, and present/absent checkboxes when available. */
export function extractPortalClassPage(html) {
  const roster = extractPortalRoster(html)
  const session = extractPortalSessionMeta(html)
  const modules = normalizePortalClassModules(extractPortalClassModuleOptions(html))
  return {
    ...roster,
    session,
    modules,
    hasAttendance: roster.students.some((student) => student.present != null),
  }
}
