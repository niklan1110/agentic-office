// The team launched from the office's setup page (.claude/office-team.json): each
// agent as a role this plugin can register. Launching also writes each agent to
// .claude/agents/, which Claude Code reads when a session starts, so the plugin
// registers the agents only in sessions that were already open at launch.
// The manager is the main session itself.

export type Role = {
  name: string
  title: string
  /** The agent's own name ("Ada"). */
  person?: string
  description: string
  skills: readonly string[]
  /** The agent type the model calls it by. */
  agentType?: string
}

// Where the setup page keeps the launched team (server/team.mjs writes it).
export const TEAM_FILE = '.claude/office-team.json'

export type TeamAgent = { id: string; name: string; character: string; description: string; model: string; skills: string[] }
export type Team = { launchedAt: number; agents: TeamAgent[]; summaries: Record<string, string> }

// The title of each office character an agent can use.
const TITLES: Record<string, string> = {
  developer: 'Developer', reviewer: 'Code reviewer', qa: 'QA tester', researcher: 'Researcher', designer: 'Designer',
  devops: 'DevOps engineer', writer: 'Writer', analyst: 'Analyst', security: 'Security auditor',
}
const AGENT_ID = /^[a-z][a-z0-9-]{0,39}$/
const SKILL = /^[a-z0-9][a-z0-9._-]{0,79}$/i
const MODELS = new Set(['sonnet', 'opus', 'haiku'])
const text = (v: unknown, limit: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '')

/** The launched team in the team file, or undefined when there is none or it cannot be read. */
export function parseTeam(source: string | undefined): Team | undefined {
  let raw: unknown

  try {
    raw = source === undefined ? undefined : JSON.parse(source)
  } catch {
    return undefined
  }

  const file = raw as { launchedAt?: unknown; agents?: unknown; summaries?: unknown } | undefined

  if (!file || typeof file !== 'object' || !Array.isArray(file.agents) || typeof file.launchedAt !== 'number') return undefined

  const summaries: Record<string, string> = {}

  if (file.summaries && typeof file.summaries === 'object') {
    for (const [k, v] of Object.entries(file.summaries)) if (typeof v === 'string') summaries[k] = v.slice(0, 200)
  }

  const agents = (file.agents as unknown[]).flatMap((a): TeamAgent[] => {
    const x = (a ?? {}) as Record<string, unknown>
    const id = typeof x.id === 'string' && AGENT_ID.test(x.id) ? x.id : undefined

    if (!id) return []

    return [{
      id,
      name: text(x.name, 32) || id,
      character: typeof x.character === 'string' && Object.hasOwn(TITLES, x.character) ? x.character : 'developer',
      description: text(x.description, 400),
      model: typeof x.model === 'string' && MODELS.has(x.model) ? x.model : 'inherit',
      skills: Array.isArray(x.skills) ? x.skills.filter((s): s is string => typeof s === 'string' && SKILL.test(s)).slice(0, 20) : [],
    }]
  })

  return { launchedAt: file.launchedAt, agents: agents.slice(0, 30), summaries }
}

/** A team agent as a role the mod can register: named by its id, with its own skills and description. */
export function roleOfAgent(agent: TeamAgent, summaries: Record<string, string>): Role & { model?: string } {
  const title = TITLES[agent.character] ?? 'Developer'
  const skills = agent.skills.map((s) => (summaries[s] ? `${s} (${summaries[s]})` : s)).join('; ')
  const what = agent.description || `Works as the team's ${title}.`

  return {
    name: agent.id,
    title,
    person: agent.name,
    description: `${agent.name}, the ${title}. ${what}${skills ? ` Skills: ${skills}.` : ''}`.slice(0, 1000),
    skills: agent.skills,
    ...(agent.model !== 'inherit' ? { model: agent.model } : {}),
  }
}

export function promptFor(role: Role): string {
  return [
    `You are ${role.person ? `${role.person}, the ${role.title}` : `the ${role.title}`} on this team. The manager gives you one task.`,
    'Do only that task, using the skills you have. Keep changes small and check them before you report.',
    'Finish with a short, concrete report for the manager: what you did, how you checked it, and what is left.',
  ].join(' ')
}
