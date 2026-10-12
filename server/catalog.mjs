// The skill catalog: every skill folder (one with a SKILL.md) in the skill sources,
// with its area (groups.mjs). Read from disk on each request, cached for a few
// seconds, so a skill added to a source shows up on the setup page without a restart.
//
// Sources, in order of precedence when two have a skill of the same name:
//   project    <project>/.claude/skills   already in the project
//   personal   ~/.claude/skills           in every session on this machine
//   collection --skills <dir>, AGENT_OFFICE_SKILLS   copied into the project on launch

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { groupOf } from './groups.mjs'

const CACHE_MS = 5000
const SUMMARY_LIMIT = 160
export const SKILL_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/i

// `name`, `description` and `group` (or `category`) from a SKILL.md's YAML frontmatter: plain, quoted, or a
// folded/literal block (`>` or `|`). Enough YAML for skill files, not a general parser.
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)

  if (!match) return {}

  const lines = match[1].split(/\r?\n/)
  const out = {}

  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description|group|category):\s*(.*)$/.exec(lines[i])

    if (!field) continue

    const [, key, rest] = field
    let value = rest.trim()

    if (/^[>|][+-]?$/.test(value)) {
      const block = []

      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
      value = block.join(value.startsWith('|') ? '\n' : ' ').trim()
    } else if (/^["']/.test(value)) {
      const quote = value[0]

      value = value.endsWith(quote) && value.length > 1 ? value.slice(1, -1) : value.slice(1)
      if (quote === '"') value = value.replace(/\\"/g, '"')
      else value = value.replace(/''/g, "'")
    }

    out[key] = value
  }

  return out
}

// The first sentence of a description, cut to fit one line of a list.
export function summarize(description) {
  const flat = description.replace(/\s+/g, ' ').trim()
  const sentence = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat

  return sentence.length <= SUMMARY_LIMIT ? sentence : sentence.slice(0, SUMMARY_LIMIT - 1).trimEnd() + '…'
}

async function readSource({ dir, kind }) {
  let entries

  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const skills = await Promise.all(
    entries
      .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && SKILL_NAME.test(d.name))
      .map(async (d) => {
        let text

        try {
          text = await readFile(path.join(dir, d.name, 'SKILL.md'), 'utf8')
        } catch {
          return null
        }

        const meta = parseFrontmatter(text)
        const description = (meta.description ?? '').replace(/\s+/g, ' ').trim()

        return {
          name: d.name,
          description,
          summary: summarize(description || meta.name || d.name),
          group: groupOf(d.name, description, meta.group ?? meta.category),
          source: kind,
          dir: path.join(dir, d.name),
        }
      }),
  )

  return skills.filter(Boolean)
}

// sources: [{ dir, kind: 'project' | 'personal' | 'collection' }], in precedence order.
export function createCatalog(sources) {
  let cached = null
  let cachedAt = 0

  async function load() {
    const byName = new Map()

    for (const list of await Promise.all(sources.map(readSource))) {
      for (const skill of list) if (!byName.has(skill.name)) byName.set(skill.name, skill)
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    sources,
    async list() {
      if (!cached || Date.now() - cachedAt > CACHE_MS) {
        cached = await load()
        cachedAt = Date.now()
      }

      return cached
    },
    // Forget the cache, after a launch copied skills into the project.
    refresh() {
      cached = null
    },
  }
}
