// The Agent Office server, one per project. It serves the web app (public/), takes
// events and heartbeats from the Claude Code plugin, streams them to the page, hands
// the page's tasks to the project's sessions, and launches teams into the project.
// docs/spec.md lists the API.
//
// Local only: it refuses connections that are not from the loopback address, Host
// headers that are not loopback (DNS rebinding), and POSTs from other origins (a web
// page in your browser cannot drive it).

import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCatalog } from './catalog.mjs'
import { removeDiscovery, writeDiscovery } from './discovery.mjs'
import { GROUPS } from './groups.mjs'
import { createHub, samePath } from './hub.mjs'
import { MAX_ZIP, createLibrary, libraryDir } from './library.mjs'
import { createPhoneShare } from './phone.mjs'
import { listOffices, officesDir, register, unregister } from './registry.mjs'
import { CHARACTERS, LIMITS, MODELS, RECOMMENDED, createTeamStore } from './team.mjs'
import { validate } from '../public/js/protocol.js'
import { THEMES } from '../public/js/themes.js'
import { LAYOUTS } from '../public/js/office-map.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(here, '..', 'public')
export const VERSION = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
const MAX_BODY = 8 * 1024
const MAX_TEAM_BODY = 64 * 1024
const LOOPBACK_ADDRESS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
}

const sendText = (res, status, text) => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req, limit, raw = false) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) return reject(Object.assign(new Error('too large'), { status: 413 }))
      chunks.push(chunk)
    })
    req.on('end', () => resolve(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// The JSON body of a POST, or undefined after answering with the reason it was refused.
async function jsonBody(req, res, limit = MAX_BODY) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return void sendText(res, 415, 'expected application/json')

  try {
    return JSON.parse(await readBody(req, limit))
  } catch (err) {
    return void sendText(res, err.status ?? 400, err.status ? 'body too large' : 'bad JSON')
  }
}

// The skill sources for a project: what is already there, your personal skills, your
// Agent Office library, then the collections given.
export function skillSources(projectDir, collections = [], home = os.homedir(), library = libraryDir()) {
  return [
    { dir: path.join(projectDir, '.claude', 'skills'), kind: 'project' },
    { dir: path.join(home, '.claude', 'skills'), kind: 'personal' },
    { dir: library, kind: 'library' },
    ...collections.map((dir) => ({ dir: path.resolve(dir), kind: 'collection' })),
  ]
}

// The office's look, per project: a colour theme, a layout, and custom colours over the theme.
const COLOR_KEYS = ['wall', 'floor', 'partition']
const HEX = /^#[0-9a-f]{6}$/i
function cleanSettings(s) {
  const colors = {}

  for (const k of COLOR_KEYS) if (typeof s?.colors?.[k] === 'string' && HEX.test(s.colors[k])) colors[k] = s.colors[k]

  return {
    theme: THEMES.some((t) => t.id === s?.theme) ? s.theme : 'studio',
    layout: LAYOUTS.some((l) => l.id === s?.layout) ? s.layout : 'open',
    colors,
  }
}

export function createServer({ projectDir = process.cwd(), collections = [], home = os.homedir(), appHome, fetchImpl = fetch, backlogSize = 200, now = Date.now } = {}) {
  const project = path.resolve(projectDir)
  const library = createLibrary({ dir: libraryDir(appHome), fetchImpl })
  const catalog = createCatalog(skillSources(project, collections, home, library.dir))
  const team = createTeamStore({ projectDir: project, catalog })
  const backlog = []
  const clients = new Set()
  let url = ''

  const broadcast = (name, data) => {
    const line = `${name ? `event: ${name}\n` : ''}data: ${JSON.stringify(data)}\n\n`

    for (const client of clients) client.write(line)
  }
  const hub = createHub({ project, version: VERSION, now, onChange: () => broadcast('status', hub.status()) })
  const registry = officesDir(appHome)
  const settingsFile = path.join(project, '.claude', 'agent-office', 'office.json')

  // The office's look, per project: { theme }.
  async function readSettings() {
    try {
      const saved = JSON.parse(await readFile(settingsFile, 'utf8'))

      return cleanSettings(saved)
    } catch {
      return cleanSettings({})
    }
  }

  async function saveSettings(req, res) {
    const body = await jsonBody(req, res)

    if (body === undefined) return
    if (body.theme !== undefined && !THEMES.some((t) => t.id === body.theme)) return sendText(res, 400, `theme must be one of ${THEMES.map((t) => t.id).join(', ')}`)
    if (body.layout !== undefined && !LAYOUTS.some((l) => l.id === body.layout)) return sendText(res, 400, `layout must be one of ${LAYOUTS.map((l) => l.id).join(', ')}`)
    if (body.colors !== undefined && (typeof body.colors !== 'object' || body.colors === null || Object.entries(body.colors).some(([k, v]) => !COLOR_KEYS.includes(k) || (v !== null && !HEX.test(v))))) {
      return sendText(res, 400, `colors may set ${COLOR_KEYS.join(', ')} to a colour like #A1B2C3, or null`)
    }

    const now = await readSettings()
    const colors = body.colors === undefined ? now.colors : Object.fromEntries(Object.entries({ ...now.colors, ...body.colors }).filter(([, v]) => v))
    const settings = cleanSettings({ ...now, ...body, colors })

    await mkdir(path.dirname(settingsFile), { recursive: true })
    await writeFile(settingsFile, JSON.stringify(settings, null, 2) + '\n')
    broadcast('office', settings)

    return sendJson(res, 200, settings)
  }
  const active = new Map() // agent → when it last did something, for "busy" on the Offices page

  // A short summary for the Offices page: who this is, its theme, how busy.
  async function summary() {
    const launched = await team.read()
    const busy = [...active].filter(([id, at]) => id !== 'main' && now() - at < 15000).length

    return {
      app: 'agent-office',
      version: VERSION,
      project,
      name: path.basename(project),
      theme: (await readSettings()).theme,
      agents: launched?.agents.length ?? 0,
      busy,
      managerBusy: now() - (active.get('main') ?? 0) < 15000,
      connected: hub.status().connected,
    }
  }

  async function ingest(req, res) {
    const sender = req.headers['x-agent-office-project']

    if (typeof sender === 'string' && sender && !samePath(sender, project)) {
      req.resume()

      return sendJson(res, 409, { error: 'project-mismatch', project })
    }

    const body = await jsonBody(req, res)

    if (body === undefined) return

    const checked = validate(body)

    if (checked.error) return sendText(res, 400, checked.error)

    const event = { ...checked.value, at: now() }

    backlog.push(event)
    if (backlog.length > backlogSize) backlog.shift()
    if (event.type === 'done') active.delete(event.agent)
    else if (event.agent) active.set(event.agent, now())
    else if (event.type === 'task') active.set('main', now())
    broadcast('', event)

    return sendText(res, 202, 'accepted')
  }

  async function heartbeat(req, res) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    const beat = hub.heartbeat(body)

    if (beat.error) return sendText(res, 400, beat.error)

    return sendJson(res, 200, { ...beat, project, serverVersion: VERSION })
  }

  async function taskResult(req, res, id) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    const done = hub.result(id, typeof body.session === 'string' ? body.session : '', body)

    return done.error ? sendText(res, 409, done.error) : sendJson(res, 200, { state: done.task.state })
  }

  async function queueTask(req, res) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    const queued = hub.queue(body.text)

    return queued.error ? sendText(res, queued.error.startsWith('too many') ? 503 : 400, queued.error) : sendJson(res, 202, { id: queued.task.id })
  }

  async function listSkills(res) {
    const skills = await catalog.list()
    const marked = await Promise.all(skills.map(async ({ dir, ...s }) => ({ ...s, installed: s.source === 'project' || (await team.installed(s.name)) })))

    return sendJson(res, 200, { project, sources: catalog.sources, groups: GROUPS, skills: marked })
  }

  // Adding skills to the library: inspect a GitHub link or an uploaded zip, then add the ones picked.
  async function libraryInspect(req, res) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    try {
      return sendJson(res, 200, await library.inspectGitHub(body.url))
    } catch (err) {
      return sendText(res, 400, err.message)
    }
  }

  async function libraryUpload(req, res) {
    let buf
    try {
      buf = await readBody(req, MAX_ZIP, true)
    } catch {
      return sendText(res, 413, `the zip is larger than ${MAX_ZIP / 1024 / 1024} MB`)
    }

    try {
      return sendJson(res, 200, library.inspectZip(buf, String(req.headers['x-file-name'] ?? 'uploaded zip').slice(0, 120)))
    } catch (err) {
      return sendText(res, 400, err.message)
    }
  }

  async function libraryChange(req, res, action) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    try {
      const result = action === 'add' ? await library.add(String(body.token ?? ''), Array.isArray(body.names) ? body.names.map(String) : []) : await library.remove(String(body.name ?? ''))

      catalog.refresh()

      return sendJson(res, 200, result ?? { ok: true })
    } catch (err) {
      return sendText(res, 400, err.message)
    }
  }

  async function readTeam(res) {
    return sendJson(res, 200, {
      project,
      team: await team.read(),
      recommended: RECOMMENDED,
      characters: CHARACTERS,
      models: MODELS,
      limits: LIMITS,
    })
  }

  async function launchTeam(req, res) {
    const body = await jsonBody(req, res, MAX_TEAM_BODY)

    if (body === undefined) return

    let launched
    try {
      launched = await team.launch(body)
    } catch (err) {
      return sendText(res, 500, `could not launch the team: ${err?.message ?? err}`)
    }

    if (launched.error) return sendText(res, 400, launched.error)
    broadcast('team', launched.team)

    return sendJson(res, 200, { ...launched, project, connected: hub.status().connected })
  }

  function stream(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    res.write(`event: backlog\ndata: ${JSON.stringify(backlog)}\n\n`)
    res.write(`event: status\ndata: ${JSON.stringify(hub.status())}\n\n`)
    clients.add(res)

    // A ping keeps proxies from closing the stream, and the status keeps "connected" honest as sessions go quiet.
    const ping = setInterval(() => res.write(`event: status\ndata: ${JSON.stringify(hub.status())}\n\n`), 5000)

    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
    })
  }

  async function serveFile(pathname, res) {
    let relative
    try {
      relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1)
    } catch {
      return sendText(res, 400, 'bad path')
    }

    const file = path.resolve(PUBLIC, relative)

    if (!file.startsWith(PUBLIC + path.sep)) return sendText(res, 404, 'not found')

    try {
      const body = await readFile(file)

      res.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-cache',
      })
      res.end(body)
    } catch {
      sendText(res, 404, 'not found')
    }
  }

  async function phoneSwitch(req, res) {
    const body = await jsonBody(req, res)

    if (body === undefined) return

    try {
      return sendJson(res, 200, body.on ? await phone.enable() : await phone.disable())
    } catch (err) {
      return sendText(res, 400, err.message)
    }
  }

  // Every route. The phone door (phone.mjs) calls this too, with req.viewOnly set, for the few GETs it lets through.
  function handle(req, res) {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const route = `${req.method} ${pathname}`
    const taskResultPath = /^\/api\/tasks\/(\d+)\/result$/.exec(pathname)

    switch (route) {
      case 'GET /api/hello': return sendJson(res, 200, { app: 'agent-office', version: VERSION, project, url, viewOnly: Boolean(req.viewOnly) })
      case 'GET /api/phone': return sendJson(res, 200, phone.status())
      case 'POST /api/phone': return void phoneSwitch(req, res)
      case 'GET /api/status': return sendJson(res, 200, hub.status())
      case 'GET /api/office': return void readSettings().then((x) => sendJson(res, 200, x))
      case 'POST /api/office': return void saveSettings(req, res)
      case 'GET /api/summary': return void summary().then((x) => sendJson(res, 200, x))
      case 'GET /api/offices': return void listOffices(registry).then((offices) => sendJson(res, 200, { here: url, offices }))
      case 'GET /api/stream': return stream(req, res)
      case 'GET /api/skills': return void listSkills(res)
      case 'GET /api/team': return void readTeam(res)
      case 'POST /api/events': return void ingest(req, res)
      case 'POST /api/sessions/heartbeat': return void heartbeat(req, res)
      case 'POST /api/tasks': return void queueTask(req, res)
      case 'POST /api/launch': return void launchTeam(req, res)
      case 'POST /api/library/inspect': return void libraryInspect(req, res)
      case 'POST /api/library/upload': return void libraryUpload(req, res)
      case 'POST /api/library/add': return void libraryChange(req, res, 'add')
      case 'POST /api/library/remove': return void libraryChange(req, res, 'remove')
      default:
        if (req.method === 'POST' && taskResultPath) return void taskResult(req, res, taskResultPath[1])
        if (req.method === 'GET' && !pathname.startsWith('/api/')) return void serveFile(pathname, res)

        return sendText(res, pathname.startsWith('/api/') ? 404 : 405, pathname.startsWith('/api/') ? 'no such endpoint' : 'method not allowed')
    }
  }

  const server = http.createServer((req, res) => {
    if (!LOOPBACK_ADDRESS.has(req.socket.remoteAddress)) return sendText(res, 403, 'local only')
    if (!LOOPBACK_HOST.test(req.headers.host ?? '')) return sendText(res, 403, 'bad host')
    if (req.method === 'POST' && req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`) {
      return sendText(res, 403, 'cross-origin requests are refused')
    }

    return handle(req, res)
  })
  const phone = createPhoneShare({ handle })

  return {
    server,
    phone,
    hub,
    team,
    project,
    get url() {
      return url
    },

    // Listens on `port`, or the next free one unless `strictPort`; then records the address for the plugin.
    async listen({ port = 7777, strictPort = false, host = '127.0.0.1', discovery = true } = {}) {
      for (let p = port; ; p++) {
        try {
          await new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen(p, host, () => {
              server.off('error', reject)
              resolve()
            })
          })
          break
        } catch (err) {
          if (err.code !== 'EADDRINUSE' || strictPort || p >= port + 20) throw err
        }
      }

      url = `http://${host}:${server.address().port}`
      if (discovery) {
        await writeDiscovery(project, { app: 'agent-office', url, version: VERSION, project, startedAt: now() })
        await register(registry, { url, project, version: VERSION, startedAt: now() })
      }

      return url
    },

    async close() {
      await phone.disable()
      for (const client of clients) client.end()
      await removeDiscovery(project).catch(() => {})
      await unregister(registry, project)
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
