import { parseAttendanceJson } from './parseAttendanceJson'

const ATTENDANCE_VISION_PROMPT = `You extract attendance data from a student portal screenshot.

Return ONLY a single JSON object (no markdown fences, no explanation) matching this exact shape:
{
  "session_details": {
    "class": "INTAKE 20 LEVEL 2 INTERNATIONAL CERTIFICATE IN INFORMATION TECHNOLOGY GROUP 2",
    "date": "02/06/2026",
    "module": "L2IT | USING IT TO SUPPORT INFORMATION AND COMMUNICATION IN ORGANISATIONS",
    "start_time": "8:15 AM",
    "duration": "2 Sessions"
  },
  "attendance": [
    { "no": 1, "name": "STUDENT FULL NAME", "status": "Present" },
    { "no": 2, "name": "ANOTHER STUDENT", "status": "Absent" }
  ],
  "summary": {
    "total_students": 2,
    "present": 1,
    "absent": 1
  }
}

Rules:
- Include every visible student row in list order
- status must be exactly "Present" or "Absent" from checkbox state (checked/filled = Present, empty/unchecked = Absent)
- Keep student names exactly as uppercase text shown on screen (including @, hyphens, etc.)
- summary counts must match the attendance array
- session_details.class is REQUIRED: copy the full class header from the top of the page (must include INTAKE, LEVEL, programme name, and GROUP). Never leave class empty if any part of that header is visible
- session_details.date is REQUIRED when shown (DD/MM/YYYY)
- Use empty string only for module, start_time, or duration when those fields are not visible on screen
- Do not skip any student rows`

function defaultBaseUrl() {
  return import.meta.env.VITE_VISION_LLM_BASE_URL?.trim() || 'http://localhost:11434/v1'
}

function isLocalVisionEndpoint(baseUrl = defaultBaseUrl()) {
  return /localhost|127\.0\.0\.1/.test(baseUrl)
}

export function isVisionLlmConfigured() {
  const key = import.meta.env.VITE_VISION_LLM_API_KEY?.trim()
  if (key && key !== 'your_vision_api_key_here') return true
  return isLocalVisionEndpoint()
}

function getVisionConfig() {
  const baseUrl = defaultBaseUrl().replace(/\/$/, '')
  const apiKey = import.meta.env.VITE_VISION_LLM_API_KEY?.trim()
  const model =
    import.meta.env.VITE_VISION_LLM_MODEL?.trim() || 'qwen2.5vl:7b'

  if (!apiKey && !isLocalVisionEndpoint(baseUrl)) {
    return null
  }

  return {
    apiKey: apiKey || 'ollama',
    baseUrl,
    model,
  }
}

export function isLocalVisionSetup() {
  const config = getVisionConfig()
  return Boolean(config && isLocalVisionEndpoint(config.baseUrl))
}

function ollamaOrigin(baseUrl) {
  return baseUrl.replace(/\/v1\/?$/, '')
}

/** Check that the vision backend is reachable (Ollama locally; cloud assumed OK). */
export async function checkVisionLlmConnection() {
  const config = getVisionConfig()
  if (!config) {
    return {
      ok: false,
      message: 'Vision AI is not configured. Add VITE_VISION_LLM_* to your .env file.',
    }
  }

  if (!isLocalVisionEndpoint(config.baseUrl)) {
    return { ok: true }
  }

  const origin = ollamaOrigin(config.baseUrl)

  try {
    const res = await fetch(`${origin}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      return {
        ok: false,
        message: 'Ollama is running but returned an error. Restart the Ollama app and try again.',
      }
    }

    const data = await res.json()
    const modelNames = (data.models ?? []).map((m) => m.name)
    const wanted = config.model
    const hasModel = modelNames.some(
      (name) => name === wanted || name.startsWith(`${wanted}:`) || name.includes(wanted),
    )

    if (!hasModel) {
      return {
        ok: false,
        message: `Model "${wanted}" is not installed. In a terminal run: ollama pull ${wanted}`,
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      message:
        'Ollama is not running on localhost:11434. Install it from ollama.com, open the Ollama app, run `ollama pull qwen2.5vl:7b` in a terminal, then refresh this page.',
    }
  }
}

function visionFetchError(config, err) {
  if (isLocalVisionEndpoint(config.baseUrl)) {
    return new Error(
      'Cannot connect to Ollama. Make sure the Ollama app is running, then run `ollama pull qwen2.5vl:7b` if you have not already.',
    )
  }
  return new Error(err?.message || 'Vision AI request failed. Check your network and API settings.')
}

function reportProgress(onProgress, stage, stepProgress = 1) {
  if (!onProgress) return

  const stageProgress = {
    'loading image': 0.02 + 0.08 * stepProgress,
    'vision analysis': 0.12 + 0.76 * stepProgress,
    'detecting attendance': 0.9 + 0.1 * stepProgress,
  }

  const labels = {
    'loading image': 'Preparing image…',
    'vision analysis': 'Analyzing screenshot with vision AI…',
    'detecting attendance': 'Building attendance JSON…',
  }

  onProgress({
    stage,
    progress: stageProgress[stage] ?? stepProgress,
    label: labels[stage] || stage,
  })
}

export function extractJsonFromLlmText(text) {
  const trimmed = String(text ?? '').trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)

  return trimmed
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load screenshot image.'))
    img.src = dataUrl
  })
}

async function compressDataUrl(dataUrl, maxWidth = 1800) {
  const img = await loadImage(dataUrl)
  if (img.width <= maxWidth) return dataUrl

  const scale = maxWidth / img.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

function readMessageContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part?.type === 'text') return part.text || ''
      return ''
    })
    .join('\n')
    .trim()
}

/**
 * Parse an attendance screenshot using a vision LLM.
 * Returns the same shape as parseAttendanceJson.
 */
export async function parseAttendanceWithVisionLlm(dataUrl, onProgress, opts = {}) {
  const config = getVisionConfig()
  if (!config) {
    throw new Error(
      'Vision AI is not configured. Add VITE_VISION_LLM_API_KEY or point VITE_VISION_LLM_BASE_URL at local Ollama (see .env.example).',
    )
  }

  reportProgress(onProgress, 'loading image', 0)
  const imageUrl = await compressDataUrl(dataUrl)
  reportProgress(onProgress, 'loading image', 1)

  reportProgress(onProgress, 'vision analysis', 0.1)

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  if (config.baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Student Absence Tracker'
  }

  let response
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: opts.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: ATTENDANCE_VISION_PROMPT },
            ],
          },
        ],
        max_tokens: 8192,
        temperature: 0.1,
      }),
    })
  } catch (err) {
    throw visionFetchError(config, err)
  }

  reportProgress(onProgress, 'vision analysis', 0.85)

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    let msg = `Vision AI request failed (${response.status}). Check your API key and model.`
    try {
      const errJson = JSON.parse(errText)
      msg = errJson.error?.message || errJson.message || msg
    } catch {
      if (errText) msg = `${msg} ${errText.slice(0, 200)}`
    }
    throw new Error(msg)
  }

  const data = await response.json()
  const text = readMessageContent(data.choices?.[0]?.message?.content)

  if (!text) {
    throw new Error('Vision AI returned no text. Try a clearer screenshot.')
  }

  reportProgress(onProgress, 'vision analysis', 1)
  reportProgress(onProgress, 'detecting attendance', 0)

  let parsed
  try {
    const jsonText = extractJsonFromLlmText(text)
    parsed = parseAttendanceJson(jsonText, { lenient: true, repairSession: true })
  } catch (e) {
    throw new Error(e.message || 'Vision AI returned invalid attendance JSON.')
  }

  reportProgress(onProgress, 'detecting attendance', 1)

  return {
    ...parsed,
    previewUrl: dataUrl,
    portalJson: extractJsonFromLlmText(text),
    ocrEngine: `vision:${config.model}`,
    usedFallback: false,
    visionLlm: true,
  }
}
