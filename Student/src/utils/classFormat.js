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

export function stripPartTimeMarker(text) {
  return String(text || '')
    .replace(/\(PT\)/gi, '')
    .replace(/\bPT\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compare programme names ignoring (PT) suffix / marker differences. */
export function qualificationBaseEqual(a, b) {
  return (
    normalizeQualification(stripPartTimeMarker(a)) ===
    normalizeQualification(stripPartTimeMarker(b))
  )
}

/** Keep (PT) when the full class header included it but the parsed programme field did not. */
export function syncPartTimeFromClassLabel(meta, classText) {
  const label = String(classText || '')
  if (!/\(PT\)/i.test(label) || isPartTimeQualification(meta?.qualification)) {
    return meta
  }
  const qual = String(meta?.qualification || '').trim()
  if (!qual) return meta
  return { ...meta, qualification: `${qual} (PT)` }
}

/** Module codes like L5CPT can cause vision to invent (PT) on the programme name. */
export function isLikelyFalsePartTimeFromModule(meta) {
  const mod = String(meta?.module || '').toUpperCase()
  return /\bL?\d*CPT\b/.test(mod) || mod.includes('CPT')
}

/** Part-time cohorts are separate classes — (PT), PT, or "part time" in the programme name. */
export function isPartTimeQualification(text) {
  const raw = String(text || '').toUpperCase()
  if (/\(PT\)|\bPT\b|PART[\s-]*TIME/.test(raw)) return true
  const norm = normalizeQualification(text)
  return /\bPT\b/.test(norm) || norm.includes('PART TIME')
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
  const rawQual = cls?.qualification || cls?.name || ''
  const pt = isPartTimeQualification(rawQual) ? 'PT' : 'FT'
  return [id.intake ?? '', id.level ?? '', id.qualification, id.group ?? '', pt].join('|')
}

export function qualificationsSimilar(a, b) {
  if (isPartTimeQualification(a) !== isPartTimeQualification(b)) return false

  const left = normalizeQualification(stripPartTimeMarker(a))
  const right = normalizeQualification(stripPartTimeMarker(b))
  if (!left || !right) return true
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true

  const tokensA = left.split(' ').filter((t) => t.length > 1 && t !== 'PT')
  const tokensB = new Set(right.split(' ').filter((t) => t.length > 1 && t !== 'PT'))
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
  const incomingQualRaw = classMeta.qualification || classMeta.name || ''
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

    const incomingPt = isPartTimeQualification(incomingQualRaw)
    const ptAligned = cohort.filter(
      (c) => isPartTimeQualification(c.qualification || c.name || '') === incomingPt,
    )

    if (ptAligned.length === 1) return ptAligned[0]
    if (ptAligned.length > 1) {
      const fuzzy = ptAligned.find((c) =>
        qualificationsSimilar(classIdentity(c).qualification, incoming.qualification),
      )
      return fuzzy ?? ptAligned[0]
    }

    // FT vs PT are different classes — never cross-match when the programme type differs.
    if (cohort.length === 1) {
      const only = cohort[0]
      const onlyPt = isPartTimeQualification(only.qualification || only.name || '')
      if (incomingPt === onlyPt) return only
      return null
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

/** Session label for imports — honours form programme when FT/PT or (PT) suffix differs. */
export function resolveImportClassLabel(classMeta, matchedClass) {
  const fromForm = formatClassLabel(classMeta)
  if (!matchedClass) return fromForm

  const formQual = classMeta?.qualification || classMeta?.name || ''
  const rosterQual = matchedClass.qualification || matchedClass.name || ''
  const formPt = isPartTimeQualification(formQual)
  const rosterPt = isPartTimeQualification(rosterQual)

  if (formPt !== rosterPt) return fromForm
  if (formPt) return fromForm
  if (!qualificationBaseEqual(formQual, rosterQual)) return fromForm

  return formatClassLabel(matchedClass)
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
