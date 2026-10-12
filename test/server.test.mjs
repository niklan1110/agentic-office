import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { discoveryPath, readDiscovery, runningServer } from '../server/discovery.mjs'
import { VERSION, createServer } from '../server/server.mjs'

let tmp, project, office, base

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'office-server-'))
  project = path.join(tmp, 'app')
  await mkdir(project)
  office = createServer({ projectDir: project, home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })
  base = await office.listen({ port: 0, strictPort: true })
})

after(async () => {
  await office.close()
  await rm(tmp, { recursive: true, force: true })
})

const post = (p, body, headers = {}) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

// The stream's named and unnamed events, in order.
function listen() {
  const seen = []
  const waiters = []
  const req = http.get(`${base}/api/stream`, (res) => {
    let buf = ''

    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buf += chunk
      let end
      while ((end = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, end)
        buf = buf.slice(end + 2)
        const name = /^event: (.+)$/m.exec(block)?.[1] ?? 'message'
        const data = /^data: (.+)$/m.exec(block)?.[1]
        if (!data) continue
        const item = { name, data: JSON.parse(data) }
        seen.push(item)
        for (const w of [...waiters]) if (w.match(item)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(item) }
      }
    })
  })
  return {
    seen,
    next: (match) => {
      const found = seen.find(match)
      return found ? Promise.resolve(found) : new Promise((resolve) => waiters.push({ match, resolve }))
    },
    close: () => req.destroy(),
  }
}

test('hello says what it is, and the discovery file points at it', async () => {
  const hello = await (await fetch(`${base}/api/hello`)).json()

  assert.deepEqual(hello, { app: 'agent-office', version: VERSION, project, url: base, viewOnly: false })
  assert.equal((await readDiscovery(project)).url, base)
  assert.equal((await runningServer(project)).url, base)
})

test('a session connects with a heartbeat, gets a task, and confirms it', async () => {
  const id = (await (await post('/api/tasks', { text: 'Add a login page' })).json()).id
  const beat = await (await post('/api/sessions/heartbeat', { session: 's1', project, plugin: 'agent-office', version: VERSION })).json()

  assert.equal(beat.match, true)
  assert.deepEqual(beat.task, { id, text: 'Add a login page' })
  assert.equal((await post(`/api/tasks/${id}/result`, { session: 's1', ok: true })).status, 200)

  const status = await (await fetch(`${base}/api/status`)).json()

  assert.equal(status.connected, 1)
  assert.equal(status.tasks.find((t) => t.id === id).state, 'delivered')
})

test('events are stamped and streamed; one from another project is refused', async () => {
  const stream = listen()

  await stream.next((x) => x.name === 'backlog')
  assert.equal((await post('/api/events', { type: 'tool', agent: 'a1', tool: 'Edit' }, { 'x-agent-office-project': project })).status, 202)

  const got = await stream.next((x) => x.name === 'message' && x.data.tool === 'Edit')

  assert.ok(got.data.at > 0)

  const other = await post('/api/events', { type: 'tool', agent: 'a1', tool: 'Bash' }, { 'x-agent-office-project': path.join(tmp, 'elsewhere') })

  assert.equal(other.status, 409)
  assert.equal((await other.json()).error, 'project-mismatch')
  stream.close()
})

test('bad input is refused with a reason', async () => {
  assert.equal((await post('/api/events', 'not json')).status, 400)
  assert.equal((await post('/api/events', { type: 'nope' })).status, 400)
  assert.equal((await post('/api/events', { type: 'tool', agent: 'a1' }, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await post('/api/events', { type: 'task', text: 'x'.repeat(9000) })).status, 413)
  assert.equal((await post('/api/sessions/heartbeat', { project })).status, 400)
  assert.equal((await post('/api/tasks', { text: '' })).status, 400)
  assert.equal((await post('/api/tasks/999/result', { session: 's1', ok: true })).status, 409)
  assert.equal((await fetch(`${base}/api/nothing`)).status, 404)
})

test('other websites and other hosts are refused', async () => {
  assert.equal((await post('/api/tasks', { text: 'x' }, { origin: 'http://evil.test' })).status, 403)

  const hosted = await new Promise((resolve) => {
    http.get(`${base}/api/hello`, { headers: { host: 'evil.test' } }, (res) => resolve(res.statusCode))
  })

  assert.equal(hosted, 403)
})

test('serves the app and nothing outside it', async () => {
  const page = await fetch(`${base}/`)

  assert.equal(page.status, 200)
  assert.match(await page.text(), /Agent Office/)
  assert.equal((await fetch(`${base}/setup.html`)).status, 200)
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404)
  assert.equal((await fetch(`${base}/missing.js`)).status, 404)
})

test('a taken port moves the server to the next one, unless the port is strict', async () => {
  const second = createServer({ projectDir: path.join(tmp, 'second'), home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })
  const port = Number(new URL(base).port)

  await mkdir(path.join(tmp, 'second'))
  assert.notEqual(Number(new URL(await second.listen({ port })).port), port)
  await second.close()

  const strict = createServer({ projectDir: path.join(tmp, 'second'), home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })

  await assert.rejects(strict.listen({ port, strictPort: true }), /EADDRINUSE/)
})

test('stopping the server removes its discovery file', async () => {
  const dir = path.join(tmp, 'third')

  await mkdir(dir)

  const third = createServer({ projectDir: dir, home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })

  await third.listen({ port: 0 })
  assert.ok(JSON.parse(await readFile(discoveryPath(dir), 'utf8')).url)
  await third.close()
  assert.equal(await readDiscovery(dir), null)
})
