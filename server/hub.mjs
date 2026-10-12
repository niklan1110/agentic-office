// Sessions and tasks: which Claude Code sessions are connected, and delivery of the
// tasks typed on the page. Pure logic with an injectable clock, so it is testable.
//
// A session sends a heartbeat every couple of seconds with its project root. Only a
// session of the server's own project gets tasks. A task is leased to one session,
// which reports back whether it started it (result). A lease not answered in time
// goes back to the queue; after MAX_TRIES the task fails, with the reason shown.

import path from 'node:path'

export const FRESH_MS = 8000 // a session heard from this recently counts as connected
export const LEASE_MS = 20000
export const MAX_TRIES = 3
export const TASK_LIMIT = 4000 // characters
export const QUEUE_LIMIT = 20 // tasks waiting or being delivered
const KEEP_TASKS = 50 // finished tasks kept for the page
const KEEP_SESSIONS = 20

// Two spellings of one directory: resolved, no trailing separator, case-insensitive on Windows and macOS.
export function samePath(a, b, platform = process.platform) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false

  const norm = (p) => {
    const r = path.resolve(p).replace(/[\\/]+$/, '').replace(/\\/g, '/')

    return platform === 'win32' || platform === 'darwin' ? r.toLowerCase() : r
  }

  return norm(a) === norm(b)
}

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '')

// The task text as typed: control characters out except newlines and tabs, trimmed, cut.
export function cleanTask(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, TASK_LIMIT) : ''
}

export function createHub({ project, version, now = Date.now, onChange = () => {} }) {
  const sessions = new Map() // id → { id, project, plugin, version, seenAt, firstAt, match }
  const tasks = [] // oldest first
  let nextId = 0

  const active = () => tasks.filter((t) => t.state === 'queued' || t.state === 'leased')

  // Leases that ran out go back to the queue, or fail after MAX_TRIES.
  function expire() {
    let changed = false

    for (const t of tasks) {
      if (t.state !== 'leased' || t.leaseUntil > now()) continue
      changed = true
      if (t.tries >= MAX_TRIES) Object.assign(t, { state: 'failed', reason: `no session confirmed it after ${MAX_TRIES} tries`, session: '', updatedAt: now() })
      else Object.assign(t, { state: 'queued', session: '', updatedAt: now() })
    }

    return changed
  }

  function trim() {
    while (tasks.length > KEEP_TASKS) {
      const i = tasks.findIndex((t) => t.state === 'delivered' || t.state === 'failed')
      if (i < 0) break
      tasks.splice(i, 1)
    }
  }

  return {
    project,

    queue(text) {
      const clean = cleanTask(text)

      if (!clean) return { error: 'a task needs some text' }
      if (active().length >= QUEUE_LIMIT) return { error: 'too many tasks are waiting; wait for a session to take some' }

      const task = { id: String(++nextId), text: clean, at: now(), state: 'queued', tries: 0, session: '', leaseUntil: 0, reason: '', updatedAt: now() }

      tasks.push(task)
      trim()
      onChange()

      return { task }
    },

    // A session checks in. Returns whether it is this project's, and a task for it if one waits.
    heartbeat(input) {
      const id = clean(input?.session, 80)

      if (!id) return { error: 'a heartbeat needs a session id' }

      const match = samePath(input.project, project)
      const known = sessions.get(id)
      const entry = {
        id,
        project: clean(input.project, 400),
        plugin: clean(input.plugin, 60),
        version: clean(input.version, 20),
        seenAt: now(),
        firstAt: known?.firstAt ?? now(),
        match,
      }

      sessions.set(id, entry)
      if (sessions.size > KEEP_SESSIONS) sessions.delete([...sessions.values()].sort((a, b) => a.seenAt - b.seenAt)[0].id)

      let changed = expire() || !known || known.match !== match || known.version !== entry.version
      let task = null

      // One task at a time per session: the next only once the last is confirmed.
      if (match && !tasks.some((t) => t.state === 'leased' && t.session === id)) {
        const next = tasks.find((t) => t.state === 'queued')

        if (next) {
          Object.assign(next, { state: 'leased', session: id, tries: next.tries + 1, leaseUntil: now() + LEASE_MS, updatedAt: now() })
          task = { id: next.id, text: next.text }
          changed = true
        }
      }

      if (changed) onChange()

      return { match, task }
    },

    // The session says whether it started the task. A refusal fails it, with the reason.
    result(taskId, sessionId, input) {
      const t = tasks.find((x) => x.id === String(taskId))

      if (!t) return { error: 'no such task' }
      if (t.state !== 'leased' || t.session !== sessionId) return { error: 'this task is not leased to this session' }

      if (input?.ok === true) Object.assign(t, { state: 'delivered', reason: '', updatedAt: now() })
      else Object.assign(t, { state: 'failed', reason: clean(input?.reason, 200) || 'the session did not start it', updatedAt: now() })
      onChange()

      return { task: t }
    },

    status() {
      if (expire()) onChange()

      const list = [...sessions.values()]
        .map((s) => ({ ...s, connected: now() - s.seenAt < FRESH_MS }))
        .sort((a, b) => b.seenAt - a.seenAt)

      return {
        project,
        version,
        sessions: list,
        connected: list.filter((s) => s.connected && s.match).length,
        tasks: tasks.slice(-20).map(({ id, text, at, state, tries, reason, updatedAt }) => ({ id, text, at, state, tries, reason, updatedAt })),
      }
    },
  }
}
