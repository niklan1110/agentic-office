// The team: the agents the person builds on the setup page, kept in the project as
// .claude/office-team.json. Launching it deploys the team into Claude Code:
//
// - each assigned skill is copied from this repo into the project's .claude/skills/
//   (Claude Code picks new skills up mid-session);
// - each agent becomes .claude/agents/<id>.md, a subagent with its skills preloaded,
//   which every Claude Code session started in the project has (VS Code, terminal, …);
// - sessions already running with the office-bridge mod register the agents live,
//   since agent files are only read when a session starts.
//
// Each agent picks one of the nine office characters for its look and desk; several
// agents may share one. The manager is the person's own session.

import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ROLE_IDS, ROLE_INFO } from '../public/js/roles.js'
import { SKILL_NAME } from './catalog.mjs'

export const TEAM_FILE = path.join('.claude', 'office-team.json')
export const AGENT_ID = /^[a-z][a-z0-9-]{0,39}$/
export const CHARACTERS = ROLE_IDS.filter((id) => id !== 'manager')
export const MODELS = ['inherit', 'sonnet', 'opus', 'haiku']
export const LIMITS = Object.freeze({ name: 32, description: 400, skills: 20, agents: 30 })
export const MARKER = '<!-- Written by Agent Office from .claude/office-team.json. Edit the team on the office setup page: this file is replaced on the next launch. -->'

// Claude Code's agent colours closest to each character.
const COLORS = { developer: 'blue', reviewer: 'red', qa: 'yellow', researcher: 'purple', designer: 'pink', devops: 'cyan', writer: 'orange', analyst: 'green' }

// The recommended team: one agent per character, with the skills the office-bridge mod's roles use.
export const RECOMMENDED = Object.freeze([
  { id: 'developer', name: 'Developer', character: 'developer', skills: ['incremental-implementation', 'test-driven-development', 'source-driven-development'], description: 'Builds a feature or change in small, verified slices. Use to implement something that touches several files and needs tests.' },
  { id: 'reviewer', name: 'Reviewer', character: 'reviewer', skills: ['code-review-and-quality', 'code-simplification', 'ponytail-review'], description: 'Reviews a change for correctness, readability and over-engineering, and says what to cut. Use before merging, or after a feature works.' },
  { id: 'qa', name: 'QA', character: 'qa', skills: ['test-driven-development', 'browser-testing-with-devtools', 'debugging-and-error-recovery'], description: 'Writes and runs tests, reproduces bugs and checks the running app in a browser. Use to verify a change or track down a failure.' },
  { id: 'researcher', name: 'Researcher', character: 'researcher', skills: ['search-first', 'idea-refine', 'source-driven-development'], description: 'Looks for existing tools, libraries and official docs before anything is built, and refines vague ideas. Use at the start of a feature.' },
  { id: 'designer', name: 'Designer', character: 'designer', skills: ['frontend-ui-engineering', 'design-system', 'archify'], description: 'Designs interfaces and systems: UI components, design tokens and architecture diagrams. Use for front-end work or to draw how parts connect.' },
  { id: 'devops', name: 'DevOps', character: 'devops', skills: ['ci-cd-and-automation', 'shipping-and-launch', 'observability-and-instrumentation'], description: 'Sets up CI/CD, ships releases safely and adds logs, metrics and alerts. Use for pipelines, deploys and production readiness.' },
  { id: 'writer', name: 'Writer', character: 'writer', skills: ['spec-driven-development', 'planning-and-task-breakdown', 'documentation-and-adrs'], description: 'Writes specs, plans, docs and decision records. Use to turn a request into a spec and a task list, or to document what was built.' },
  { id: 'analyst', name: 'Analyst', character: 'analyst', skills: ['performance-optimization', 'benchmark', 'codebase-onboarding'], description: 'Measures and explains: performance baselines, regressions, and how an unfamiliar codebase fits together. Use before optimising.' },
  { id: 'security', name: 'Security', character: 'security', skills: ['security-and-hardening', 'code-review-and-quality'], description: 'Reviews code for vulnerabilities and unsafe input handling. Use before merging anything that touches auth, user input or stored data.' },
].map((a) => ({ ...a, model: 'inherit' })))

const clean = (value, limit) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : ''

// An agent id from its name: "Ada Lovelace" → ada-lovelace.
export function slug(name) {
  const s = String(name).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^[^a-z]+|-+$/g, '')

  return s.slice(0, 40).replace(/-+$/, '') || 'agent'
}

const skillList = (value) => (Array.isArray(value) ? [...new Set(value.filter((s) => typeof s === 'string' && SKILL_NAME.test(s)))] : [])

// Any team file or page payload as a well-formed team (the v1 `workers` map included).
export function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const agentsIn = Array.isArray(src.agents)
    ? src.agents
    : src.workers && typeof src.workers === 'object'
      ? CHARACTERS.filter((c) => src.workers[c]).map((c) => ({ ...src.workers[c], character: c, id: c }))
      : []
  const seen = new Set()
  const agents = []

  for (const a of agentsIn.slice(0, LIMITS.agents)) {
    if (!a || typeof a !== 'object') continue

    const name = clean(a.name, LIMITS.name) || 'Agent'
    let id = AGENT_ID.test(a.id ?? '') ? a.id : slug(name)

    for (let n = 2; seen.has(id); n++) id = `${slug(name).slice(0, 36)}-${n}`
    seen.add(id)

    agents.push({
      id,
      name,
      character: CHARACTERS.includes(a.character) ? a.character : 'developer',
      description: clean(a.description, LIMITS.description),
      model: MODELS.includes(a.model) ? a.model : 'inherit',
      skills: skillList(a.skills).slice(0, LIMITS.skills),
    })
  }

  const m = src.manager ?? src.workers?.manager ?? {}

  return {
    version: 2,
    launchedAt: Number.isFinite(src.launchedAt) ? src.launchedAt : null,
    manager: { name: clean(m.name, LIMITS.name) || 'Manager', skills: skillList(m.skills).slice(0, LIMITS.skills) },
    agents,
  }
}

// What the page sent, checked strictly. Returns { team } or { error } naming what to fix.
export function validateTeam(raw, known) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.agents)) return { error: 'expected { manager, agents: [...] }' }
  if (raw.agents.length > LIMITS.agents) return { error: `at most ${LIMITS.agents} agents` }

  const ids = new Set()
  const all = [['the manager', raw.manager?.skills ?? []], ...raw.agents.map((a) => [a?.name || 'an agent', a?.skills ?? []])]

  for (const a of raw.agents) {
    if (!a || typeof a !== 'object') return { error: 'every agent must be an object' }
    if (!clean(a.name, LIMITS.name)) return { error: 'every agent needs a name' }
    if (!AGENT_ID.test(a.id ?? '')) return { error: `${a.name}: its id must be lowercase letters, digits and dashes, starting with a letter` }
    if (ids.has(a.id)) return { error: `two agents share the id ${a.id}; rename one` }
    ids.add(a.id)
    if (a.character !== undefined && !CHARACTERS.includes(a.character)) return { error: `${a.name}: no character called ${a.character}` }
    if (a.model !== undefined && !MODELS.includes(a.model)) return { error: `${a.name}: model must be one of ${MODELS.join(', ')}` }
  }

  for (const [who, skills] of all) {
    if (!Array.isArray(skills)) return { error: `${who}: skills must be a list` }
    if (skills.length > LIMITS.skills) return { error: `${who}: at most ${LIMITS.skills} skills` }

    for (const s of skills) {
      if (typeof s !== 'string' || !known.has(s)) return { error: `${who}: no skill called ${String(s)}` }
    }
  }

  return { team: normalize(raw) }
}

const yaml = (s) => JSON.stringify(s) // a JSON string is a valid double-quoted YAML scalar

// The subagent file for one agent: frontmatter Claude Code reads, then its system prompt.
export function agentFile(agent, summaries) {
  const title = ROLE_INFO[agent.character].title
  const skillLines = agent.skills.map((s) => `- **${s}**${summaries[s] ? `: ${summaries[s]}` : ''}`)
  const when = agent.description || `Works as the team's ${title}.`
  const description = `${agent.name} (${title}). ${when}${agent.skills.length ? ` Skills: ${agent.skills.join(', ')}.` : ''}`
  const front = [
    '---',
    `name: ${agent.id}`,
    `description: ${yaml(description.slice(0, 1000))}`,
    ...(agent.skills.length ? ['skills:', ...agent.skills.map((s) => `  - ${s}`)] : []),
    ...(agent.model !== 'inherit' ? [`model: ${agent.model}`] : []),
    ...(COLORS[agent.character] ? [`color: ${COLORS[agent.character]}`] : []),
    '---',
  ]
  const body = [
    MARKER,
    '',
    `You are ${agent.name}, the team's ${title}. ${agent.description}`.trim(),
    '',
    ...(skillLines.length ? ['Your skills, already loaded for you; use the ones that fit the task:', '', ...skillLines, ''] : []),
    'The manager (the main Claude Code session) gives you one task. Do only that task. Keep changes small and check them before you report.',
    'Finish with a short, concrete report for the manager: what you did, how you checked it, and what is left.',
  ]

  return [...front, ...body].join('\n') + '\n'
}

export function createTeamStore({ projectDir, catalog }) {
  const file = path.join(projectDir, TEAM_FILE)
  const skillsDir = path.join(projectDir, '.claude', 'skills')
  const agentsDir = path.join(projectDir, '.claude', 'agents')

  async function installed(name) {
    try {
      return (await stat(path.join(skillsDir, name, 'SKILL.md'))).isFile()
    } catch {
      return false
    }
  }

  async function readText(p) {
    try {
      return await readFile(p, 'utf8')
    } catch {
      return undefined
    }
  }

  return {
    projectDir,
    file,
    installed,

    // The launched team, or null when the project has none yet.
    async read() {
      const text = await readText(file)

      if (text === undefined) return null

      try {
        return normalize(JSON.parse(text))
      } catch {
        return null
      }
    },

    // Deploys the team: copies skills in, writes the agent files, removes the agent
    // files of agents no longer on the team (only the ones this wrote), saves the team.
    async launch(raw) {
      const skills = await catalog.list()
      const byName = new Map(skills.map((s) => [s.name, s]))
      const known = new Set(byName.keys())
      const asked = [...(raw?.manager?.skills ?? []), ...(Array.isArray(raw?.agents) ? raw.agents.flatMap((a) => a?.skills ?? []) : [])]

      // A skill gone from the repo but still in the project may stay assigned.
      for (const s of asked) if (typeof s === 'string' && SKILL_NAME.test(s) && !known.has(s) && (await installed(s))) known.add(s)

      const checked = validateTeam(raw, known)

      if (checked.error) return checked

      const team = { ...checked.team, launchedAt: Date.now() }

      // Refuse to replace an agent file the person wrote themselves.
      for (const a of team.agents) {
        const existing = await readText(path.join(agentsDir, `${a.id}.md`))

        if (existing !== undefined && !existing.includes(MARKER)) {
          return { error: `.claude/agents/${a.id}.md already exists and was not written by Agent Office; give ${a.name} another name` }
        }
      }

      const wanted = [...new Set([...team.manager.skills, ...team.agents.flatMap((a) => a.skills)])]
      const added = []

      for (const name of wanted) {
        // Only collection skills need copying: personal ones are in every session already.
        if (byName.get(name)?.source !== 'collection' || (await installed(name))) continue
        await cp(byName.get(name).dir, path.join(skillsDir, name), { recursive: true, force: false, errorOnExist: false })
        added.push(name)
      }

      const summaries = Object.fromEntries(wanted.filter((n) => byName.has(n)).map((n) => [n, byName.get(n).summary]))

      await mkdir(agentsDir, { recursive: true })

      const removed = []

      for (const entry of await readdir(agentsDir)) {
        if (!entry.endsWith('.md') || team.agents.some((a) => `${a.id}.md` === entry)) continue
        if ((await readText(path.join(agentsDir, entry)))?.includes(MARKER)) {
          await rm(path.join(agentsDir, entry))
          removed.push(entry.slice(0, -3))
        }
      }

      for (const a of team.agents) await writeFile(path.join(agentsDir, `${a.id}.md`), agentFile(a, summaries))

      await writeFile(file + '.tmp', JSON.stringify({ ...team, summaries }, null, 2) + '\n')
      await rename(file + '.tmp', file)

      catalog.refresh()

      return { team, added, written: team.agents.map((a) => a.id), removed }
    },
  }
}
