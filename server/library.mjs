// The personal skill library (~/.agent-office/skills): skills a person added from a
// GitHub link or a zip, available in every project's skill picker. Adding is two
// steps: inspect (download or unpack, find the skills, show them) and add (copy the
// ones picked into the library).

import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { SKILL_NAME, parseFrontmatter, summarize } from './catalog.mjs'
import { groupOf } from './groups.mjs'
import { unzip } from './unzip.mjs'

export const MAX_ZIP = 40 * 1024 * 1024 // bytes downloaded or uploaded
const KEEP_MS = 15 * 60 * 1000 // how long an inspected archive waits to be added

export const libraryDir = (home = process.env.AGENT_OFFICE_HOME ?? path.join(os.homedir(), '.agent-office')) => path.join(home, 'skills')

// What a GitHub link points at: the repository, the ref to download, the folder inside.
// Accepts github.com/<owner>/<repo>[/tree|blob/<ref>/<path>] and the owner/repo shorthand.
export function parseGitHub(input) {
  const text = String(input ?? '').trim().replace(/\.git$/, '')
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(text)

  if (short) return { owner: short[1], repo: short[2], ref: 'HEAD', dir: '' }

  let url
  try {
    url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null

  const [owner, repo, kind, ref, ...rest] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (!owner || !repo) return null
  if (kind !== 'tree' && kind !== 'blob') return { owner, repo, ref: 'HEAD', dir: '' }

  // A link to a SKILL.md (blob) means its folder.
  const parts = kind === 'blob' ? rest.slice(0, -1) : rest

  return { owner, repo, ref: ref || 'HEAD', dir: parts.join('/') }
}

// The skills in a list of files: every folder holding a SKILL.md (the outermost one when they nest).
export function findSkills(files, within = '') {
  const prefix = within ? within.replace(/\/+$/, '') + '/' : ''
  const docs = files
    .filter((f) => /(^|\/)SKILL\.md$/i.test(f.path) && f.path.startsWith(prefix))
    .map((f) => ({ dir: f.path.replace(/\/?SKILL\.md$/i, ''), text: f.data.toString('utf8') }))
    .sort((a, b) => a.dir.length - b.dir.length)
  const taken = []
  const skills = []

  for (const doc of docs) {
    if (taken.some((d) => d === '' || doc.dir.startsWith(d + '/'))) continue
    taken.push(doc.dir)

    const meta = parseFrontmatter(doc.text)
    const folder = doc.dir.split('/').pop() ?? ''
    const name = [meta.name, folder].find((n) => typeof n === 'string' && SKILL_NAME.test(n))

    if (!name) continue

    const description = (meta.description ?? '').replace(/\s+/g, ' ').trim()

    skills.push({ name, dir: doc.dir, description, summary: summarize(description || name), group: groupOf(name, description, meta.group ?? meta.category) })
  }

  return skills.sort((x, y) => x.name.localeCompare(y.name))
}

export function createLibrary({ dir = libraryDir(), fetchImpl = fetch, now = Date.now } = {}) {
  const pending = new Map() // token → { files, skills, source, at }

  function keep(files, skills, source) {
    for (const [k, v] of pending) if (now() - v.at > KEEP_MS) pending.delete(k)

    const token = randomUUID()

    pending.set(token, { files, skills, source, at: now() })

    return token
  }

  // Unpacks a zip and lists its skills. `within` limits it to one folder; a GitHub zip has one top folder to skip.
  function inspectZip(buf, source, within = '', githubTop = false) {
    let files = unzip(buf)

    if (githubTop) files = files.map((f) => ({ ...f, path: f.path.split('/').slice(1).join('/') })).filter((f) => f.path)

    const skills = findSkills(files, within)

    if (!skills.length) throw new Error(within ? `no skills (folders with a SKILL.md) under ${within}` : 'no skills found: a skill is a folder with a SKILL.md')

    return { token: keep(files, skills, source), source, skills: skills.map(({ dir: _, ...s }) => s) }
  }

  return {
    dir,

    inspectZip: (buf, name = 'uploaded zip') => inspectZip(buf, name),

    async inspectGitHub(link) {
      const gh = parseGitHub(link)

      if (!gh) throw new Error('that is not a GitHub link; use github.com/<owner>/<repo>, or a link to a folder in it')

      const url = `https://codeload.github.com/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/zip/${gh.ref === 'HEAD' ? 'HEAD' : encodeURIComponent(gh.ref)}`
      let res

      try {
        res = await fetchImpl(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' })
      } catch (err) {
        throw new Error(`could not reach GitHub (${err?.message ?? err})`)
      }

      if (res.status === 404) throw new Error(`GitHub has no public repository ${gh.owner}/${gh.repo}${gh.ref !== 'HEAD' ? ` with a branch or tag ${gh.ref}` : ''}`)
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)

      const length = Number(res.headers.get('content-length') ?? 0)

      if (length > MAX_ZIP) throw new Error(`the repository is larger than ${MAX_ZIP / 1024 / 1024} MB; link to the skill's folder instead`)

      const buf = Buffer.from(await res.arrayBuffer())

      if (buf.length > MAX_ZIP) throw new Error(`the repository is larger than ${MAX_ZIP / 1024 / 1024} MB; link to the skill's folder instead`)

      return inspectZip(buf, `github.com/${gh.owner}/${gh.repo}${gh.dir ? `/${gh.dir}` : ''}`, gh.dir, true)
    },

    // Copies the picked skills of an inspected archive into the library, replacing older copies.
    async add(token, names) {
      const found = pending.get(token)

      if (!found) throw new Error('that list has expired; paste the link or pick the zip again')

      const wanted = found.skills.filter((s) => names.includes(s.name))

      if (!wanted.length) throw new Error('pick at least one skill')

      for (const skill of wanted) {
        const target = path.join(dir, skill.name)
        const base = skill.dir ? skill.dir + '/' : ''

        await rm(target, { recursive: true, force: true })
        for (const f of found.files) {
          if (base && !f.path.startsWith(base)) continue

          const rel = f.path.slice(base.length)
          const out = path.resolve(target, rel)

          if (!rel || !out.startsWith(target + path.sep)) continue
          await mkdir(path.dirname(out), { recursive: true })
          await writeFile(out, f.data)
        }
      }

      return { added: wanted.map((s) => s.name), source: found.source }
    },

    async remove(name) {
      if (!SKILL_NAME.test(name)) throw new Error('no such skill')
      await rm(path.join(dir, name), { recursive: true, force: true })
    },
  }
}
