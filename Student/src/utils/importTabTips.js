const STORAGE_PREFIX = 'lp-hub-import-tip-seen-'

export const IMPORT_TAB_TIPS = {
  json: {
    title: 'JSON Import',
    description:
      'Paste JSON exported from your attendance platform, or upload a .json file. Best when you already have a portal export or a screenshot scan fails.',
  },
  screenshot: {
    title: 'Screenshot Import',
    description:
      'Paste or upload one attendance screenshot. Vision AI reads class details, names, and checkboxes. Use Local (Ollama) for free on-device scanning; the first scan may take a minute on CPU.',
  },
  'bulk-screenshots': {
    title: 'Bulk Screenshots (Beta)',
    description:
      'Paste or upload multiple screenshots, scan them with Local or Cloud vision AI, then review and save each session to your roster.',
  },
}

export const IMPORT_TAB_INTRO_MS = 5000

export function hasSeenImportTabTip(tabId) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${tabId}`) === '1'
  } catch {
    return false
  }
}

export function markImportTabTipSeen(tabId) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tabId}`, '1')
  } catch {
    // ignore
  }
}
