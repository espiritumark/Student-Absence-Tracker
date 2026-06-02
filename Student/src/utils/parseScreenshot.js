import { isVisionLlmConfigured, parseAttendanceWithVisionLlm } from './visionLlm'

export {
  isVisionLlmConfigured,
  checkVisionLlmConnection,
  isLocalVisionSetup,
  prewarmVisionModel,
} from './visionLlm'
export { parseMetadataFromText, parseStudentsFromText } from './screenshotTextParse'

/** @deprecated OCR removed — use isVisionLlmConfigured() */
export function isCloudOcrConfigured() {
  return false
}

/** @deprecated Roboflow removed — use isVisionLlmConfigured() */
export function isRoboflowCheckboxConfigured() {
  return false
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Screenshot import — vision LLM only (class, students, present/absent). */
export async function parseAttendanceScreenshot(fileOrDataUrl, onProgress, opts) {
  if (!isVisionLlmConfigured()) {
    throw new Error(
      'Vision AI is not configured. Add VITE_VISION_LLM_* to your .env file. For free local scanning, run Ollama with a vision model (see .env.example).',
    )
  }

  const dataUrl =
    typeof fileOrDataUrl === 'string' ? fileOrDataUrl : await fileToDataUrl(fileOrDataUrl)

  return parseAttendanceWithVisionLlm(dataUrl, onProgress, opts)
}
