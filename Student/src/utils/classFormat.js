export function formatClassLabel(cls) {
  if (cls.intake != null && cls.level != null && cls.group != null) {
    const qual = cls.qualification || cls.name || ''
    return `INTAKE ${cls.intake} LEVEL ${cls.level} ${qual} GROUP ${cls.group}`.trim()
  }
  return cls.name || 'Unnamed class'
}

export function classMatchKey(cls) {
  return [
    cls.intake ?? '',
    cls.level ?? '',
    (cls.qualification || cls.name || '').toUpperCase(),
    cls.group ?? '',
  ].join('|')
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
