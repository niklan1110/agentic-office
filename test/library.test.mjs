import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { deflateRawSync } from 'node:zlib'

import { findSkills, parseGitHub } from '../server/library.mjs'
import { createServer } from '../server/server.mjs'
import { allow } from './key.mjs'
import { safePath, unzip } from '../server/unzip.mjs'

// A zip built by hand: [path, text, deflate?] entries. CRCs are left at 0; the reader does not check them.
export function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const [name, text, deflate] of entries) {
    const raw = Buffer.from(text)
    const data = deflate ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)

    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)

    const central = Buffer.alloc(46)

    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x800, 8)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }

  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)

  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, dir, end])
}

const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

test('unzip reads stored and deflated files and skips paths that escape', () => {
  const files = unzip(makeZip([
    ['a/SKILL.md', 'stored'],
    ['a/notes.md', 'x'.repeat(500), true],
    ['../evil.md', 'nope'],
    ['/abs.md', 'nope'],
  ]))

  assert.deepEqual(files.map((f) => f.path), ['a/SKILL.md', 'a/notes.md'])
  assert.equal(files[1].data.toString(), 'x'.repeat(500))
  assert.throws(() => unzip(Buffer.from('hello world, not a zip at all')), /not a zip/)
  assert.equal(safePath('a/../../b'), '')
  assert.equal(safePath('a\\b\\c.md'), 'a/b/c.md')
})

test('GitHub links: repo, shorthand, folder, file and other hosts', () => {
  assert.deepEqual(parseGitHub('https://github.com/acme/skills'), { owner: 'acme', repo: 'skills', ref: 'HEAD', dir: '' })
  assert.deepEqual(parseGitHub('acme/skills'), { owner: 'acme', repo: 'skills', ref: 'HEAD', dir: '' })
  assert.deepEqual(parseGitHub('github.com/acme/skills/tree/main/skills/pdf'), { owner: 'acme', repo: 'skills', ref: 'main', dir: 'skills/pdf' })
  assert.deepEqual(parseGitHub('https://github.com/acme/skills/blob/v2/pdf/SKILL.md'), { owner: 'acme', repo: 'skills', ref: 'v2', dir: 'pdf' })
  assert.equal(parseGitHub('https://gitlab.com/acme/skills'), null)
  assert.equal(parseGitHub('not a link at all'), null)
})

test('skills are the outermost folders with a SKILL.md, named by frontmatter or folder', () => {
  const files = [
    ['pack/pdf/SKILL.md', skill('pdf', 'Read PDFs. More.')],
    ['pack/pdf/nested/SKILL.md', skill('inner', 'ignored')],
    ['pack/Bad Name/SKILL.md', '---\ndescription: x\n---'],
    ['pack/react/SKILL.md', skill('react-patterns', 'React idioms.')],
  ].map(([p, t]) => ({ path: p, data: Buffer.from(t) }))
  const found = findSkills(files)

  assert.deepEqual(found.map((s) => [s.name, s.dir, s.summary]), [['pdf', 'pack/pdf', 'Read PDFs.'], ['react-patterns', 'pack/react', 'React idioms.']])
  assert.deepEqual(findSkills(files, 'pack/react').map((s) => s.name), ['react-patterns'])
})

let tmp, project, office, base, requested

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'office-library-'))
  project = path.join(tmp, 'app')
  await mkdir(project)

  // GitHub, faked: its repository zips have one top folder, <repo>-<ref>/.
  const fetchImpl = async (url) => {
    requested = String(url)
    if (url.includes('/missing/')) return new Response('nope', { status: 404 })
    const zip = makeZip([
      ['skills-main/README.md', 'hi'],
      ['skills-main/pdf/SKILL.md', skill('pdf', 'Read and fill PDFs.'), true],
      ['skills-main/pdf/scripts/fill.py', 'print(1)'],
      ['skills-main/docx/SKILL.md', skill('docx', 'Write Word files.')],
    ])
    return new Response(zip, { status: 200, headers: { 'content-length': String(zip.length) } })
  }

  office = createServer({ projectDir: project, home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home'), fetchImpl })
  base = await office.listen({ port: 0, discovery: false })
  allow(base, office.key)
})

after(async () => {
  await office.close()
  await rm(tmp, { recursive: true, force: true })
})

const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('a GitHub link lists its skills; the ones picked go into the library and show up everywhere', async () => {
  const res = await post('/api/library/inspect', { url: 'https://github.com/acme/skills' })

  assert.equal(res.status, 200, await res.clone().text())

  const found = await res.json()

  assert.equal(requested, 'https://codeload.github.com/acme/skills/zip/HEAD')
  assert.deepEqual(found.skills.map((s) => s.name), ['docx', 'pdf'])
  assert.equal(found.source, 'github.com/acme/skills')

  const added = await (await post('/api/library/add', { token: found.token, names: ['pdf'] })).json()

  assert.deepEqual(added.added, ['pdf'])
  assert.equal(await readFile(path.join(tmp, 'app-home', 'skills', 'pdf', 'scripts', 'fill.py'), 'utf8'), 'print(1)')

  const skills = (await (await fetch(`${base}/api/skills`)).json()).skills

  assert.equal(skills.find((s) => s.name === 'pdf').source, 'library')
  assert.equal(skills.find((s) => s.name === 'docx'), undefined)

  // Launching a team that uses it copies it into the project.
  const launch = await post('/api/launch', { manager: { skills: [] }, agents: [{ id: 'ada', name: 'Ada', character: 'developer', skills: ['pdf'] }] })

  assert.deepEqual((await launch.json()).added, ['pdf'])
  assert.ok((await stat(path.join(project, '.claude', 'skills', 'pdf', 'SKILL.md'))).isFile())
})

test('an uploaded zip is inspected the same way', async () => {
  const zip = makeZip([['my-skill/SKILL.md', skill('my-skill', 'Does a thing.')]])
  const res = await fetch(`${base}/api/library/upload`, { method: 'POST', headers: { 'content-type': 'application/zip', 'x-file-name': 'mine.zip' }, body: zip })
  const found = await res.json()

  assert.deepEqual([found.source, found.skills.map((s) => s.name)], ['mine.zip', ['my-skill']])
  assert.equal((await post('/api/library/add', { token: found.token, names: ['my-skill'] })).status, 200)
  assert.equal((await post('/api/library/remove', { name: 'my-skill' })).status, 200)
  await assert.rejects(stat(path.join(tmp, 'app-home', 'skills', 'my-skill')))
})

test('bad links, missing repos, empty zips and stale tokens get a clear reason', async () => {
  assert.match(await (await post('/api/library/inspect', { url: 'https://gitlab.com/a/b' })).text(), /not a GitHub link/)
  assert.match(await (await post('/api/library/inspect', { url: 'acme/missing' })).text(), /no public repository/)

  const empty = makeZip([['readme.txt', 'no skills here']])

  assert.match(await (await fetch(`${base}/api/library/upload`, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: empty })).text(), /no skills found/)
  assert.match(await (await post('/api/library/add', { token: 'nope', names: ['x'] })).text(), /expired/)
})
