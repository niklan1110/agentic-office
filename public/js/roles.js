// The office has ten fixed characters, one per role. Agents in a session map to
// them by the agent type Claude Code reports.

export const ROLE_IDS = Object.freeze([
  'manager',
  'developer',
  'reviewer',
  'qa',
  'researcher',
  'designer',
  'devops',
  'writer',
  'analyst',
  'security',
])

// Each character's colour, title and job, as in agents.js, for pages and the server, which don't load three.js.
export const ROLE_INFO = Object.freeze({
  manager: { color: '#D97757', title: 'Manager', job: 'Orchestrator: your own Claude Code session' },
  developer: { color: '#4F7CAC', title: 'Developer', job: 'Software developer' },
  reviewer: { color: '#B5483B', title: 'Code reviewer', job: 'Code reviewer' },
  qa: { color: '#E0B04A', title: 'QA tester', job: 'QA / tester' },
  researcher: { color: '#8C6BB1', title: 'Researcher', job: 'Researcher' },
  designer: { color: '#E07A9A', title: 'Designer', job: 'Designer' },
  devops: { color: '#3E9C9C', title: 'DevOps engineer', job: 'DevOps / deploy' },
  writer: { color: '#D8C8A8', title: 'Writer', job: 'Writer / docs' },
  analyst: { color: '#8DB04A', title: 'Analyst', job: 'Data analyst' },
  security: { color: '#6E7B8C', title: 'Security auditor', job: 'Security auditor' },
})

// Other names that map to a role: the types Claude Code ships, and the role names
// an earlier version of the bridge mod used.
const ALIASES = Object.freeze({
  explore: 'researcher',
  plan: 'writer',
  'general-purpose': 'developer',
  engineer: 'developer',
  architect: 'designer',
  pm: 'writer',
  simplifier: 'reviewer',
})

// The team's agents and the character each one uses: { ada: 'developer', … }.
let teamCharacters = {}

export function setTeamCharacters(map) {
  teamCharacters = { ...map }
}

// The role for an agent type: a team agent's own character (`ada` or
// `agent-office:ada`), then a character's own name (`qa`), `Explore` → researcher.
// The manager is only ever the main session; anything unknown works as a developer.
export function roleOf(subagentType = '') {
  const name = (subagentType.includes(':') ? subagentType.split(':').pop() : subagentType).toLowerCase()

  if (Object.hasOwn(teamCharacters, name)) return teamCharacters[name]
  if (name !== 'manager' && ROLE_IDS.includes(name)) return name

  return Object.hasOwn(ALIASES, name) ? ALIASES[name] : 'developer'
}
