import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createCatalog, parseFrontmatter, summarize } from '../server/catalog.mjs'
import { GROUPS, groupOf } from '../server/groups.mjs'
import { createServer } from '../server/server.mjs'
import { allow } from './key.mjs'
import { MARKER, RECOMMENDED, agentFile, normalize, slug } from '../server/team.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let tmp, skillsDir, projectDir, running, base

async function addSkill(name, frontmatter) {
  await mkdir(path.join(skillsDir, name, 'references'), { recursive: true })
  await writeFile(path.join(skillsDir, name, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# ${name}\n`)
  await writeFile(path.join(skillsDir, name, 'references', 'notes.md'), 'extra file')
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'office-team-'))
  skillsDir = path.join(tmp, 'skills')
  projectDir = path.join(tmp, 'project')
  await mkdir(projectDir)
  await addSkill('react-patterns', 'name: react-patterns\ndescription: React idioms. And more after that.')
  await addSkill('beta', 'name: beta\ndescription: >\n  Folded beta text\n  over two lines.\ngroup: research')
  running = createServer({ projectDir, collections: [skillsDir], home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })
  base = await running.listen({ port: 0, discovery: false })
  allow(base, running.key)
})

after(async () => {
  await running.close()
  await rm(tmp, { recursive: true, force: true })
})

const launch = (body, headers = {}) => fetch(`${base}/api/launch`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const ada = { id: 'ada', name: 'Ada', character: 'developer', description: 'Builds the front end.', model: 'sonnet', skills: ['react-patterns', 'beta'] }

test('frontmatter: plain, quoted and folded descriptions, and a group', () => {
  assert.deepEqual(parseFrontmatter('---\nname: a\ndescription: "Say \\"hi\\"."\n---'), { name: 'a', description: 'Say "hi".' })
  assert.equal(parseFrontmatter('---\ndescription: >\n  one\n  two\nlicense: MIT\n---').description, 'one two')
  assert.equal(parseFrontmatter("---\ndescription: 'it''s'\n---").description, "it's")
  assert.equal(parseFrontmatter('---\ncategory: design\n---').category, 'design')
  assert.deepEqual(parseFrontmatter('no frontmatter'), {})
})

test('a summary is the first sentence, cut to one line', () => {
  assert.equal(summarize('First one. Second one.'), 'First one.')
  assert.equal(summarize('x'.repeat(400)).length, 160)
})

test('skills are grouped by area: name rules, then description, then a declared group', () => {
  assert.equal(groupOf('react-patterns'), 'frontend')
  assert.equal(groupOf('planning-and-task-breakdown'), 'planning')
  assert.equal(groupOf('django-security'), 'security')
  assert.equal(groupOf('api-design'), 'backend')
  assert.equal(groupOf('something-new', 'Writes Playwright tests for the app.'), 'testing')
  assert.equal(groupOf('something-new', 'Nothing in particular.'), 'other')
  assert.equal(groupOf('react-patterns', '', 'design'), 'design')
  assert.equal(groupOf('react-patterns', '', 'not-a-group'), 'frontend')
})

const REPO_SKILLS = path.join(here, '..', '..', 'skills')
const hasRepoSkills = await stat(REPO_SKILLS).then(() => true, () => false)

test('every skill in the collection has a group, and few are left as other', { skip: !hasRepoSkills && 'no skills/ collection beside the tool' }, async () => {
  const skills = await createCatalog([{ dir: REPO_SKILLS, kind: 'collection' }]).list()
  const ids = new Set(GROUPS.map((g) => g.id))

  assert.ok(skills.length > 100)
  assert.ok(skills.every((s) => ids.has(s.group)))
  assert.ok(skills.filter((s) => s.group === 'other').length <= 10)
})

test('the skills list reads the folder, with groups, and a skill added later shows up', async () => {
  let body = await (await fetch(`${base}/api/skills`)).json()

  assert.deepEqual(body.skills.map((s) => s.name), ['beta', 'react-patterns'])
  assert.equal(body.skills[1].summary, 'React idioms.')
  assert.equal(body.skills[0].group, 'research')
  assert.equal(body.skills[1].group, 'frontend')
  assert.equal(body.skills[1].installed, false)
  assert.ok(body.groups.some((g) => g.id === 'planning'))

  await addSkill('gamma', 'name: gamma\ndescription: New.')
  await new Promise((resolve) => setTimeout(resolve, 5100)) // past the catalog cache
  body = await (await fetch(`${base}/api/skills`)).json()
  assert.ok(body.skills.some((s) => s.name === 'gamma'))
})

test('before a launch there is no team, and the recommended one is offered', async () => {
  const body = await (await fetch(`${base}/api/team`)).json()

  assert.equal(body.team, null)
  assert.equal(body.recommended.length, 9)
  assert.ok(body.characters.includes('qa'))
})

test('launching writes the agent files, copies the skills and saves the team', async () => {
  const res = await launch({ manager: { name: 'Nick', skills: [] }, agents: [ada, { id: 'mo', name: 'Mo', character: 'writer', skills: [] }] })

  assert.equal(res.status, 200, await res.clone().text())
  const body = await res.json()

  assert.deepEqual(body.added.sort(), ['beta', 'react-patterns'])
  assert.deepEqual(body.written, ['ada', 'mo'])
  assert.ok(body.team.launchedAt > 0)

  const file = await readFile(path.join(projectDir, '.claude', 'agents', 'ada.md'), 'utf8')

  assert.match(file, /^---\nname: ada\ndescription: "Ada \(Developer\)\. Builds the front end\. Skills: react-patterns, beta\."\nskills:\n {2}- react-patterns\n {2}- beta\nmodel: sonnet\ncolor: blue\n---\n/)
  assert.ok(file.includes(MARKER))
  assert.ok(file.includes('- **react-patterns**: React idioms.'))
  assert.equal(await readFile(path.join(projectDir, '.claude', 'skills', 'react-patterns', 'references', 'notes.md'), 'utf8'), 'extra file')

  const saved = JSON.parse(await readFile(path.join(projectDir, '.claude', 'office-team.json'), 'utf8'))

  assert.equal(saved.manager.name, 'Nick')
  assert.equal(saved.summaries['react-patterns'], 'React idioms.')
  assert.equal((await (await fetch(`${base}/api/team`)).json()).team.agents[0].name, 'Ada')
})

test('launching again removes the files of agents taken off the team, and never a file it did not write', async () => {
  const agentsDir = path.join(projectDir, '.claude', 'agents')

  await writeFile(path.join(agentsDir, 'mine.md'), '---\nname: mine\ndescription: my own\n---\n')

  const res = await launch({ manager: { name: 'Nick', skills: [] }, agents: [ada] })
  const body = await res.json()

  assert.deepEqual(body.removed, ['mo'])
  assert.deepEqual(body.added, [])
  assert.deepEqual((await readdir(agentsDir)).sort(), ['ada.md', 'mine.md'])

  const clash = await launch({ manager: { name: 'Nick', skills: [] }, agents: [{ ...ada, id: 'mine', name: 'Mine' }] })

  assert.equal(clash.status, 400)
  assert.match(await clash.text(), /not written by Agent Office/)
  assert.equal(await readFile(path.join(agentsDir, 'mine.md'), 'utf8'), '---\nname: mine\ndescription: my own\n---\n')
})

test('a launch with an unknown skill, a bad id, a duplicate or a stranger character is refused', async () => {
  const bad = [
    { ...ada, skills: ['nope'] },
    { ...ada, skills: ['../react-patterns'] },
    { ...ada, id: 'Ada Lovelace' },
    { ...ada, character: 'manager' },
    { ...ada, model: 'gpt-4' },
  ]

  for (const agent of bad) assert.equal((await launch({ manager: { skills: [] }, agents: [agent] })).status, 400, JSON.stringify(agent))
  assert.equal((await launch({ manager: { skills: [] }, agents: [ada, ada] })).status, 400)
  assert.equal((await launch({ manager: { skills: 'beta' }, agents: [] })).status, 400)
})

test('another website cannot launch a team', async () => {
  assert.equal((await launch({ agents: [] }, { origin: 'http://evil.test' })).status, 403)
})

test('ids come from names, and an old team file still reads', () => {
  assert.equal(slug('Ada Lovelace!'), 'ada-lovelace')
  assert.equal(slug('  42 Bob  '), 'bob')
  assert.equal(slug('???'), 'agent')

  const old = normalize({ workers: { developer: { name: 'Ada', skills: ['x'] }, manager: { name: 'Nick' } } })

  assert.deepEqual(old.agents.map((a) => [a.id, a.name, a.character]), [['developer', 'Ada', 'developer']])
  assert.equal(old.manager.name, 'Nick')
  assert.deepEqual(normalize({ agents: [{ name: 'A' }, { name: 'A' }] }).agents.map((a) => a.id), ['a', 'a-2'])
})

test('an agent with no skills or description still gets a usable file', () => {
  const file = agentFile({ id: 'bo', name: 'Bo', character: 'qa', description: '', model: 'inherit', skills: [] }, {})

  assert.ok(!file.includes('skills:'))
  assert.ok(!file.includes('model:'))
  assert.match(file, /description: "Bo \(QA tester\)\. Works as the team's QA tester\."/)
})

test('the recommended team uses valid skill names, and they exist in the collection', async () => {
  for (const a of RECOMMENDED) {
    for (const skill of a.skills) {
      assert.match(skill, /^[a-z0-9][a-z0-9._-]*$/)
      if (hasRepoSkills) await readFile(path.join(REPO_SKILLS, skill, 'SKILL.md'))
    }
  }
})
