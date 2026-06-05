/** Whether JSON tab has unsaved draft work (not yet saved to roster). */
export function hasJsonImportDraft({ jsonText, reviewSource, studentsLength }) {
  return Boolean(jsonText?.trim()) || (reviewSource === 'json' && studentsLength > 0)
}

/** Whether Screenshot tab has unsaved draft work. */
export function hasScreenshotImportDraft({
  pendingScreenshot,
  lastScannedScreenshot,
  reviewSource,
  studentsLength,
}) {
  return Boolean(
    pendingScreenshot ||
      lastScannedScreenshot ||
      (reviewSource === 'screenshot' && studentsLength > 0),
  )
}
