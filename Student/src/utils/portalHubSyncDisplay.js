import { isPartTimeQualification, parseClassHeader } from './classFormat'

export function sectionClassMeta(section) {
  if (section?.classMeta?.qualification) return section.classMeta
  return parseClassHeader(section?.portalLabel || '') || {}
}

/** Programme name, e.g. "HND IN COMPUTING" or "HND IN BUSINESS PROCESS SUPPORT". */
export function sectionProgrammeLabel(section) {
  const meta = sectionClassMeta(section)
  return String(meta.qualification || '').trim()
}

export function sectionCohortLine(section) {
  const meta = sectionClassMeta(section)
  const parts = []
  if (meta.intake != null) parts.push(`Intake ${meta.intake}`)
  if (meta.level != null) parts.push(`Level ${meta.level}`)
  if (meta.group != null) parts.push(`Group ${meta.group}`)
  const programme = sectionProgrammeLabel(section) || section?.portalLabel || ''
  if (isPartTimeQualification(programme)) parts.push('Part-time')
  return parts.join(' · ')
}

export function fullClassLabel(section) {
  return String(section?.portalLabel || section?.hubLabel || 'Class').trim()
}

export function shortCarouselClassLabel(section) {
  const meta = sectionClassMeta(section)
  const programme = sectionProgrammeLabel(section)
  if (meta.intake != null && meta.group != null) {
    const shortProg =
      programme.length > 32 ? `${programme.slice(0, 30).trim()}…` : programme
    return shortProg ? `I${meta.intake} G${meta.group} · ${shortProg}` : `I${meta.intake} G${meta.group}`
  }
  const label = section?.portalLabel || 'Class'
  return label.length > 52 ? `${label.slice(0, 50)}…` : label
}

export function moduleSubjectTitle(moduleLabel) {
  const text = String(moduleLabel || '').trim()
  const pipe = text.indexOf('|')
  if (pipe >= 0) return text.slice(pipe + 1).trim()
  return text
}

export function moduleCodePrefix(moduleLabel) {
  const text = String(moduleLabel || '').trim()
  const pipe = text.indexOf('|')
  if (pipe > 0) return text.slice(0, pipe).trim()
  return ''
}

/** Module picker label — subject only; LP count omitted (same roster for every module in class). */
export function moduleOptionLabel(mod) {
  const subject = moduleSubjectTitle(mod.moduleLabel)
  const code = moduleCodePrefix(mod.moduleLabel)
  const pending = mod.sessionChanges > 0 ? ` · ${mod.sessionChanges} to import` : ''
  if (code && code !== subject) return `${code} · ${subject}${pending}`
  return `${subject}${pending}`
}

export function classContextLine(section) {
  const programme = sectionProgrammeLabel(section)
  const cohort = sectionCohortLine(section)
  const lpCount = section?.roster?.length ?? 0
  const moduleCount = section?.modules?.length ?? 0
  const head = programme || cohort || section?.portalLabel || 'Class'
  const tail = [
    cohort && programme ? cohort : null,
    lpCount ? `${lpCount} ${lpCount === 1 ? 'LP' : 'LPs'}` : null,
    moduleCount ? `${moduleCount} module${moduleCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return tail ? `${head} · ${tail}` : head
}

export function getStudentModuleSummaries(section, portalStudentId) {
  return (section?.modules ?? []).map((mod, moduleIndex) => {
    const item = (mod.items ?? []).find((row) => row.portalStudentId === portalStudentId)
    return {
      moduleIndex,
      rowKey: mod.rowKey,
      moduleLabel: mod.moduleLabel,
      code: moduleCodePrefix(mod.moduleLabel),
      subject: moduleSubjectTitle(mod.moduleLabel),
      present: item?.portalPresent ?? null,
      absent: item?.portalAbsent ?? null,
      percent: item?.portalPercent ?? null,
    }
  })
}

export function studentInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/** Ant Design Tag color name for attendance %. */
export function attendancePercentTagColor(percent) {
  if (percent == null) return 'default'
  if (percent >= 85) return 'success'
  if (percent >= 75) return 'warning'
  return 'error'
}

export function rosterStatusSummary(section) {
  const roster = section?.roster ?? []
  let newCount = 0
  let updateCount = 0
  let matchedCount = 0
  for (const student of roster) {
    if (student.kind === 'new') newCount += 1
    else if (student.kind === 'similar') updateCount += 1
    else matchedCount += 1
  }
  const parts = []
  if (newCount) parts.push(`${newCount} new`)
  if (updateCount) parts.push(`${updateCount} rename`)
  if (matchedCount) parts.push(`${matchedCount} matched`)
  return parts.join(' · ') || null
}
