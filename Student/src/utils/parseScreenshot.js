import Tesseract from 'tesseract.js'
import { parsePortalDate } from './dates'
import { parseClassHeader } from './classFormat'

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
      resolve(drawToCanvas(img, { maxW }))
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

let workerPromise = null
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng')
      await worker.setParameters({
        // Better for tall “list” screenshots than the default in many cases.
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      })
      return worker
    })()
  }
  return workerPromise
}

/** Checked portal boxes are blue-filled; unchecked stay white. */
function detectCheckboxChecked(canvas, bbox, scaleX, scaleY) {
  const x0 = Math.max(0, Math.floor(bbox.x0 * scaleX - 58))
  const x1 = Math.max(x0 + 8, Math.floor(bbox.x0 * scaleX - 6))
  const y0 = Math.max(0, Math.floor(bbox.y0 * scaleY + 2))
  const y1 = Math.min(canvas.height, Math.floor(bbox.y1 * scaleY - 2))
  const w = x1 - x0
  const h = y1 - y0
  if (w < 4 || h < 4) return true

  const ctx = canvas.getContext('2d')
  const { data, width, height } = ctx.getImageData(x0, y0, w, h)
  let colored = 0
  let total = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      total++
      const isWhite = r > 235 && g > 235 && b > 235
      if (isWhite) continue
      const isBlue = b > r + 15 && b > g
      const isDark = r < 100 && g < 100 && b < 100
      if (isBlue || isDark) colored++
    }
  }
  return total > 0 && colored / total > 0.06
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

function parseStudentsFromText(text) {
  const students = []
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseStudentLine(line)
    if (parsed) {
      students.push({ ...parsed, present: true })
    }
  }
  return students
}

export async function parseAttendanceScreenshot(fileOrDataUrl, onProgress, opts) {
  const options = { highAccuracy: false, ...opts }
  const maxW = options.highAccuracy ? 2200 : 1400
  const canvas = await loadImageToCanvas(fileOrDataUrl, { maxW })

  const worker = await getWorker()
  const result = await worker.recognize(canvas, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress ?? 0)
      }
    },
  })

  const ocrText = result.data.text || ''
  const meta = parseMetadataFromText(ocrText)

  const scaleX = canvas.width / (result.data.imageSize?.width || canvas.width)
  const scaleY = canvas.height / (result.data.imageSize?.height || canvas.height)

  const students = []
  const lines = result.data.lines || []

  for (const line of lines) {
    const parsed = parseStudentLine(line.text)
    if (!parsed) continue
    const present = detectCheckboxChecked(canvas, line.bbox, scaleX, scaleY)
    students.push({ ...parsed, present })
  }

  if (students.length < 3) {
    const fallback = parseStudentsFromText(ocrText)
    if (fallback.length > students.length) {
      return {
        meta,
        students: fallback,
        ocrText,
        previewUrl:
          typeof fileOrDataUrl === 'string'
            ? fileOrDataUrl
            : URL.createObjectURL(fileOrDataUrl),
        usedFallback: true,
      }
    }
  }

  return {
    meta,
    students,
    ocrText,
    previewUrl:
      typeof fileOrDataUrl === 'string'
        ? fileOrDataUrl
        : URL.createObjectURL(fileOrDataUrl),
    usedFallback: false,
  }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
