import { spawn } from 'node:child_process'
import net from 'node:net'

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434
const START_TIMEOUT_MS = 45_000
const isWin = process.platform === 'win32'
const skipOllama =
  process.env.SKIP_OLLAMA === '1' || process.env.SKIP_OLLAMA === 'true'

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

let startedOllama = false
let ollamaProc = null
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

await ensureOllama()

vite = runVite()
vite.on('error', (err) => {
  console.error(`[dev] Failed to start Vite: ${err.message}`)
  shutdown(1)
})
vite.on('exit', (code) => shutdown(code ?? 0))

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))
