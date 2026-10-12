import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { lanAddress } from '../server/phone.mjs'
import { createServer } from '../server/server.mjs'

let tmp, a, b, baseA, baseB

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'office-sharing-'))
  for (const p of ['alpha', 'beta']) await mkdir(path.join(tmp, p))
  const opts = (p) => ({ projectDir: path.join(tmp, p), home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })
  a = createServer(opts('alpha'))
  b = createServer(opts('beta'))
  baseA = await a.listen({ port: 0 })
  baseB = await b.listen({ port: 0 })
})

after(async () => {
  await a.close()
  await b.close()
  await rm(tmp, { recursive: true, force: true })
})

const post = (base, p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// A request as a phone on the network makes it: any Host, cookies by hand, no redirects followed.
function phoneGet(url, cookie = '') {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: cookie ? { cookie } : {} }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { text += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    }).on('error', reject)
  })
}

test('the look (theme, layout, colours) is saved per project and the theme shows in the summary', async () => {
  assert.deepEqual(await (await fetch(`${baseA}/api/office`)).json(), { theme: 'studio', layout: 'open', colors: {} })
  assert.equal((await post(baseA, '/api/office', { theme: 'nope' })).status, 400)
  assert.equal((await post(baseA, '/api/office', { layout: 'castle' })).status, 400)
  assert.equal((await post(baseA, '/api/office', { colors: { wall: 'red' } })).status, 400)
  assert.equal((await post(baseA, '/api/office', { colors: { ceiling: '#112233' } })).status, 400)
  assert.deepEqual(await (await post(baseA, '/api/office', { theme: 'night' })).json(), { theme: 'night', layout: 'open', colors: {} })
  assert.deepEqual(await (await post(baseA, '/api/office', { layout: 'cubicles', colors: { wall: '#112233', floor: '#445566' } })).json(), { theme: 'night', layout: 'cubicles', colors: { wall: '#112233', floor: '#445566' } })
  assert.deepEqual((await (await post(baseA, '/api/office', { colors: { wall: null } })).json()).colors, { floor: '#445566' })

  const summary = await (await fetch(`${baseA}/api/summary`)).json()

  assert.deepEqual([summary.name, summary.theme, summary.agents, summary.busy], ['alpha', 'night', 0, 0])
})

test('every running office lists all of them; a busy agent counts as working', async () => {
  await post(baseB, '/api/events', { type: 'tool', agent: 'a1', tool: 'Edit' })

  const { here, offices } = await (await fetch(`${baseA}/api/offices`)).json()

  assert.equal(here, baseA)
  assert.deepEqual(offices.map((o) => o.name), ['alpha', 'beta'])
  assert.equal(offices.find((o) => o.name === 'beta').busy, 1)
})

test('a stopped office leaves the list', async () => {
  const dir = path.join(tmp, 'gamma')
  await mkdir(dir)
  const c = createServer({ projectDir: dir, home: path.join(tmp, 'home'), appHome: path.join(tmp, 'app-home') })
  await c.listen({ port: 0 })
  assert.equal((await (await fetch(`${baseA}/api/offices`)).json()).offices.length, 3)
  await c.close()
  assert.equal((await (await fetch(`${baseA}/api/offices`)).json()).offices.length, 2)
})

test('view on phone: off by default, a secret link, watch-only, and off again', { skip: !lanAddress() && 'no network interface' }, async () => {
  assert.equal((await (await fetch(`${baseA}/api/phone`)).json()).on, false)

  const on = await (await post(baseA, '/api/phone', { on: true })).json()

  assert.equal(on.on, true)
  assert.match(on.qr, /^<svg/)

  const link = new URL(on.url)
  const root = `${link.protocol}//${link.host}`

  // Without the secret: nothing. With a wrong one: nothing.
  assert.equal((await phoneGet(`${root}/`)).status, 403)
  assert.equal((await phoneGet(`${root}/?k=wrong`)).status, 403)

  // The secret becomes a cookie, then the office page and its live data open...
  const first = await phoneGet(on.url)

  assert.equal(first.status, 303)

  const cookie = first.headers['set-cookie'][0].split(';')[0]

  assert.match(first.headers['set-cookie'][0], /HttpOnly/)
  assert.match(cookie, /^agent_office_view=/)
  assert.equal((await phoneGet(`${root}/`, cookie)).status, 200)

  const hello = JSON.parse((await phoneGet(`${root}/api/hello`, cookie)).text)

  assert.equal(hello.viewOnly, true)
  assert.equal((await phoneGet(`${root}/api/team`, cookie)).status, 200)

  // ...but nothing that changes things or shows other projects.
  for (const p of ['/setup.html', '/offices.html', '/api/offices', '/api/skills', '/api/phone']) {
    assert.equal((await phoneGet(`${root}${p}`, cookie)).status, 404, p)
  }

  const posted = await new Promise((resolve) => {
    const req = http.request(`${root}/api/tasks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' } }, (res) => resolve(res.statusCode))
    req.end(JSON.stringify({ text: 'rm -rf' }))
  })

  assert.equal(posted, 404)

  // Off: the door is gone.
  assert.equal((await (await post(baseA, '/api/phone', { on: false })).json()).on, false)
  await assert.rejects(phoneGet(`${root}/`, cookie))
})
