import { exec } from 'node:child_process'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { loadEnvFile } from '../lib/loadEnv.mjs'

loadEnvFile()

const execAsync = promisify(exec)

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434
const PORTAL_BRIDGE_PORT = Number(process.env.PORTAL_BRIDGE_PORT || 3001)
const START_TIMEOUT_MS = 45_000
const isWin = process.platform === 'win32'
const skipOllama =
  process.env.SKIP_OLLAMA === '1' || process.env.SKIP_OLLAMA === 'true'
const skipPortalBridge =
  process.env.SKIP_PORTAL_BRIDGE === '1' || process.env.SKIP_PORTAL_BRIDGE === 'true'

function portOpen(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const finish = (ok) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
  })
}

async function waitForOllama(maxMs = START_TIMEOUT_MS) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    if (await portOpen(OLLAMA_HOST, OLLAMA_PORT)) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

function runVite() {
  const cmd = isWin ? 'npx.cmd' : 'npx'
  return spawn(cmd, ['vite'], {
    stdio: 'inherit',
    shell: isWin,
  })
}

function runPortalBridge() {
  return spawn('node', ['server/portal-bridge.mjs'], {
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  })
}

let startedOllama = false
let ollamaProc = null
let portalBridgeProc = null
let vite = null
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  if (vite && !vite.killed) {
    vite.kill('SIGTERM')
  }
  if (startedOllama && ollamaProc && !ollamaProc.killed) {
    ollamaProc.kill()
  }
  if (portalBridgeProc && !portalBridgeProc.killed) {
    portalBridgeProc.kill()
  }

  process.exit(code)
}

async function ensureOllama() {
  if (skipOllama) {
    console.log('[dev] SKIP_OLLAMA set — starting Vite without Ollama.')
    return
  }

  if (await portOpen(OLLAMA_HOST, OLLAMA_PORT)) {
    console.log('[dev] Ollama already running on port 11434.')
    return
  }

  console.log('[dev] Ollama not detected — starting `ollama serve`…')
  ollamaProc = spawn('ollama', ['serve'], {
    stdio: 'inherit',
    shell: isWin,
  })
  startedOllama = true

  ollamaProc.on('error', (err) => {
    console.error(`[dev] Failed to start Ollama: ${err.message}`)
    shutdown(1)
  })

  if (!(await waitForOllama())) {
    console.error('[dev] Ollama did not become ready on port 11434.')
    console.error('[dev] Install from https://ollama.com and run: ollama pull qwen2.5vl:7b')
    shutdown(1)
  }

  console.log('[dev] Ollama is ready.')
}

async function freePort(port) {
  if (!(await portOpen('127.0.0.1', port))) return

  console.log(`[dev] Freeing port ${port} for a fresh portal bridge…`)
  try {
    if (isWin) {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)
      const pids = new Set()
      for (const line of stdout.split('\n')) {
        if (!/LISTENING/i.test(line)) continue
        const pid = line.trim().split(/\s+/).at(-1)
        if (pid && /^\d+$/.test(pid)) pids.add(pid)
      }
      for (const pid of pids) {
        await execAsync(`taskkill /PID ${pid} /F`)
      }
    } else {
      await execAsync(`lsof -ti tcp:${port} | xargs -r kill -9`)
    }
  } catch {
    // Port may already be closed.
  }

  const started = Date.now()
  while (Date.now() - started < 5_000) {
    if (!(await portOpen('127.0.0.1', port))) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

async function portalBridgeStatus() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORTAL_BRIDGE_PORT}/api/portal/status`)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

async function ensurePortalBridge() {
  if (skipPortalBridge) {
    console.log('[dev] SKIP_PORTAL_BRIDGE set — portal class sync API disabled.')
    return
  }

  await freePort(PORTAL_BRIDGE_PORT)

  console.log('[dev] Starting portal bridge…')
  portalBridgeProc = runPortalBridge()
  portalBridgeProc.on('error', (err) => {
    console.error(`[dev] Failed to start portal bridge: ${err.message}`)
  })
  portalBridgeProc.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(
      `[dev] Portal bridge exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`,
    )
  })

  const started = Date.now()
  while (Date.now() - started < 10_000) {
    if (await portOpen('127.0.0.1', PORTAL_BRIDGE_PORT)) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!(await portOpen('127.0.0.1', PORTAL_BRIDGE_PORT))) {
    console.warn('[dev] Portal bridge did not open its port in time. Class sync may be unavailable.')
    return
  }

  const status = await portalBridgeStatus()
  if (!status?.configured) {
    console.warn(
      '[dev] Portal bridge is running but not configured. Add PORTAL_* to Student/.env and restart npm run dev.',
    )
    return
  }

  console.log(`[dev] Portal bridge is ready on port ${PORTAL_BRIDGE_PORT}.`)
}

await ensureOllama()
await ensurePortalBridge()

vite = runVite()
vite.on('error', (err) => {
  console.error(`[dev] Failed to start Vite: ${err.message}`)
  shutdown(1)
})
vite.on('exit', (code) => shutdown(code ?? 0))

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))
