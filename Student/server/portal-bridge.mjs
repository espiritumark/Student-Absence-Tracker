/* eslint-env node */
import http from 'node:http'
import { loadEnvFile } from '../lib/loadEnv.mjs'
import { PortalClient, readPortalConfig } from '../lib/portalClient.js'

loadEnvFile()

const PORT = Number(process.env.PORTAL_BRIDGE_PORT || 3001)
let client = null
let clientConfigKey = ''

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function configKey(config) {
  return [config.baseUrl, config.username, config.password, config.classesUrl].join('\0')
}

function getClient() {
  loadEnvFile()
  const config = readPortalConfig()
  const key = configKey(config)

  if (!config.configured) {
    client = null
    clientConfigKey = ''
    return { client: null, config }
  }

  if (!client || clientConfigKey !== key) {
    client = new PortalClient(config)
    clientConfigKey = key
  }

  return { client, config }
}

async function handleStatus(_req, res) {
  const { client: active, config } = getClient()
  json(res, 200, {
    ok: true,
    configured: config.configured,
    loggedIn: Boolean(active?.loggedIn),
    baseUrl: config.baseUrl || null,
  })
}

async function handleClasses(req, res) {
  const { config } = getClient()
  if (!config.configured) {
    return json(res, 503, {
      ok: false,
      message:
        'Portal bridge is not configured. Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
    })
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const includeRosters =
    url.searchParams.get('includeRosters') === '1' ||
    url.searchParams.get('includeRosters') === 'true'

  try {
    client = null
    clientConfigKey = ''
    const { client: fresh } = getClient()
    const classes = includeRosters
      ? await fresh.fetchClassesWithRosters()
      : await fresh.fetchClasses()
    json(res, 200, { ok: true, classes, includeRosters })
  } catch (error) {
    client = null
    clientConfigKey = ''
    json(res, 502, {
      ok: false,
      message: error?.message || 'Failed to fetch classes from the college portal.',
    })
  }
}

async function handleClassMarkAttendance(req, res, portalClassId) {
  const { config } = getClient()
  if (!config.configured) {
    return json(res, 503, {
      ok: false,
      message:
        'Portal bridge is not configured. Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
    })
  }

  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    return json(res, 400, { ok: false, message: 'Invalid portal class id.' })
  }

  let includeDetails = req.url?.includes('details=1')
  let rosterStudents = []
  let moduleId = null
  let classModuleId = null
  let moduleLabel = ''
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      includeDetails = body.includeDetails !== false
      rosterStudents = Array.isArray(body.rosterStudents) ? body.rosterStudents : []
      if (body.moduleId != null) moduleId = Number(body.moduleId)
      if (body.classModuleId != null) classModuleId = Number(body.classModuleId)
      moduleLabel = String(body.moduleLabel || '').trim()
    } catch {
      return json(res, 400, { ok: false, message: 'Invalid JSON body.' })
    }
  }

  try {
    client = null
    clientConfigKey = ''
    const { client: fresh } = getClient()
    const markAttendance = includeDetails
      ? await fresh.fetchClassMarkAttendanceDetails(id, {
          rosterStudents,
          moduleId: Number.isFinite(moduleId) ? moduleId : null,
          classModuleId: Number.isFinite(classModuleId) ? classModuleId : null,
          moduleLabel,
        })
      : await fresh.fetchClassMarkAttendance(id)
    json(res, 200, { ok: true, markAttendance })
  } catch (error) {
    client = null
    clientConfigKey = ''
    json(res, 502, {
      ok: false,
      message: error?.message || 'Failed to fetch portal mark attendance.',
    })
  }
}

async function handleResolveModule(req, res, portalClassId) {
  const { config } = getClient()
  if (!config.configured) {
    return json(res, 503, {
      ok: false,
      message:
        'Portal bridge is not configured. Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
    })
  }

  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    return json(res, 400, { ok: false, message: 'Invalid portal class id.' })
  }

  let rosterStudents = []
  let moduleLabel = ''
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      rosterStudents = Array.isArray(body.rosterStudents) ? body.rosterStudents : []
      moduleLabel = String(body.moduleLabel || '').trim()
    } catch {
      return json(res, 400, { ok: false, message: 'Invalid JSON body.' })
    }
  }

  try {
    client = null
    clientConfigKey = ''
    const { client: fresh } = getClient()
    const moduleId = await fresh.resolveModuleIdForLabel(rosterStudents, moduleLabel)
    json(res, 200, { ok: true, moduleId })
  } catch (error) {
    client = null
    clientConfigKey = ''
    json(res, 502, {
      ok: false,
      message: error?.message || 'Failed to resolve portal module id.',
    })
  }
}

async function handleMonitoringSnapshot(req, res) {
  const { config } = getClient()
  if (!config.configured) {
    return json(res, 503, {
      ok: false,
      message:
        'Portal bridge is not configured. Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
    })
  }

  let portalClassIds = []
  let concurrency = 6
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      if (Array.isArray(body.portalClassIds)) {
        portalClassIds = body.portalClassIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      }
      if (body.concurrency != null) {
        const parsed = Number(body.concurrency)
        if (Number.isFinite(parsed) && parsed > 0) concurrency = Math.min(parsed, 12)
      }
    } catch {
      return json(res, 400, { ok: false, message: 'Invalid JSON body.' })
    }
  }

  try {
    client = null
    clientConfigKey = ''
    const { client: fresh } = getClient()
    const snapshot = await fresh.fetchMonitoringSnapshot({ portalClassIds, concurrency })
    json(res, 200, { ok: true, snapshot })
  } catch (error) {
    client = null
    clientConfigKey = ''
    json(res, 502, {
      ok: false,
      message: error?.message || 'Failed to pull monitoring snapshot from the college portal.',
    })
  }
}

async function handleClassRoster(_req, res, portalClassId) {
  const { config } = getClient()
  if (!config.configured) {
    return json(res, 503, {
      ok: false,
      message:
        'Portal bridge is not configured. Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
    })
  }

  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    return json(res, 400, { ok: false, message: 'Invalid portal class id.' })
  }

  try {
    client = null
    clientConfigKey = ''
    const { client: fresh } = getClient()
    const roster = await fresh.fetchClassRoster(id)
    const modules =
      roster.modules?.length > 0
        ? roster.modules
        : await fresh.fetchClassModules(id, {
            rosterStudents: roster.students ?? [],
          })
    json(res, 200, { ok: true, roster: { ...roster, modules } })
  } catch (error) {
    client = null
    clientConfigKey = ''
    json(res, 502, {
      ok: false,
      message: error?.message || 'Failed to fetch class roster from the college portal.',
    })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  try {
    if (req.method === 'GET' && path === '/api/portal/status') {
      return handleStatus(req, res)
    }
    if (req.method === 'GET' && path === '/api/portal/classes') {
      return handleClasses(req, res)
    }
    if (req.method === 'POST' && path === '/api/portal/monitoring-snapshot') {
      return handleMonitoringSnapshot(req, res)
    }
    const rosterMatch = path.match(/^\/api\/portal\/class\/(\d+)\/roster$/)
    if (req.method === 'GET' && rosterMatch) {
      return handleClassRoster(req, res, rosterMatch[1])
    }
    const markMatch = path.match(/^\/api\/portal\/class\/(\d+)\/mark-attendance$/)
    if (
      (req.method === 'GET' || req.method === 'POST') &&
      markMatch
    ) {
      return handleClassMarkAttendance(req, res, markMatch[1])
    }
    const resolveMatch = path.match(/^\/api\/portal\/class\/(\d+)\/resolve-module$/)
    if (req.method === 'POST' && resolveMatch) {
      return handleResolveModule(req, res, resolveMatch[1])
    }
    json(res, 404, { ok: false, message: 'Not found' })
  } catch (error) {
    json(res, 500, {
      ok: false,
      message: error?.message || 'Portal bridge error',
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  loadEnvFile()
  const config = readPortalConfig()
  console.log(`[portal-bridge] listening on http://127.0.0.1:${PORT}`)
  if (!config.configured) {
    console.log('[portal-bridge] Not configured — add PORTAL_* to Student/.env to enable class sync.')
  } else {
    console.log(`[portal-bridge] Configured for ${config.baseUrl}`)
  }
})
