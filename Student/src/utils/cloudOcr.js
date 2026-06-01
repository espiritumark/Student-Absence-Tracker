const API_URL = 'https://api.ocr.space/parse/image'

export function isCloudOcrConfigured() {
  const key = import.meta.env.VITE_OCR_SPACE_API_KEY
  return Boolean(key && key !== 'your_ocr_space_api_key_here')
}

function lineBbox(line) {
  if (line.MinLeft != null && line.MaxLeft != null && line.MinTop != null) {
    return {
      x0: line.MinLeft,
      y0: line.MinTop,
      x1: line.MaxLeft,
      y1: line.MinTop + (line.MaxHeight || line.Height || 0),
    }
  }

  const words = line.Words || []
  if (!words.length) return null

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const word of words) {
    x0 = Math.min(x0, word.Left)
    y0 = Math.min(y0, word.Top)
    x1 = Math.max(x1, word.Left + word.Width)
    y1 = Math.max(y1, word.Top + word.Height)
  }
  return { x0, y0, x1, y1 }
}

function mapOverlayLines(overlay) {
  return (overlay?.Lines || [])
    .map((line) => ({
      text: line.LineText || '',
      bbox: lineBbox(line),
    }))
    .filter((line) => line.text && line.bbox)
}

/**
 * @returns {{ text: string, lines: Array<{ text: string, bbox: object }>, imageWidth: number|null, imageHeight: number|null }}
 */
export async function recognizeWithCloudOcr(dataUrl, onProgress, options = {}) {
  const engine = options.engine ?? 3
  const withOverlay = Boolean(options.withOverlay) && engine !== 3
  const isTable = options.isTable ?? engine === 3
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY
  if (!apiKey) {
    throw new Error('Cloud OCR is not configured.')
  }

  const engineLabel =
    engine === 3
      ? 'OCR.space Engine 3'
      : withOverlay
        ? 'OCR.space Engine 2 (layout)'
        : 'OCR.space Engine 2'

  onProgress?.({
    stage: 'cloud ocr',
    progress: 0.15,
    label: `Sending screenshot to ${engineLabel}…`,
  })

  const formData = new FormData()
  formData.append('base64Image', dataUrl)
  formData.append('language', 'eng')
  formData.append('detectOrientation', 'true')
  formData.append('scale', 'true')
  formData.append('OCREngine', String(engine))

  if (engine === 3) {
    formData.append('isTable', isTable ? 'true' : 'false')
  } else {
    formData.append('isOverlayRequired', withOverlay ? 'true' : 'false')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { apikey: apiKey },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Cloud OCR request failed (${response.status}). Check your API key.`)
  }

  const data = await response.json()
  if (data.IsErroredOnProcessing) {
    const msg = data.ErrorMessage?.[0] || data.ErrorMessage || 'Cloud OCR failed.'
    throw new Error(typeof msg === 'string' ? msg : 'Cloud OCR failed.')
  }

  onProgress?.({
    stage: 'cloud ocr',
    progress: withOverlay ? 0.75 : 0.85,
    label: `Reading ${engineLabel} result…`,
  })

  const parsed = data.ParsedResults?.[0]
  const text = parsed?.ParsedText?.trim() || ''
  if (!text) {
    throw new Error('Cloud OCR returned no text. Try a clearer screenshot.')
  }

  const overlay = parsed?.TextOverlay
  return {
    text,
    lines: withOverlay ? mapOverlayLines(overlay) : [],
    imageWidth: overlay?.Width ?? parsed?.ImageWidth ?? null,
    imageHeight: overlay?.Height ?? parsed?.ImageHeight ?? null,
    engine,
  }
}
