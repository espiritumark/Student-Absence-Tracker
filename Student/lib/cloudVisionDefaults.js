/**
 * Default cloud screenshot scan: OpenRouter + Nemotron VL (free, strong OCR).
 * @see https://openrouter.ai/nvidia/nemotron-nano-12b-v2-vl:free
 */

export const RECOMMENDED_CLOUD_VISION = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'nvidia/nemotron-nano-12b-v2-vl:free',
  label: 'OpenRouter · Nemotron VL (free)',
  signupUrl: 'https://openrouter.ai/settings/keys',
}

/**
 * Resolve server-side cloud vision config from process.env.
 * Only VISION_CLOUD_API_KEY is required when provider is openrouter (default).
 */
export function resolveCloudVisionConfig(env = {}) {
  const apiKey = String(env.VISION_CLOUD_API_KEY ?? '').trim()
  if (!apiKey || apiKey === 'your_vision_api_key_here' || apiKey === 'ollama') return null

  const provider = String(env.VISION_CLOUD_PROVIDER ?? RECOMMENDED_CLOUD_VISION.provider)
    .trim()
    .toLowerCase()

  let baseUrl = String(env.VISION_CLOUD_BASE_URL ?? '').trim().replace(/\/$/, '')
  let model = String(env.VISION_CLOUD_MODEL ?? '').trim()

  if (provider === 'openrouter' || (!baseUrl && !model)) {
    baseUrl = baseUrl || RECOMMENDED_CLOUD_VISION.baseUrl
    model = model || RECOMMENDED_CLOUD_VISION.model
  }

  if (!baseUrl || !model) return null
  if (/localhost|127\.0\.0\.1/.test(baseUrl)) return null

  return { apiKey, baseUrl, model, provider: provider || RECOMMENDED_CLOUD_VISION.provider }
}
