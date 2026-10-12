import type { EngineInterface, Register } from 'claude-code'

import { DISCOVERY_FILE, HEARTBEAT_EVERY_MS, localBase, newLink, parseBeat, parseDiscovery, report, statusLine } from './connection'
import type { Link, LinkState } from './connection'
import { doneEvent, isFromPerson, isShown, messageEvent, spawnEvent, taskEvent, thinkEvent, toolEvent, usageEvent } from './events'
import type { OfficeEvent } from './events'
import { TEAM_FILE, parseTeam, promptFor, roleOfAgent } from './roles'
import type { Role } from './roles'
import { isPageTask, teamNote } from './tasks'

// Every function that is handed `$` is declared here at the top of the file: the
// engine checks that, and refuses to load a module that passes `$` anywhere else.

type Options = { override: string; showTask: boolean; showMessages: boolean; registerTeam: boolean; acceptTasks: boolean }
type TeamState = { roles: Role[]; stamp: string; registered: Set<string> }
type State = { link: Link; team: TeamState; startedAt: number; beating: boolean; timer?: { cancel: () => void } }

const join = (root: string, rel: string) => `${root.replace(/[\\/]+$/, '')}/${rel}`

async function readText($: EngineInterface, file: string): Promise<string | undefined> {
  try {
    return await $.fs.read(file)
  } catch {
    return undefined
  }
}

function setState($: EngineInterface, s: State, state: LinkState, error = '') {
  const changed = s.link.state !== state

  s.link.state = state
  s.link.lastError = error
  if (changed) $.ui.status(statusLine(s.link))
}

async function post($: EngineInterface, s: State, path: string, body: unknown) {
  return $.http.fetch(`${s.link.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-office-project': s.link.project },
    body: JSON.stringify(body),
  })
}

// Fire and forget, and only while connected: the office is optional, so a missing
// server must never slow a turn down or break it.
function send($: EngineInterface, s: State, event: OfficeEvent) {
  if (s.link.state !== 'connected') return

  try {
    void post($, s, '/api/events', event)
      .then((res) => {
        if (res.status === 409) setState($, s, 'other-project')
      })
      .catch(() => undefined)
  } catch {
    // The same: nothing here may fail a hook.
  }
}

async function registerAll($: EngineInterface, t: TeamState, list: readonly (Role & { model?: string })[]) {
  for (const role of list) {
    try {
      await $.agent.register({
        name: role.name, description: role.description, prompt: promptFor(role), skills: role.skills, ...(role.model ? { model: role.model } : {}),
      })
      t.registered.add(role.name)
    } catch {
      // A role the engine refuses leaves the others in place.
    }
  }
}

// Reads the team file again when it changed. A team launched after this session
// started is registered live, as `<plugin>:<id>`; one that was there at the start
// is already in the session as agent files, by its own id.
async function syncTeam($: EngineInterface, s: State, opts: Options) {
  const file = join(s.link.project, TEAM_FILE)
  let stamp = 'none'

  try {
    const { mtimeMs, size } = await $.fs.stat(file)

    stamp = `${mtimeMs}:${size}`
  } catch {
    // No team yet.
  }

  if (stamp === s.team.stamp) return
  s.team.stamp = stamp

  const team = parseTeam(stamp === 'none' ? undefined : await readText($, file))

  if (!team) {
    s.team.roles = []

    return
  }

  const live = opts.registerTeam && team.launchedAt > s.startedAt
  const roles = team.agents.map((a) => roleOfAgent(a, team.summaries))

  s.team.roles = roles.map((r) => ({ ...r, agentType: live ? `${$.plugin.name}:${r.name}` : r.name }))
  if (live) await registerAll($, s.team, roles)
}

// Submits a task from the page as the person's own prompt and tells the server whether it started.
async function deliver($: EngineInterface, s: State, task: { id: string; text: string }) {
  let ok = false
  let reason = ''

  try {
    const result = await $.prompt.submit({ text: task.text, asUser: true })

    ok = !result.drop
    reason = result.drop ? String(result.drop) : ''
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err)
  }

  if (!ok) $.ui.toast(`Office task not started: ${reason}`)

  try {
    await post($, s, `/api/tasks/${encodeURIComponent(task.id)}/result`, { session: s.link.session, ok, reason })
  } catch {
    // The server re-queues a task nobody confirmed.
  }
}

// One check-in: find the server, say hello, pick up a task, keep the team current.
async function heartbeat($: EngineInterface, s: State, opts: Options) {
  s.link.project = await $.session.root()

  if (opts.override) {
    const base = localBase(opts.override)

    if (!base) return setState($, s, 'bad-url')
    s.link.url = base
  } else {
    const base = parseDiscovery(await readText($, join(s.link.project, DISCOVERY_FILE)))

    if (!base) return setState($, s, 'no-server')
    s.link.url = base
  }

  let res
  try {
    res = await post($, s, '/api/sessions/heartbeat', { session: s.link.session, project: s.link.project, plugin: $.plugin.name, version: s.link.version })
  } catch (err) {
    return setState($, s, 'unreachable', err instanceof Error ? err.message : String(err))
  }

  const beat = res.ok ? parseBeat(res.text) : undefined

  if (!beat) return setState($, s, 'unreachable', `the server answered ${res.status}`)

  s.link.serverProject = beat.project
  s.link.serverVersion = beat.serverVersion
  s.link.lastOkAt = Date.now()
  if (!beat.match) return setState($, s, 'other-project')
  setState($, s, 'connected')
  if (beat.task && opts.acceptTasks) await deliver($, s, beat.task)
}

async function tick($: EngineInterface, s: State, opts: Options) {
  if (s.beating) return
  s.beating = true

  try {
    await heartbeat($, s, opts)
    await syncTeam($, s, opts)
  } catch {
    // The next tick tries again.
  } finally {
    s.beating = false
  }
}

async function start($: EngineInterface, s: State, opts: Options) {
  if (s.startedAt === 0) s.startedAt = Date.now()
  s.link.session = await $.session.id()

  try {
    s.link.version = (JSON.parse(await $.fs.read(join($.plugin.root, '.claude-plugin/plugin.json'))) as { version?: string }).version ?? ''
  } catch {
    s.link.version = ''
  }

  await $.command.register({ name: 'office', description: 'Agent Office: is this session connected to the office, and if not, why' })

  // The first check-in right away, so even a short session shows up in the office; in the
  // background, so a task it picks up never holds up the start of the session.
  void tick($, s, opts)
  if (!s.timer) s.timer = $.clock.every(HEARTBEAT_EVERY_MS, () => void tick($, s, opts))
}

export const register: Register = (on, options) => {
  const opts: Options = {
    override: typeof options.officeUrl === 'string' ? options.officeUrl.trim() : '',
    showTask: options.showTask !== false,
    showMessages: options.showMessages !== false,
    registerTeam: options.registerTeam !== false,
    acceptTasks: options.acceptTasks !== false,
  }
  const s: State = { link: newLink(), team: { roles: [], stamp: '', registered: new Set() }, startedAt: 0, beating: false }

  on('session.start', async ($, e, next) => {
    await start($, s, opts)

    return next(e)
  })

  on('command.run', { command: 'office' }, async ($) => {
    await tick($, s, opts)

    return { text: report(s.link, Date.now()) }
  })

  on('prompt.submit', ($, e, next) => {
    if (isFromPerson(e.origin)) send($, s, taskEvent(e.text, opts.showTask))

    // A task from the page reaches the model with a note about the team.
    if (isPageTask(e.origin, $.plugin.name)) return next({ ...e, context: [...(e.context ?? []), teamNote(s.team.roles)] })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    if (spawned.agentId !== undefined) send($, s, spawnEvent(spawned.agentId, e.subagentType, e.name, e.description, e.parentAgentId))

    return spawned
  }).catch(($, e, next) => next(e))

  on('tool.call', ($, e, next) => {
    if (isShown(e.tool)) send($, s, toolEvent(e.agentId, e.tool))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    send($, s, thinkEvent(e.agentId, e.model))

    const response = yield* next(e)

    if (response.usage !== null) send($, s, usageEvent(e.agentId, response.usage))

    return response
  })

  on('session.send', ($, e, next) => {
    send($, s, messageEvent(e.agentId, e.to, e.text, opts.showMessages))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    send($, s, doneEvent(e.agentId, e.durationMs, e.reason))

    return next(e)
  })
}
