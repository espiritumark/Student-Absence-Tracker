import { isVisionEngineConfigured, VISION_SCAN_ENGINE } from './parseScreenshot'

export const SCREENSHOT_ENGINE_STORAGE_KEY = 'lp-hub-screenshot-engine'

export function loadStoredScreenshotEngine() {
  try {
    const stored = localStorage.getItem(SCREENSHOT_ENGINE_STORAGE_KEY)
    if (stored === VISION_SCAN_ENGINE.cloud && isVisionEngineConfigured(VISION_SCAN_ENGINE.cloud)) {
      return VISION_SCAN_ENGINE.cloud
    }
  } catch {
    // ignore
  }
  return VISION_SCAN_ENGINE.local
}

export function storeScreenshotEngine(value) {
  try {
    localStorage.setItem(SCREENSHOT_ENGINE_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}
