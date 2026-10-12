// The link between this session and its project's office server, as plain functions
// the hooks call: where the server is, what a heartbeat answer says, and how to
// describe the state to the person.
//
// The server records its address in <project>/.claude/agent-office/server.json; the
// plugin reads it on every heartbeat, so a server that restarts on another port is
// found again with nothing configured. The officeUrl option overrides it.

export const DISCOVERY_FILE = '.claude/agent-office/server.json'
export const HEARTBEAT_EVERY_MS = 2000

export type LinkState = 'starting' | 'connected' | 'no-server' | 'unreachable' | 'other-project' | 'bad-url'

export type Link = {
  state: LinkState
  url: string
  project: string
  serverProject: string
  serverVersion: string
  version: string
  session: string
  lastOkAt: number
  lastError: string
}

export const newLink = (): Link => ({
  state: 'starting', url: '', project: '', serverProject: '', serverVersion: '', version: '', session: '', lastOkAt: 0, lastError: '',
})

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** The server's base URL from an address, when it is a local http one; undefined otherwise. */
export function localBase(address: string): string | undefined {
  try {
    const u = new URL(address)

    return u.protocol === 'http:' && LOOPBACK.has(u.hostname) ? u.origin : undefined
  } catch {
    return undefined
  }
}

/** The server address in the discovery file's text, when it is a local one. */
export function parseDiscovery(text: string | undefined): string | undefined {
  if (text === undefined) return undefined

  try {
    const info = JSON.parse(text) as { app?: unknown; url?: unknown }

    return info?.app === 'agent-office' && typeof info.url === 'string' ? localBase(info.url) : undefined
  } catch {
    return undefined
  }
}

export type Beat = { match: boolean; task?: { id: string; text: string }; project: string; serverVersion: string }

/** A heartbeat answer, or undefined when it is not one. */
export function parseBeat(text: string): Beat | undefined {
  try {
    const b = JSON.parse(text) as Record<string, unknown>

    if (typeof b.match !== 'boolean') return undefined

    const t = b.task as { id?: unknown; text?: unknown } | null | undefined
    const task = t && typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim() ? { id: t.id, text: t.text } : undefined

    return { match: b.match, task, project: typeof b.project === 'string' ? b.project : '', serverVersion: typeof b.serverVersion === 'string' ? b.serverVersion : '' }
  } catch {
    return undefined
  }
}

/** The status line text: quiet when there is no office, short otherwise. */
export function statusLine(link: Link): string | undefined {
  switch (link.state) {
    case 'connected': return 'office: connected'
    case 'unreachable': return 'office: not reachable · /office'
    case 'other-project': return 'office: other project · /office'
    case 'bad-url': return 'office: bad officeUrl · /office'
    default: return undefined
  }
}

const ago = (ms: number) => (ms < 2000 ? 'just now' : ms < 120000 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60000)} min ago`)

/** The /office report: the state, the facts behind it, and the one thing to do. */
export function report(link: Link, now: number): string {
  const facts = [
    `Agent Office: ${link.state.replace('-', ' ')}`,
    `  project   ${link.project || '(not known yet)'}`,
    `  server    ${link.url || 'none found'}${link.serverVersion ? ` (version ${link.serverVersion})` : ''}`,
    `  plugin    ${link.version || '?'}, session ${link.session || '?'}`,
    `  contact   ${link.lastOkAt ? ago(now - link.lastOkAt) : 'never'}`,
  ]
  const fix = {
    starting: 'Checking… run /office again in a few seconds.',
    connected: `Open ${link.url} to watch the team, or give it a task there.`,
    'no-server': 'No office is running for this project. In a terminal in the project folder: npx agent-office',
    unreachable: `The office at ${link.url} does not answer${link.lastError ? ` (${link.lastError})` : ''}. It may have stopped: start it again with npx agent-office in the project folder.`,
    'other-project': `That office belongs to ${link.serverProject || 'another project'}. Start one for this project (npx agent-office in this folder), or clear the plugin's officeUrl option.`,
    'bad-url': 'The plugin\'s officeUrl option must be a local http address (127.0.0.1 or localhost). Clear it to find the office by itself.',
  }[link.state]

  if (link.serverVersion && link.version && link.serverVersion !== link.version) {
    facts.push(`  note      the server is ${link.serverVersion}, this plugin ${link.version}: update the older one (/plugin update agent-office)`)
  }

  return [...facts, '', fix].join('\n')
}
