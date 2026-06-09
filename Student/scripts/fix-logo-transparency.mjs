import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import os from 'os'

const inputPath = 'public/logo-original.png'
const outputPath = path.join('public', 'logo.png')

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info

function isCheckerPixel(r, g, b) {
  const spread = Math.max(r, g, b) - Math.min(r, g, b)
  if (spread > 10) return false
  const avg = (r + g + b) / 3
  if (avg >= 247) return true
  if (avg >= 215 && avg <= 235) return true
  return false
}

function idx(x, y) {
  return y * width + x
}

const transparent = new Uint8Array(width * height)
const queue = []

function tryEnqueue(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const i = idx(x, y)
  if (transparent[i]) return
  const o = i * channels
  if (!isCheckerPixel(data[o], data[o + 1], data[o + 2])) return
  transparent[i] = 1
  queue.push(i)
}

for (let x = 0; x < width; x += 1) {
  tryEnqueue(x, 0)
  tryEnqueue(x, height - 1)
}
for (let y = 0; y < height; y += 1) {
  tryEnqueue(0, y)
  tryEnqueue(width - 1, y)
}

while (queue.length) {
  const i = queue.pop()
  const x = i % width
  const y = Math.floor(i / width)
  tryEnqueue(x + 1, y)
  tryEnqueue(x - 1, y)
  tryEnqueue(x, y + 1)
  tryEnqueue(x, y - 1)
}

for (let pass = 0; pass < 120; pass += 1) {
  let changed = false
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(x, y)
      if (transparent[i]) continue
      const o = i * channels
      if (!isCheckerPixel(data[o], data[o + 1], data[o + 2])) continue
      const touchesTransparent =
        transparent[idx(x + 1, y)] ||
        transparent[idx(x - 1, y)] ||
        transparent[idx(x, y + 1)] ||
        transparent[idx(x, y - 1)]
      if (!touchesTransparent) continue
      transparent[i] = 1
      changed = true
    }
  }
  if (!changed) break
}

const visited = new Uint8Array(width * height)
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const start = idx(x, y)
    if (visited[start] || transparent[start]) continue
    const o = start * channels
    if (!isCheckerPixel(data[o], data[o + 1], data[o + 2])) continue

    const component = []
    const local = [start]
    visited[start] = 1
    let touchesBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1
    let whiteCount = 0

    while (local.length) {
      const i = local.pop()
      component.push(i)
      const px = i % width
      const py = Math.floor(i / width)
      const po = i * channels
      if (data[po] >= 247) whiteCount += 1
      if (px === 0 || py === 0 || px === width - 1 || py === height - 1) touchesBorder = true

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx
        const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = idx(nx, ny)
        if (visited[ni] || transparent[ni]) continue
        const no = ni * channels
        if (!isCheckerPixel(data[no], data[no + 1], data[no + 2])) continue
        visited[ni] = 1
        local.push(ni)
      }
    }

    const mostlyWhite = whiteCount / component.length > 0.85
    const keepBookWhite = mostlyWhite && component.length > 900
    if (touchesBorder || keepBookWhite) continue

    for (const i of component) {
      transparent[i] = 1
    }
  }
}

for (let i = 0; i < width * height; i += 1) {
  if (!transparent[i]) continue
  const o = i * channels
  data[o] = 0
  data[o + 1] = 0
  data[o + 2] = 0
  data[o + 3] = 0
}

const tempPath = path.join(os.tmpdir(), `lph-logo-${Date.now()}.png`)
await sharp(data, { raw: { width, height, channels } }).png().toFile(tempPath)
fs.copyFileSync(tempPath, outputPath)
fs.unlinkSync(tempPath)

const alpha0 = transparent.reduce((n, v) => n + v, 0)
console.log(`Wrote ${outputPath} with ${alpha0} transparent pixels`)
