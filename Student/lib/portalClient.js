/* eslint-env node */
import {
  extractPortalClassLinks,
  looksLikePortalLoginPage,
} from './parsePortalClassList.js'
import { extractPortalClassPage, normalizePortalName, extractPortalClassModuleOptions, normalizePortalClassModules, resolvePortalGridModuleId, resolvePortalModuleByLabel } from './parsePortalRoster.js'
import { extractPortalMarkAttendance } from './parsePortalMarkAttendance.js'
import {
  buildPortalModuleIdMap,
  extractPortalStudentModuleAttendance,
  extractPortalStudentModules,
  pickMatchingPortalModule,
  resolveViewModuleId,
} from './parsePortalStudentAttendance.js'

function readAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')
  const m = String(tag || '').match(re)
  return m?.[1] ?? ''
}

function resolveUrl(base, href) {
  try {
    return new URL(href, base).href
  } catch {
    return base
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  ingest(response) {
    const raw =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean)

    for (const line of raw) {
      const part = String(line).split(';')[0]
      const eq = part.indexOf('=')
      if (eq < 1) continue
      const name = part.slice(0, eq).trim()
      const value = part.slice(eq + 1).trim()
      if (name) this.cookies.set(name, value)
    }
  }

  header() {
    if (!this.cookies.size) return ''
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

function stripButtonText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** index.php often returns only `window.open('login.php','_self')`. */
function extractJsRedirectTarget(html, pageUrl) {
  const text = String(html || '')
  const windowOpen = text.match(/window\.open\(\s*['"]([^'"]+)['"]/i)
  if (windowOpen?.[1]) return resolveUrl(pageUrl, windowOpen[1])

  const locationHref = text.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i)
  if (locationHref?.[1]) return resolveUrl(pageUrl, locationHref[1])

  const metaRefresh = text.match(/content\s*=\s*["'][^"']*url=([^"';]+)/i)
  if (metaRefresh?.[1]) return resolveUrl(pageUrl, metaRefresh[1].trim())

  return null
}

function findLoginForm(html, pageUrl) {
  const forms = [...String(html || '').matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gi)]
  for (const form of forms) {
    const body = form[2]
    if (!/<input[^>]*type=["']password["']/i.test(body)) continue

    const fields = {}
    for (const input of body.matchAll(/<input([^>]*)\/?>/gi)) {
      const tag = input[1]
      const name = readAttr(tag, 'name')
      if (!name) continue
      const type = readAttr(tag, 'type').toLowerCase() || 'text'
      if (type === 'button' || type === 'image') continue
      if (type === 'submit') {
        fields[name] = readAttr(tag, 'value') || 'Login'
        continue
      }
      fields[name] = readAttr(tag, 'value')
    }

    for (const button of body.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const name = readAttr(button[1], 'name')
      if (!name) continue
      fields[name] = readAttr(button[1], 'value') || stripButtonText(button[2])
    }

    const action = resolveUrl(pageUrl, readAttr(form[1], 'action') || pageUrl)
    const method = (readAttr(form[1], 'method') || 'post').toLowerCase()
    return { action, method, fields }
  }
  return null
}

function applyCredentials(fields, username, password, config) {
  const next = { ...fields }
  const keys = Object.keys(next)

  const passKey =
    config.passwordField ||
    keys.find((k) => /pass/i.test(k)) ||
    'password'

  let userKey =
    config.usernameField ||
    keys.find((k) => /email/i.test(k)) ||
    keys.find((k) => /user|login/i.test(k) && !/pass/i.test(k) && !/_login$/i.test(k))

  if (!userKey) {
    userKey = keys.find((k) => k !== passKey && !/hidden|csrf|token/i.test(k))
  }

  if (userKey) next[userKey] = username
  if (passKey) next[passKey] = password
  return next
}

function extractLoginErrorMessage(html) {
  const scriptAlert = String(html || '').match(/alert\s*\(\s*['"]([^'"]+)['"]/i)
  return scriptAlert?.[1]?.trim() || ''
}

function buildBody(fields, method) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, value ?? '')
  }
  if (method === 'get') {
    return { body: null, query: params.toString() }
  }
  return {
    body: params.toString(),
    query: '',
  }
}

export function readPortalConfig(env = process.env) {
  const baseUrl = String(env.PORTAL_BASE_URL || '').replace(/\/$/, '')
  const username = String(env.PORTAL_USERNAME || '').trim()
  const password = String(env.PORTAL_PASSWORD || '').trim()
  const classesPath = env.PORTAL_CLASSES_PATH || '/index.php'
  const loginPath = env.PORTAL_LOGIN_PATH || '/login.php'

  return {
    baseUrl,
    username,
    password,
    classesUrl: baseUrl ? resolveUrl(baseUrl, classesPath) : '',
    loginUrl: baseUrl ? resolveUrl(baseUrl, loginPath) : '',
    usernameField: env.PORTAL_LOGIN_USER_FIELD || '',
    passwordField: env.PORTAL_LOGIN_PASS_FIELD || '',
    configured: Boolean(baseUrl && username && password),
  }
}

export class PortalClient {
  constructor(config = readPortalConfig()) {
    this.config = config
    this.jar = new CookieJar()
    this.loggedIn = false
    this.lastError = ''
  }

  async request(url, { method = 'GET', body = null, headers = {} } = {}) {
    const cookie = this.jar.header()
    const response = await fetch(url, {
      method,
      body,
      redirect: 'manual',
      headers: {
        'User-Agent': 'LearningPartnerHub/1.0',
        Accept: 'text/html,application/xhtml+xml',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...headers,
      },
    })

    this.jar.ingest(response)

    const location = response.headers.get('location')
    if (location && response.status >= 300 && response.status < 400) {
      const nextUrl = resolveUrl(url, location)
      return this.request(nextUrl, { method: 'GET', headers })
    }

    const text = await response.text()
    return { response, text, url }
  }

  async resolveLoginPage() {
    let page = await this.request(this.config.loginUrl)
    let html = page.text
    let pageUrl = page.url

    const redirect = extractJsRedirectTarget(html, pageUrl)
    if (redirect && html.length < 600 && !findLoginForm(html, pageUrl)) {
      page = await this.request(redirect)
      html = page.text
      pageUrl = page.url
    }

    if (!findLoginForm(html, pageUrl) && !looksLikePortalLoginPage(html)) {
      const fallback = resolveUrl(this.config.baseUrl, '/login.php')
      if (fallback !== pageUrl) {
        page = await this.request(fallback)
        html = page.text
        pageUrl = page.url
      }
    }

    return { html, pageUrl }
  }

  async login() {
    if (!this.config.configured) {
      throw new Error('Portal bridge is not configured. Add PORTAL_* vars to Student/.env')
    }

    const start = await this.resolveLoginPage()
    let html = start.html
    const pageUrl = start.pageUrl

    if (!looksLikePortalLoginPage(html)) {
      const classCount = extractPortalClassLinks(html).length
      if (classCount > 0) {
        this.loggedIn = true
        return { ok: true, alreadyAuthenticated: true }
      }
    }

    const form = findLoginForm(html, pageUrl)
    if (!form) {
      throw new Error(
        'Could not find a login form on the college portal page. Set PORTAL_LOGIN_PATH=/login.php in Student/.env.',
      )
    }

    const payload = applyCredentials(
      form.fields,
      this.config.username,
      this.config.password,
      this.config,
    )
    const built = buildBody(payload, form.method)
    const submitUrl =
      form.method === 'get'
        ? `${form.action}${form.action.includes('?') ? '&' : '?'}${built.query}`
        : form.action

    const loginRes = await this.request(submitUrl, {
      method: form.method === 'get' ? 'GET' : 'POST',
      body: built.body,
      headers: {
        Referer: pageUrl,
        Origin: this.config.baseUrl,
      },
    })

    html = loginRes.text

    const portalMessage = extractLoginErrorMessage(html)
    if (portalMessage) {
      throw new Error(portalMessage)
    }

    const classesProbe = await this.request(this.config.classesUrl)
    if (extractPortalClassLinks(classesProbe.text).length > 0) {
      this.loggedIn = true
      return { ok: true }
    }

    if (extractPortalClassLinks(html).length > 0 || !looksLikePortalLoginPage(html)) {
      this.loggedIn = true
      return { ok: true }
    }

    const redirect = extractJsRedirectTarget(html, loginRes.url)
    if (redirect) {
      const next = await this.request(redirect)
      if (
        extractPortalClassLinks(next.text).length > 0 ||
        !looksLikePortalLoginPage(next.text)
      ) {
        this.loggedIn = true
        return { ok: true }
      }
    }

    if (looksLikePortalLoginPage(html) || looksLikePortalLoginPage(classesProbe.text)) {
      throw new Error(
        'Portal login failed. Check PORTAL_USERNAME and PORTAL_PASSWORD in .env',
      )
    }

    this.loggedIn = true
    return { ok: true }
  }

  async fetchClassListHtml() {
    if (!this.loggedIn) {
      await this.login()
    }

    const page = await this.request(this.config.classesUrl)
    if (looksLikePortalLoginPage(page.text)) {
      this.loggedIn = false
      await this.login()
      const retry = await this.request(this.config.classesUrl)
      if (looksLikePortalLoginPage(retry.text)) {
        throw new Error('Portal session expired and re-login failed.')
      }
      return retry.text
    }
    return page.text
  }

  async fetchClasses() {
    const html = await this.fetchClassListHtml()
    const classes = extractPortalClassLinks(html)
    if (!classes.length) {
      throw new Error(
        'No classes found in the portal HTML. Open PORTAL_CLASSES_PATH in a browser while signed in and confirm class links use ?class=ID.',
      )
    }
    return classes
  }

  classPageUrl(portalClassId) {
    const id = Number(portalClassId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Invalid portal class id.')
    }
    return resolveUrl(this.config.baseUrl, `/index.php?class=${id}`)
  }

  markAttendanceUrl(portalClassId) {
    const id = Number(portalClassId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Invalid portal class id.')
    }
    return resolveUrl(this.config.baseUrl, `/index.php?view_markatd=${id}`)
  }

  studentAttendanceUrl(portalStudentId) {
    const id = Number(portalStudentId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Invalid portal student id.')
    }
    return resolveUrl(this.config.baseUrl, `/index.php?view_student=${id}`)
  }

  studentModuleAttendanceUrl(moduleId, portalStudentId) {
    const module = Number(moduleId)
    const student = Number(portalStudentId)
    if (!Number.isFinite(module) || module <= 0 || !Number.isFinite(student) || student <= 0) {
      throw new Error('Invalid portal student module id.')
    }
    return resolveUrl(
      this.config.baseUrl,
      `/index.php?view_studentmodule=${module}&student_id=${student}`,
    )
  }

  async fetchPortalPageHtml(url) {
    if (!this.loggedIn) {
      await this.login()
    }

    const page = await this.request(url)
    if (looksLikePortalLoginPage(page.text)) {
      this.loggedIn = false
      await this.login()
      const retry = await this.request(url)
      if (looksLikePortalLoginPage(retry.text)) {
        throw new Error('Portal session expired and re-login failed.')
      }
      return retry.text
    }
    return page.text
  }

  async fetchClassPageHtml(portalClassId) {
    return this.fetchPortalPageHtml(this.classPageUrl(portalClassId))
  }

  async fetchClassRoster(portalClassId, { allowEmpty = false } = {}) {
    const html = await this.fetchClassPageHtml(portalClassId)
    const page = extractPortalClassPage(html)
    if (!page.students.length && !allowEmpty) {
      throw new Error(
        `No students found for portal class ${portalClassId}. Open index.php?class=${portalClassId} in a browser while signed in to confirm the roster loads.`,
      )
    }
    return {
      portalClassId: page.portalClassId ?? Number(portalClassId),
      classLabel: page.classLabel,
      expectedCount: page.expectedCount,
      students: page.students,
      session: page.session,
      hasAttendance: page.hasAttendance,
      modules: normalizePortalClassModules(page.modules ?? []),
    }
  }

  async fetchClassMarkAttendance(portalClassId) {
    const html = await this.fetchPortalPageHtml(this.markAttendanceUrl(portalClassId))
    const summary = extractPortalMarkAttendance(html)
    return {
      portalClassId: Number(portalClassId),
      ...summary,
    }
  }

  async fetchClassModules(portalClassId, { rosterStudents = [] } = {}) {
    let classModules = []
    try {
      const classHtml = await this.fetchClassPageHtml(portalClassId)
      try {
        classModules = extractPortalClassPage(classHtml).modules ?? []
      } catch {
        classModules = extractPortalClassModuleOptions(classHtml)
      }
    } catch {
      return []
    }

    if (!classModules.length) return []

    const labelToViewModuleId = new Map()
    const sample = (rosterStudents ?? []).find((student) => student.portalStudentId)
    if (sample?.portalStudentId) {
      try {
        const studentHtml = await this.fetchPortalPageHtml(
          this.studentAttendanceUrl(sample.portalStudentId),
        )
        const moduleIdMap = buildPortalModuleIdMap(
          extractPortalStudentModules(studentHtml, sample.portalStudentId),
        )
        for (const [label, viewId] of moduleIdMap) {
          labelToViewModuleId.set(label, viewId)
        }
      } catch {
        // View module ids are optional; label matching still works for attendance.
      }
    }

    return normalizePortalClassModules(
      classModules.map((mod) => {
        const moduleId = resolveViewModuleId(labelToViewModuleId, mod.label) ?? mod.classModuleId
        return {
          classModuleId: mod.classModuleId,
          moduleId,
          label: mod.label,
        }
      }),
    )
  }

  async resolveModuleIdForLabel(rosterStudents = [], moduleLabel = '') {
    const label = String(moduleLabel || '').trim()
    if (!label) return null
    const sample = (rosterStudents ?? []).find((student) => student?.portalStudentId)
    if (!sample?.portalStudentId) return null
    try {
      const studentHtml = await this.fetchPortalPageHtml(
        this.studentAttendanceUrl(sample.portalStudentId),
      )
      const modules = extractPortalStudentModules(studentHtml, sample.portalStudentId)
      const picked = pickMatchingPortalModule(modules, { moduleLabel: label })
      return picked?.module?.moduleId ?? null
    } catch {
      return null
    }
  }

  async fetchStudentModuleAttendance(portalStudentId, moduleId) {
    const student = Number(portalStudentId)
    const module = Number(moduleId)
    const moduleHtml = await this.fetchPortalPageHtml(
      this.studentModuleAttendanceUrl(module, student),
    )
    const grid = extractPortalStudentModuleAttendance(moduleHtml)
    const sessions = (grid.sessions ?? []).map((session) => ({
      ...session,
      moduleId: session.moduleId ?? module,
    }))
    const presentCount =
      grid.presentCount ?? sessions.filter((session) => session.status === 'P').length
    const absentCount =
      grid.absentCount ?? sessions.filter((session) => session.status === 'A').length
    const totalSessions = grid.totalSessions ?? sessions.length
    let percentPresent = grid.percentPresent ?? null
    if (percentPresent == null && totalSessions > 0) {
      percentPresent = Math.round((presentCount / totalSessions) * 10000) / 100
    }
    let consecutiveAbsent = grid.consecutiveAbsent ?? 0
    if (grid.consecutiveAbsent == null) {
      consecutiveAbsent = 0
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index].status !== 'A') break
        consecutiveAbsent += 1
      }
    }

    return {
      portalStudentId: student,
      moduleId: module,
      sessions,
      presentCount,
      absentCount,
      totalSessions,
      percentPresent,
      consecutiveAbsent,
      marks: sessions.map((session) => session.status),
      matchedModuleId: module,
      matchedModuleLabel: '',
      moduleMatch: 'id',
    }
  }

  async fetchStudentAttendanceSummary(
    portalStudentId,
    { moduleId = null, moduleLabel = '' } = {},
  ) {
    const emptySummary = {
      portalStudentId: Number(portalStudentId),
      presentCount: null,
      absentCount: null,
      totalSessions: null,
      percentPresent: null,
      consecutiveAbsent: null,
      modules: [],
      sessions: [],
      matchedModuleId: null,
      matchedModuleLabel: '',
      moduleMatch: 'none',
    }

    const resolvedModuleId =
      moduleId != null && Number.isFinite(Number(moduleId)) && Number(moduleId) > 0
        ? Number(moduleId)
        : null

    if (resolvedModuleId != null) {
      try {
        const direct = await this.fetchStudentModuleAttendance(portalStudentId, resolvedModuleId)
        return {
          ...direct,
          modules: [],
          matchedModuleLabel: moduleLabel || direct.matchedModuleLabel || '',
        }
      } catch {
        return { ...emptySummary, matchedModuleId: resolvedModuleId }
      }
    }

    const studentHtml = await this.fetchPortalPageHtml(this.studentAttendanceUrl(portalStudentId))
    const modules = extractPortalStudentModules(studentHtml, portalStudentId)

    if (!modules.length) return emptySummary

    const picked = pickMatchingPortalModule(modules, { moduleId, moduleLabel })
    if (!picked) {
      return {
        ...emptySummary,
        modules,
        moduleMatch: 'none',
      }
    }

    const target = picked.module
    try {
      const direct = await this.fetchStudentModuleAttendance(portalStudentId, target.moduleId)
      return {
        ...direct,
        modules,
        moduleLabel: target.label || '',
        matchedModuleLabel: target.label || '',
        moduleMatch: picked.match,
      }
    } catch {
      return {
        ...emptySummary,
        modules,
        matchedModuleId: target.moduleId,
        matchedModuleLabel: target.label || '',
        moduleMatch: picked.match,
      }
    }
  }

  buildStudentAttendanceFetchList(summaryStudents = [], rosterStudents = []) {
    const markByNorm = new Map()
    for (const student of summaryStudents) {
      const norm = normalizePortalName(student.name)
      if (norm) markByNorm.set(norm, student)
    }

    const byId = new Map()
    const addStudent = (portalStudentId, name, percentPresent = null) => {
      if (!portalStudentId) return
      const existing = byId.get(portalStudentId) ?? {}
      byId.set(portalStudentId, {
        portalStudentId,
        name: name || existing.name || '',
        percentPresent: percentPresent ?? existing.percentPresent ?? null,
      })
    }

    for (const student of summaryStudents) {
      addStudent(student.portalStudentId, student.name, student.percentPresent)
    }

    for (const student of rosterStudents) {
      const norm = normalizePortalName(student.name)
      const mark = norm ? markByNorm.get(norm) : null
      addStudent(
        student.portalStudentId ?? mark?.portalStudentId ?? null,
        student.name,
        mark?.percentPresent ?? null,
      )
    }

    return [...byId.values()].filter((student) => student.portalStudentId)
  }

  async fetchClassMarkAttendanceDetails(
    portalClassId,
    {
      concurrency = 2,
      rosterStudents = [],
      moduleId = null,
      classModuleId = null,
      moduleLabel = '',
    } = {},
  ) {
    let classModuleLabel = String(moduleLabel || '').trim()
    let resolvedModuleId =
      classModuleId != null && Number.isFinite(Number(classModuleId)) && Number(classModuleId) > 0
        ? Number(classModuleId)
        : moduleId != null && Number.isFinite(Number(moduleId)) && Number(moduleId) > 0
          ? Number(moduleId)
          : null

    let fetchList = this.buildStudentAttendanceFetchList([], rosterStudents)

    if (!resolvedModuleId && classModuleLabel) {
      try {
        const roster = await this.fetchClassRoster(portalClassId, { allowEmpty: true })
        resolvedModuleId = resolvePortalModuleByLabel(roster.modules, classModuleLabel)
      } catch {
        // Fall back to student-page module resolution.
      }
    }

    if (!resolvedModuleId && classModuleLabel) {
      resolvedModuleId = await this.resolveModuleIdForLabel(fetchList, classModuleLabel)
    }

    let summary = {
      portalClassId: Number(portalClassId),
      classLabel: '',
      moduleLabel: '',
      students: [],
    }

    if (!resolvedModuleId) {
      try {
        summary = await this.fetchClassMarkAttendance(portalClassId)
      } catch {
        summary = {
          portalClassId: Number(portalClassId),
          classLabel: '',
          moduleLabel: '',
          students: [],
        }
      }
      if (!classModuleLabel) {
        classModuleLabel = summary.moduleLabel || ''
      }
      fetchList = this.buildStudentAttendanceFetchList(summary.students ?? [], rosterStudents)
      if (!resolvedModuleId && classModuleLabel) {
        resolvedModuleId = await this.resolveModuleIdForLabel(fetchList, classModuleLabel)
      }
    }

    if (!classModuleLabel) {
      try {
        const classHtml = await this.fetchClassPageHtml(portalClassId)
        const classPage = extractPortalClassPage(classHtml)
        classModuleLabel = classPage.session?.module || classModuleLabel
      } catch {
        // Class attendance page may be unavailable; fall back to mark-summary module label.
      }
    }

    const moduleIdByStudent = new Map()
    for (const student of summary.students ?? []) {
      if (student.portalStudentId != null && student.moduleId != null) {
        moduleIdByStudent.set(student.portalStudentId, student.moduleId)
      }
    }

    const details = {}
    let index = 0
    const effectiveModuleId = resolvedModuleId

    async function worker() {
      while (index < fetchList.length) {
        const current = index
        index += 1
        const student = fetchList[current]
        if (!student?.portalStudentId) continue
        const targetModuleId =
          effectiveModuleId ?? moduleIdByStudent.get(student.portalStudentId) ?? null
        try {
          details[student.portalStudentId] = await this.fetchStudentAttendanceSummary(
            student.portalStudentId,
            {
              moduleId: targetModuleId,
              moduleLabel: classModuleLabel,
            },
          )
          if (
            student.percentPresent != null &&
            details[student.portalStudentId] &&
            details[student.portalStudentId].percentPresent == null
          ) {
            details[student.portalStudentId].percentPresent = student.percentPresent
          }
        } catch {
          details[student.portalStudentId] = {
            portalStudentId: student.portalStudentId,
            presentCount: null,
            absentCount: null,
            percentPresent: student.percentPresent ?? null,
            consecutiveAbsent: null,
            modules: [],
            sessions: [],
            matchedModuleId: targetModuleId,
            matchedModuleLabel: classModuleLabel,
            moduleMatch: 'none',
          }
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(fetchList.length, 1)) },
      () => worker.call(this),
    )
    await Promise.all(workers)

    const mergedStudents = [...(summary.students ?? [])]
    const seenNorm = new Set(mergedStudents.map((student) => normalizePortalName(student.name)))
    for (const student of fetchList) {
      const norm = normalizePortalName(student.name)
      if (!norm || seenNorm.has(norm)) continue
      seenNorm.add(norm)
      mergedStudents.push({
        portalStudentId: student.portalStudentId,
        name: student.name,
        percentPresent: student.percentPresent,
      })
    }

    return {
      ...summary,
      moduleId: effectiveModuleId,
      moduleLabel: classModuleLabel || summary.moduleLabel || '',
      students: mergedStudents,
      studentSummaries: details,
      fetchedStudentCount: Object.values(details).filter(
        (entry) => (entry.sessions ?? []).length > 0,
      ).length,
    }
  }

  async fetchClassesWithRosters({ concurrency = 4 } = {}) {
    const classes = await this.fetchClasses()
    const rosterById = new Map()
    let index = 0

    async function worker() {
      while (index < classes.length) {
        const current = index
        index += 1
        const portalClass = classes[current]
        try {
          const roster = await this.fetchClassRoster(portalClass.portalClassId, {
            allowEmpty: true,
          })
          rosterById.set(portalClass.portalClassId, roster)
        } catch {
          rosterById.set(portalClass.portalClassId, { students: [] })
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, classes.length) },
      () => worker.call(this),
    )
    await Promise.all(workers)

    const withRosters = classes.map((portalClass) => {
      const roster = rosterById.get(portalClass.portalClassId) ?? { students: [] }
      const students = roster.students ?? []
      const modules = normalizePortalClassModules(roster.modules ?? [])
      return {
        ...portalClass,
        students,
        studentCount: students.length,
        session: roster.session ?? {},
        hasAttendance: Boolean(roster.hasAttendance),
        rosterLoaded: true,
        modules,
        modulesFetched: modules.length > 0,
      }
    })

    return this.hydrateClassModules(withRosters, { concurrency })
  }

  async hydrateClassModules(classes, { concurrency = 4 } = {}) {
    const list = classes ?? []
    let index = 0
    const modulesById = new Map()

    async function worker() {
      while (index < list.length) {
        const current = index
        index += 1
        const portalClass = list[current]
        const existingModules = portalClass.modules ?? []
        try {
          const modules =
            existingModules.length > 0
              ? normalizePortalClassModules(existingModules)
              : await this.fetchClassModules(portalClass.portalClassId, {
                  rosterStudents: portalClass.students ?? [],
                })
          modulesById.set(portalClass.portalClassId, modules)
        } catch {
          modulesById.set(portalClass.portalClassId, existingModules)
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(list.length, 1)) },
      () => worker.call(this),
    )
    await Promise.all(workers)

    return list.map((portalClass) => ({
      ...portalClass,
      modules: modulesById.get(portalClass.portalClassId) ?? portalClass.modules ?? [],
      modulesFetched: true,
    }))
  }

  /**
   * One authenticated session: classes, rosters, modules, and per-LP module P/A grids.
   * Uses PORTAL_USERNAME / PORTAL_PASSWORD from .env (re-login if the portal refreshes cookies).
   */
  async fetchMonitoringSnapshot({
    portalClassIds = null,
    concurrency = 6,
  } = {}) {
    await this.login()

    const allClasses = await this.fetchClasses()
    if (!allClasses.length) {
      throw new Error(
        'No portal classes found. Open PORTAL_CLASSES_PATH in a browser while signed in and confirm class links use ?class=ID.',
      )
    }

    const targetIds =
      Array.isArray(portalClassIds) && portalClassIds.length > 0
        ? portalClassIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : allClasses
            .map((portalClass) => Number(portalClass.portalClassId))
            .filter((id) => Number.isFinite(id) && id > 0)

    if (!targetIds.length) {
      throw new Error('Portal class list returned no valid class IDs.')
    }

    let classes = await this.fetchClassesWithRosters({ concurrency })
    const allowed = new Set(targetIds)
    classes = classes.filter((portalClass) => allowed.has(portalClass.portalClassId))

    if (!classes.length) {
      throw new Error(
        `No portal classes matched the requested IDs (${targetIds.slice(0, 5).join(', ')}${targetIds.length > 5 ? '…' : ''}).`,
      )
    }

    const tasks = []
    for (const portalClass of classes) {
      const modules = normalizePortalClassModules(portalClass.modules ?? [])
      for (const mod of modules) {
        const gridModuleId = resolvePortalGridModuleId(mod)
        if (!gridModuleId) continue
        for (const student of portalClass.students ?? []) {
          if (!student?.portalStudentId) continue
          tasks.push({
            portalClassId: portalClass.portalClassId,
            moduleId: gridModuleId,
            moduleLabel: mod.label || '',
            portalStudentId: student.portalStudentId,
            name: student.name,
          })
        }
      }
    }

    const gridByClass = new Map()
    let taskIndex = 0
    const failures = []

    async function worker() {
      while (taskIndex < tasks.length) {
        const current = taskIndex
        taskIndex += 1
        const task = tasks[current]
        try {
          const summary = await this.fetchStudentModuleAttendance(
            task.portalStudentId,
            task.moduleId,
          )
          const classKey = task.portalClassId
          if (!gridByClass.has(classKey)) {
            gridByClass.set(classKey, new Map())
          }
          const moduleMap = gridByClass.get(classKey)
          const moduleKey = String(task.moduleId)
          if (!moduleMap.has(moduleKey)) {
            moduleMap.set(moduleKey, {
              moduleId: task.moduleId,
              moduleLabel: task.moduleLabel,
              students: [],
            })
          }
          moduleMap.get(moduleKey).students.push({
            portalStudentId: task.portalStudentId,
            name: task.name,
            sessions: summary.sessions ?? [],
            presentCount: summary.presentCount,
            absentCount: summary.absentCount,
            percentPresent: summary.percentPresent,
            consecutiveAbsent: summary.consecutiveAbsent,
          })
        } catch (error) {
          failures.push({
            portalClassId: task.portalClassId,
            moduleId: task.moduleId,
            portalStudentId: task.portalStudentId,
            message: error?.message || 'Grid fetch failed',
          })
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(tasks.length, 1)) },
      () => worker.call(this),
    )
    await Promise.all(workers)

    const snapshotClasses = classes.map((portalClass) => {
      const moduleMap = gridByClass.get(portalClass.portalClassId) ?? new Map()
      const moduleAttendance = [...moduleMap.values()].map((entry) => ({
        ...entry,
        students: entry.students.sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || '')),
        ),
      }))
      return {
        portalClassId: portalClass.portalClassId,
        label: portalClass.label,
        classMeta: portalClass.classMeta,
        students: portalClass.students ?? [],
        studentCount: portalClass.students?.length ?? 0,
        modules: portalClass.modules ?? [],
        moduleAttendance,
        gridsLoaded: moduleAttendance.reduce(
          (sum, mod) => sum + (mod.students?.length ?? 0),
          0,
        ),
      }
    })

    const moduleCount = snapshotClasses.reduce(
      (sum, portalClass) => sum + (portalClass.moduleAttendance?.length ?? 0),
      0,
    )
    const gridsLoaded = snapshotClasses.reduce(
      (sum, portalClass) => sum + (portalClass.gridsLoaded ?? 0),
      0,
    )

    return {
      pulledAt: new Date().toISOString(),
      portalClassIds: targetIds,
      classes: snapshotClasses,
      stats: {
        portalClassIds: targetIds,
        classCount: snapshotClasses.length,
        moduleCount,
        studentCount: snapshotClasses.reduce(
          (sum, portalClass) => sum + (portalClass.studentCount ?? 0),
          0,
        ),
        gridTasks: tasks.length,
        gridsLoaded,
        failures: failures.length,
      },
      failures: failures.slice(0, 50),
    }
  }
}
