import Tesseract from 'tesseract.js'
import { isCloudOcrConfigured, recognizeWithCloudOcr } from './cloudOcr'
import { parsePortalDate } from './dates'
import { parseClassHeader } from './classFormat'
import {
  detectCheckboxesWithRoboflow,
  isRoboflowCheckboxConfigured,
  matchCheckboxPresent,
} from './roboflowCheckbox'

export { isCloudOcrConfigured } from './cloudOcr'
export { isRoboflowCheckboxConfigured } from './roboflowCheckbox'

const SKIP_LINE =
  /^(class|date|module|start\s*time|duration|check\s*all|uncheck\s*all|submit|present|absent)\b/i

function drawToCanvas(img, { maxW }) {
  const scale = img.width > maxW ? maxW / img.width : 1
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

function loadImageToCanvas(source, { maxW }) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let objectUrl = null
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      const sourceWidth = img.width
      const sourceHeight = img.height
      const canvas = drawToCanvas(img, { maxW })
      resolve({ canvas, sourceWidth, sourceHeight })
    }
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load image'))
    }
    if (typeof source === 'string') {
      img.src = source
    } else {
      objectUrl = URL.createObjectURL(source)
      img.src = objectUrl
    }
  })
}

function buildFullResult(meta, students, ocrText, previewSource, extra = {}) {
  return {
    meta,
    students,
    ocrText,
    ...(previewSource ? { previewUrl: resolvePreviewUrl(previewSource) } : {}),
    usedFallback: false,
    scanMode: 'full',
    ...extra,
  }
}

async function detectStudentsFromLines(
  canvas,
  lines,
  ocrText,
  ocrWidth,
  ocrHeight,
  onProgress,
  roboflowCheckboxes = null,
) {
  const meta = parseMetadataFromText(ocrText)
  const scaleX = canvas.width / (ocrWidth || canvas.width)
  const scaleY = canvas.height / (ocrHeight || canvas.height)
  const students = []
  const useRoboflow = Array.isArray(roboflowCheckboxes) && roboflowCheckboxes.length > 0

  reportProgress(onProgress, 'detecting attendance', 0)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const parsed = parseStudentLine(line.text)
    if (!parsed || !line.bbox) continue

    let present
    if (useRoboflow) {
      const matched = matchCheckboxPresent(line.bbox, roboflowCheckboxes)
      present = matched ?? detectCheckboxChecked(canvas, line.bbox, scaleX, scaleY)
    } else {
      present = detectCheckboxChecked(canvas, line.bbox, scaleX, scaleY)
    }

    students.push({ ...parsed, present })
    if (i % 4 === 0 || i === lines.length - 1) {
      reportProgress(onProgress, 'detecting attendance', (i + 1) / Math.max(lines.length, 1))
    }
  }
  reportProgress(onProgress, 'detecting attendance', 1)

  if (students.length < 3) {
    const fallback = parseStudentsFromText(ocrText)
    if (fallback.length > students.length) {
      return buildFullResult(meta, fallback, ocrText, null, { usedFallback: true })
    }
  }

  if (students.length === 0) {
    throw new Error('Could not read student names from the screenshot.')
  }

  return buildFullResult(meta, students, ocrText, null, {
    checkboxEngine: useRoboflow ? 'roboflow' : 'pixel',
  })
}

let workerPromise = null
let cachedWorker = null

export function prewarmOcrWorker() {
  getWorker(null).catch(() => {})
}

export async function terminateOcrWorker() {
  if (cachedWorker) {
    try {
      await cachedWorker.terminate()
    } catch {
      /* ignore */
    }
    cachedWorker = null
  }
  workerPromise = null
}

const STAGE_RANGES = {
  'loading tesseract core': [0.06, 0.28],
  'initializing tesseract': [0.28, 0.36],
  'loading language traineddata': [0.36, 0.58],
  'initialized tesseract': [0.58, 0.62],
  'recognizing text': [0.62, 0.9],
  'detecting attendance': [0.9, 1],
}

export const OCR_STAGE_LABELS = {
  'loading image': 'Preparing image…',
  'loading tesseract core': 'Downloading OCR engine…',
  'initializing tesseract': 'Starting OCR…',
  'loading language traineddata': 'Loading language data…',
  'initialized tesseract': 'OCR ready — starting scan…',
  'recognizing text': 'Reading text from screenshot…',
  'detecting attendance': 'Detecting present / absent…',
}

function mapTesseractProgress(status, stepProgress = 0) {
  const [start, end] = STAGE_RANGES[status] ?? [0.62, 0.9]
  return start + (end - start) * Math.min(1, Math.max(0, stepProgress))
}

function reportProgress(onProgress, stage, stepProgress = 1) {
  if (!onProgress) return
  const progress =
    stage === 'loading image'
      ? 0.02 + 0.04 * stepProgress
      : mapTesseractProgress(stage, stepProgress)
  onProgress({
    stage,
    progress,
    label: OCR_STAGE_LABELS[stage] || stage,
  })
}

async function getWorker(onProgress) {
  if (workerPromise) {
    reportProgress(onProgress, 'initialized tesseract', 1)
    return workerPromise
  }
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status && m.status in STAGE_RANGES) {
            reportProgress(onProgress, m.status, m.progress ?? 0)
          } else if (m.status === 'recognizing text') {
            reportProgress(onProgress, m.status, m.progress ?? 0)
          }
        },
      })
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      })
      cachedWorker = worker
      return worker
    })()
  }
  return workerPromise
}

function sampleCheckboxFill(canvas, x0, y0, x1, y1) {
  const w = x1 - x0
  const h = y1 - y0
  if (w < 4 || h < 4) return { colored: 0, total: 0, border: 0 }

  const ctx = canvas.getContext('2d')
  const { data, width, height } = ctx.getImageData(x0, y0, w, h)
  let colored = 0
  let border = 0
  let total = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      total++

      const isWhite = r > 232 && g > 232 && b > 232
      const isBlue = b > r + 12 && b > g + 8 && b > 90
      const isGreen = g > r + 12 && g > b + 8 && g > 90
      const isDark = r < 110 && g < 110 && b < 110
      const isGrayBorder = !isWhite && Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r < 210

      if (isBlue || isGreen || isDark) colored++
      if (isGrayBorder && (x < 2 || y < 2 || x >= width - 2 || y >= height - 2)) border++
    }
  }

  return { colored, total, border }
}

/** Checked portal boxes are filled; unchecked stay white. Scans several regions left of the name. */
function detectCheckboxChecked(canvas, bbox, scaleX, scaleY) {
  const lineX0 = bbox.x0 * scaleX
  const lineY0 = bbox.y0 * scaleY
  const lineY1 = bbox.y1 * scaleY
  const lineH = Math.max(12, lineY1 - lineY0)
  const lineCy = (lineY0 + lineY1) / 2
  const boxSize = Math.max(10, Math.min(26, lineH * 0.9))

  let bestFill = 0
  let bestBorder = 0

  const maxLeft = Math.min(lineX0 - 4, 140)
  for (let left = boxSize + 8; left <= maxLeft; left += 6) {
    const x1 = Math.max(0, Math.floor(lineX0 - 4))
    const x0 = Math.max(0, Math.floor(lineX0 - left))
    const y0 = Math.max(0, Math.floor(lineCy - boxSize / 2))
    const y1 = Math.min(canvas.height, Math.floor(lineCy + boxSize / 2))
    const { colored, total, border } = sampleCheckboxFill(canvas, x0, y0, x1, y1)
    if (total === 0) continue

    const fillRatio = colored / total
    const borderRatio = border / total
    if (fillRatio > bestFill) bestFill = fillRatio
    if (borderRatio > bestBorder) bestBorder = borderRatio
  }

  if (bestFill > 0.045) return true
  if (bestBorder > 0.12 && bestFill < 0.02) return false
  return bestFill > 0.025
}

export function parseStudentLine(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || SKIP_LINE.test(cleaned)) return null

  const m = cleaned.match(/^(\d{1,3})[\s.:)\-]+(.+)$/)
  if (!m) return null

  let name = m[2]
    .replace(/\s*[\[\(]?\s*[-–]\s*[\]\)]?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

  if (name.length < 4) return null
  if (/^(AM|PM|SESSION|\d{1,2}:\d{2})/.test(name)) return null

  return { index: Number(m[1]), name }
}

export function parseMetadataFromText(text) {
  const classMeta = parseClassHeader(text)
  const date = parsePortalDate(text)
  const moduleMatch =
    text.match(/Module:?\s*([A-Z0-9]+\s*\|\s*[^\n\r]+)/i) ||
    text.match(/\b(L\d+[A-Z]?\s*\|\s*[^\n\r]+)/i)
  const startMatch = text.match(/Start\s*Time:?\s*([^\n\r]+)/i)
  const durationMatch = text.match(/Duration:?\s*([^\n\r]+)/i)

  return {
    classMeta,
    date,
    module: moduleMatch?.[1]?.trim() ?? '',
    startTime: startMatch?.[1]?.trim() ?? '',
    duration: durationMatch?.[1]?.trim() ?? '',
  }
}

export function parseStudentsFromText(text) {
  const students = []
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseStudentLine(line)
    if (parsed) {
      students.push({ ...parsed, present: true })
    }
  }
  return students
}

function resolvePreviewUrl(fileOrDataUrl) {
  if (!fileOrDataUrl) return null
  if (typeof fileOrDataUrl === 'string') return fileOrDataUrl
  return URL.createObjectURL(fileOrDataUrl)
}

function buildFastResult(ocrText, previewSource, extra = {}) {
  const meta = parseMetadataFromText(ocrText)
  const students = parseStudentsFromText(ocrText)
  if (students.length === 0) {
    throw new Error('Could not read student names from the screenshot.')
  }
  return {
    meta,
    students,
    ocrText,
    previewUrl: resolvePreviewUrl(previewSource),
    usedFallback: true,
    scanMode: 'fast',
    ...extra,
  }
}

export async function parseAttendanceScreenshot(fileOrDataUrl, onProgress, opts) {
  const options = { scanMode: 'fast', highAccuracy: false, preferCloud: true, ...opts }
  const detectCheckboxes = options.scanMode === 'full'
  const dataUrl =
    typeof fileOrDataUrl === 'string' ? fileOrDataUrl : await fileToDataUrl(fileOrDataUrl)

  reportProgress(onProgress, 'loading image', 0)

  const maxW = detectCheckboxes
    ? options.highAccuracy
      ? 2200
      : 1200
    : 900

  if (isCloudOcrConfigured() && options.preferCloud !== false) {
    if (detectCheckboxes) {
      const { canvas, sourceWidth, sourceHeight } = await loadImageToCanvas(dataUrl, { maxW })
      reportProgress(onProgress, 'loading image', 1)

      const roboflowPromise = isRoboflowCheckboxConfigured()
        ? detectCheckboxesWithRoboflow(dataUrl, onProgress).catch(() => null)
        : Promise.resolve(null)

      const [cloud, roboflowCheckboxes] = await Promise.all([
        recognizeWithCloudOcr(dataUrl, onProgress, { withOverlay: true }),
        roboflowPromise,
      ])

      const result = await detectStudentsFromLines(
        canvas,
        cloud.lines,
        cloud.text,
        cloud.imageWidth || sourceWidth,
        cloud.imageHeight || sourceHeight,
        onProgress,
        roboflowCheckboxes,
      )
      return { ...result, previewUrl: resolvePreviewUrl(dataUrl), ocrEngine: 'cloud' }
    }

    reportProgress(onProgress, 'loading image', 1)
    const cloud = await recognizeWithCloudOcr(dataUrl, onProgress)
    reportProgress(onProgress, 'detecting attendance', 1)
    return buildFastResult(cloud.text, dataUrl, { ocrEngine: 'cloud' })
  }

  const { canvas } = await loadImageToCanvas(dataUrl, { maxW })
  reportProgress(onProgress, 'loading image', 1)

  const worker = await getWorker(onProgress)
  reportProgress(onProgress, 'recognizing text', 0)
  const result = await worker.recognize(canvas, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        reportProgress(onProgress, m.status, m.progress ?? 0)
      }
    },
  })

  const ocrText = result.data.text || ''

  if (!detectCheckboxes) {
    reportProgress(onProgress, 'detecting attendance', 1)
    return buildFastResult(ocrText, dataUrl, { ocrEngine: 'browser' })
  }

  const tesseractLines = (result.data.lines || []).map((line) => ({
    text: line.text,
    bbox: line.bbox,
  }))

  let roboflowCheckboxes = null
  if (isRoboflowCheckboxConfigured()) {
    roboflowCheckboxes = await detectCheckboxesWithRoboflow(dataUrl, onProgress).catch(() => null)
  }

  const resultFull = await detectStudentsFromLines(
    canvas,
    tesseractLines,
    ocrText,
    result.data.imageSize?.width || canvas.width,
    result.data.imageSize?.height || canvas.height,
    onProgress,
    roboflowCheckboxes,
  )
  return { ...resultFull, previewUrl: resolvePreviewUrl(dataUrl), ocrEngine: 'browser' }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
