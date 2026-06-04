/**
 * Vercel serverless proxy for cloud screenshot vision scan.
 * Default: OpenRouter + nvidia/nemotron-nano-12b-v2-vl:free (free, OCR-focused).
 *
 * Server env (Vercel — NOT VITE_*):
 *   VISION_CLOUD_API_KEY     required — https://openrouter.ai/settings/keys
 *   VISION_CLOUD_PROVIDER    optional — openrouter (default)
 *   VISION_CLOUD_BASE_URL    optional — defaults to OpenRouter
 *   VISION_CLOUD_MODEL       optional — defaults to Nemotron VL free
 */

import { ATTENDANCE_VISION_PROMPT } from '../lib/attendanceVisionPrompt.js'
import { RECOMMENDED_CLOUD_VISION, resolveCloudVisionConfig } from '../lib/cloudVisionDefaults.js'

function cloudConfig() {
  return resolveCloudVisionConfig(process.env)
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

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const config = cloudConfig()
    if (!config) {
      return res.status(503).json({
        ok: false,
        message: `Cloud vision is not configured. Add VISION_CLOUD_API_KEY from ${RECOMMENDED_CLOUD_VISION.signupUrl} in Vercel (see DEPLOY.md).`,
      })
    }
    return res.status(200).json({ ok: true, model: config.model })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' })
  }

  const config = cloudConfig()
  if (!config) {
    return res.status(503).json({
      ok: false,
      message: 'Cloud vision API is not configured on the server.',
    })
  }

  const imageUrl = req.body?.imageUrl
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, message: 'Missing or invalid imageUrl (expected data:image/… base64).' })
  }

  if (imageUrl.length > 6_000_000) {
    return res.status(413).json({ ok: false, message: 'Image too large after encoding. Use a smaller screenshot.' })
  }

  const maxTokens = Number(req.body?.maxTokens) || 4096

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  if (config.baseUrl.includes('openrouter.ai')) {
    const site = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.VISION_CLOUD_SITE_URL || 'https://learning-partner-hub.vercel.app'
    headers['HTTP-Referer'] = site
    headers['X-Title'] = 'Learning Partner Hub'
  }

  let upstream
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
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
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    })
  } catch (err) {
    return res.status(502).json({
      ok: false,
      message: err?.message || 'Could not reach the vision API provider.',
    })
  }

  const errText = await upstream.text().catch(() => '')
  if (!upstream.ok) {
    let msg = `Vision API failed (${upstream.status}).`
    try {
      const errJson = JSON.parse(errText)
      msg = errJson.error?.message || errJson.message || msg
    } catch {
      if (errText) msg = `${msg} ${errText.slice(0, 200)}`
    }
    return res.status(502).json({ ok: false, message: msg })
  }

  let data
  try {
    data = JSON.parse(errText)
  } catch {
    return res.status(502).json({ ok: false, message: 'Vision API returned invalid JSON.' })
  }

  const text = readMessageContent(data.choices?.[0]?.message?.content)
  if (!text) {
    return res.status(502).json({ ok: false, message: 'Vision API returned no text. Try a clearer screenshot.' })
  }

  return res.status(200).json({ ok: true, text })
}
