/** Roboflow checkbox detector — https://universe.roboflow.com/test-racmu/checkbox-detector */
const DEFAULT_MODEL = 'test-racmu/checkbox-detector/1'
const DETECT_URL = 'https://detect.roboflow.com'

export function isRoboflowCheckboxConfigured() {
  const key = import.meta.env.VITE_ROBOFLOW_API_KEY
  return Boolean(key && key !== 'your_roboflow_api_key_here')
}

function getModelId() {
  const configured = import.meta.env.VITE_ROBOFLOW_CHECKBOX_MODEL
  return configured && configured !== 'your_roboflow_model_here' ? configured : DEFAULT_MODEL
}

function isCheckboxClass(className) {
  return className === 'oncheckbox' || className === 'offcheckbox'
}

/**
 * @returns {Promise<Array<{ x: number, y: number, width: number, height: number, class: string, confidence: number }>>}
 */
export async function detectCheckboxesWithRoboflow(dataUrl, onProgress) {
  const apiKey = import.meta.env.VITE_ROBOFLOW_API_KEY
  if (!apiKey) {
    throw new Error('Roboflow is not configured.')
  }

  onProgress?.({
    stage: 'detecting attendance',
    progress: 0.91,
    label: 'Detecting checkboxes with AI…',
  })

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const modelId = getModelId()
  const url = `${DETECT_URL}/${modelId}?api_key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: base64,
  })

  if (!response.ok) {
    throw new Error(`Roboflow request failed (${response.status}). Check your API key and model ID.`)
  }

  const data = await response.json()
  return (data.predictions || [])
    .filter((p) => isCheckboxClass(p.class))
    .map((p) => ({
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      class: p.class,
      confidence: p.confidence ?? 0,
    }))
}

/**
 * Match a student line to the nearest checkbox left of the text (same coordinate space as OCR overlay).
 * @returns {boolean|null} present if oncheckbox, false if offcheckbox, null if no match
 */
export function matchCheckboxPresent(lineBbox, checkboxes, toleranceY) {
  if (!lineBbox || !checkboxes?.length) return null

  const lineCy = (lineBbox.y0 + lineBbox.y1) / 2
  const lineX0 = lineBbox.x0
  const lineH = Math.max(8, lineBbox.y1 - lineBbox.y0)
  const yTol = toleranceY ?? Math.max(18, lineH * 0.75)

  let best = null
  let bestDist = Infinity

  for (const cb of checkboxes) {
    if (cb.x >= lineX0 + 8) continue

    const dist = Math.abs(cb.y - lineCy)
    if (dist > yTol) continue

    if (dist < bestDist) {
      bestDist = dist
      best = cb
    }
  }

  if (!best) return null
  return best.class === 'oncheckbox'
}
