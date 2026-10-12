// What the office knows about the session, as a pure function of the events it
// has seen. Statuses are derived from it for a given moment, so the page asks
// again as time passes: a tool call keeps its role "working" for a few seconds,
// a finished agent shows "done" for a while, then everything settles to idle.

import { ROLE_IDS, roleOf } from './roles.js'

export const WORK_MS = 4_000 // a tool call keeps its role working this long
export const RESULT_MS = 12_000 // done and error stay on show this long
export const STALE_MS = 300_000 // a running agent silent this long counts as finished

const RANK = { idle: 0, done: 1, error: 2, thinking: 3, working: 4 }
const MANAGER_NAMES = new Set(['main', 'manager', 'you', 'lead'])

function freshAgent(fields) {
  return {
    id: '',
    role: 'developer',
    label: '',
    name: '',
    running: false,
    lastAt: 0,
    lastTool: '',
    lastToolAt: 0,
    doneAt: 0,
    reason: '',
    tools: 0,
    requests: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    model: '',
    ...fields,
  }
}

export function createState() {
  return {
    agents: { main: freshAgent({ id: 'main', role: 'manager', label: 'You' }) },
    task: null,
    lastMessage: null,
    seq: 0,
  }
}

function ensure(agents, id) {
  agents[id] ??= freshAgent({ id, role: id === 'main' ? 'manager' : 'developer', label: id })

  return agents[id]
}

export function apply(state, ev) {
  const at = ev.at ?? Date.now()
  const next = { ...state, agents: { ...state.agents }, seq: state.seq + 1 }
  const touch = (id) => {
    next.agents[id] = { ...ensure(next.agents, id) }

    return next.agents[id]
  }

  switch (ev.type) {
    case 'task': {
      const main = touch('main')

      main.running = true
      main.lastAt = at
      next.task = { text: ev.text, at }
      break
    }
    case 'spawn': {
      const role = roleOf(ev.subagentType)

      next.agents[ev.agent] = freshAgent({
        id: ev.agent,
        role,
        label: ev.label || ev.name || role,
        name: ev.name,
        running: true,
        lastAt: at,
      })
      break
    }
    case 'tool': {
      const agent = touch(ev.agent)

      agent.running = true
      agent.lastAt = at
      agent.lastTool = ev.tool
      agent.lastToolAt = at
      agent.tools += 1
      break
    }
    case 'think': {
      const agent = touch(ev.agent)

      agent.running = true
      agent.lastAt = at
      agent.requests += 1
      if (ev.model) agent.model = ev.model
      break
    }
    case 'usage': {
      const agent = touch(ev.agent)

      agent.input += ev.input
      agent.output += ev.output
      agent.cacheRead += ev.cacheRead
      agent.cacheWrite += ev.cacheWrite
      if (ev.model) agent.model = ev.model
      break
    }
    case 'message':
      next.lastMessage = { id: next.seq, from: ev.from, to: ev.to, text: ev.text, at }
      break
    case 'done': {
      const agent = touch(ev.agent)

      agent.running = false
      agent.doneAt = at
      agent.reason = ev.reason
      agent.lastAt = at
      break
    }
    default:
      break
  }

  return next
}

// The role an id, name or label points at: a message's recipient.
export function findRole(state, name) {
  if (!name) return undefined

  const key = name.toLowerCase()

  if (MANAGER_NAMES.has(key)) return 'manager'

  const agent = Object.values(state.agents).find(
    (a) => a.id.toLowerCase() === key || a.name.toLowerCase() === key || a.label.toLowerCase() === key,
  )

  if (agent) return agent.role

  return ROLE_IDS.includes(key) ? key : undefined
}

// The role of the agent a message came from.
export function roleOfAgent(state, id) {
  return state.agents[id]?.role ?? (id === 'main' ? 'manager' : undefined)
}

// One entry per role: its status at `now`, how many of its agents are running, and
// the tool it last used. working > thinking > error > done > idle.
export function roleStatuses(state, now) {
  const out = Object.fromEntries(ROLE_IDS.map((id) => [id, { status: 'idle', running: 0, tool: '' }]))

  for (const agent of Object.values(state.agents)) {
    const entry = out[agent.role]
    let status = 'idle'

    if (agent.running && now - agent.lastAt < STALE_MS) {
      entry.running += 1

      if (now - agent.lastToolAt < WORK_MS) {
        status = 'working'
        entry.tool = agent.lastTool
      } else {
        status = 'thinking'
      }
    } else if (agent.doneAt && now - agent.doneAt < RESULT_MS) {
      status = agent.reason === 'error' || agent.reason === 'refusal' ? 'error' : 'done'
    }

    if (RANK[status] > RANK[entry.status]) entry.status = status
  }

  return out
}

// Totals per role over every agent it has had this session.
export function roleStats(state) {
  const out = Object.fromEntries(ROLE_IDS.map((id) => [id, { agents: 0, tools: 0, input: 0, output: 0 }]))

  for (const agent of Object.values(state.agents)) {
    const entry = out[agent.role]

    entry.agents += agent.id === 'main' ? 0 : 1
    entry.tools += agent.tools
    entry.input += agent.input + agent.cacheRead + agent.cacheWrite
    entry.output += agent.output
  }

  return out
}

// 1234 → 1.2k, 1234567 → 1.2M
export function tokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`

  return String(n)
}
