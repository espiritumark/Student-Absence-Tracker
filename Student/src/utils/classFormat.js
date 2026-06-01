export function formatClassLabel(cls) {
  if (!cls) return 'Unnamed class'
  if (cls.intake != null && cls.level != null && cls.group != null) {
    const qual = cls.qualification || cls.name || ''
    return `INTAKE ${cls.intake} LEVEL ${cls.level} ${qual} GROUP ${cls.group}`.trim()
  }
  return cls.name || cls.qualification || 'Unnamed class'
}

export function classGroup(cls) {
  return cls.group ?? cls.class_group ?? null
}

export function normalizeQualification(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\b(IN|THE|OF|FOR|AND)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classIdentity(cls) {
  if (!cls) {
    return { intake: null, level: null, group: null, qualification: '' }
  }
  return {
    intake: cls.intake ?? null,
    level: cls.level ?? null,
    group: classGroup(cls),
    qualification: normalizeQualification(cls.qualification || cls.name || ''),
  }
}

export function classMatchKey(cls) {
  const id = classIdentity(cls)
  return [id.intake ?? '', id.level ?? '', id.qualification, id.group ?? ''].join('|')
}

export function qualificationsSimilar(a, b) {
  const left = normalizeQualification(a)
  const right = normalizeQualification(b)
  if (!left || !right) return true
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true

  const tokensA = left.split(' ').filter((t) => t.length > 1)
  const tokensB = new Set(right.split(' ').filter((t) => t.length > 1))
  if (!tokensA.length || !tokensB.size) return false

  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }
  return overlap / Math.max(tokensA.length, tokensB.size) >= 0.6
}

export function findMatchingClass(classes, classMeta) {
  if (!classes?.length || !classMeta) return null

  const incoming = classIdentity(classMeta)
  const exact = classes.find((c) => classMatchKey(c) === classMatchKey(classMeta))
  if (exact) return exact

  if (incoming.intake != null && incoming.level != null && incoming.group != null) {
    const cohort = classes.filter((c) => {
      const id = classIdentity(c)
      return (
        id.intake === incoming.intake &&
        id.level === incoming.level &&
        id.group === incoming.group
      )
    })
    if (cohort.length === 1) return cohort[0]
    if (cohort.length > 1) {
      const fuzzy = cohort.find((c) =>
        qualificationsSimilar(classIdentity(c).qualification, incoming.qualification),
      )
      return fuzzy ?? cohort[0]
    }
  }

  for (const cls of classes) {
    const id = classIdentity(cls)
    const numbersMatch =
      (incoming.intake == null || id.intake === incoming.intake) &&
      (incoming.level == null || id.level === incoming.level) &&
      (incoming.group == null || id.group === incoming.group)
    if (numbersMatch && qualificationsSimilar(id.qualification, incoming.qualification)) {
      return cls
    }
  }

  return null
}

export function parseClassHeader(text) {
  const match = text.match(
    /INTAKE\s*(\d+)\s*LEVEL\s*(\d+)\s+(.+?)\s+GROUP\s*(\d+)/i,
  )
  if (!match) return null
  return {
    intake: Number(match[1]),
    level: Number(match[2]),
    qualification: match[3].trim(),
    group: Number(match[4]),
  }
}
