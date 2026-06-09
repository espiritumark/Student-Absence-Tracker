import { listModulesAcrossClasses, normalizeModuleKey } from './sessionKeys'

function uniqueSorted(values, numeric = false) {
  const items = [...new Set(values.filter((v) => v !== '' && v != null))]
  if (numeric) {
    return items
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: String(n) }))
  }
  return items
    .map(String)
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }))
}

/** Known intake / level / group / programme / module values from saved classes. */
export function buildImportMetaOptions(classes, attendance, meta = {}) {
  const intakes = []
  const levels = []
  const groups = []
  const qualifications = []

  for (const cls of classes || []) {
    if (cls.intake != null) intakes.push(cls.intake)
    if (cls.level != null) levels.push(cls.level)
    if (cls.group != null) groups.push(cls.group)
    const qual = (cls.qualification || cls.name || '').trim()
    if (qual) qualifications.push(qual)
  }

  if (meta.intake !== '' && meta.intake != null) intakes.push(meta.intake)
  if (meta.level !== '' && meta.level != null) levels.push(meta.level)
  if (meta.group !== '' && meta.group != null) groups.push(meta.group)
  if (meta.qualification?.trim()) qualifications.push(meta.qualification.trim())

  const modules = listModulesAcrossClasses(classes, attendance).map(({ value, label }) => ({
    value,
    label,
  }))

  if (meta.module?.trim()) {
    const trimmed = meta.module.trim()
    const norm = normalizeModuleKey(trimmed)
    if (
      !modules.some(
        (m) => m.value === trimmed || normalizeModuleKey(m.value) === norm,
      )
    ) {
      modules.unshift({ value: trimmed, label: trimmed })
    }
  }

  modules.sort((a, b) => a.label.localeCompare(b.label))

  return {
    intakes: uniqueSorted(intakes, true),
    levels: uniqueSorted(levels, true),
    groups: uniqueSorted(groups, true),
    qualifications: uniqueSorted(qualifications),
    modules,
  }
}

export const IMPORT_META_FIELD_LABELS = {
  intake: 'Intake',
  level: 'Level',
  group: 'Group',
  qualification: 'Qualification / Programme',
  module: 'Module',
}

export function formatImportMetaFieldValue(field, value) {
  const text = String(value ?? '').trim()
  return text || '—'
}
