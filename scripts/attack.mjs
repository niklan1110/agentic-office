#!/usr/bin/env node
// Tries to reach a running office the ways an attacker would, and says what got through.
// Run it against a throwaway office, never one a Claude Code session is connected to:
// a task that gets through is real.
//
//   node scripts/attack.mjs http://127.0.0.1:<port>

import http from 'node:http'
import os from 'node:os'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:7777')
const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
const results = []
const check = (name, blocked, detail) => results.push({ name, blocked, detail })

// A raw request, so headers like Host and Origin can be anything.
function raw({ host = base.hostname, method = 'GET', path = '/', headers = {}, body }) {
  return new Promise((resolve) => {
    const req = http.request({ host, port: base.port, method, path, headers, timeout: 3000 }, (res) => {
      let text = ''
      res.on('data', (c) => { text += c })
      res.on('end', () => resolve({ status: res.statusCode, text }))
    })
    req.on('error', (err) => resolve({ status: 0, text: err.code }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: 'timeout' }) })
    if (body) req.write(body)
    req.end()
  })
}
const task = JSON.stringify({ text: 'SECURITY TEST: this task should never arrive' })

if (lan) {
  const r = await raw({ host: lan, path: '/api/status' })
  check(`another computer on the network (${lan})`, r.status === 0 || r.status === 403, `${r.status} ${r.text.slice(0, 40)}`)
}

let r = await raw({ method: 'POST', path: '/api/tasks', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: task })
check('a website in your browser sending a task (cross-origin fetch)', r.status === 403, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ method: 'POST', path: '/api/tasks', headers: { 'content-type': 'text/plain', origin: 'https://evil.example' }, body: task })
check('a website submitting a hidden form', r.status >= 400, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ path: '/api/status', headers: { host: 'evil.example' } })
check('DNS rebinding (a website pointing its own name at 127.0.0.1)', r.status === 403, `${r.status} ${r.text.slice(0, 40)}`)

r = await raw({ method: 'POST', path: '/api/tasks', headers: { 'content-type': 'application/json', host: `127.0.0.1:${base.port}` }, body: task })
check('another program or user on this computer sending a task (no key)', r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ path: '/api/status', headers: { host: `127.0.0.1:${base.port}` } })
check('another program or user on this computer reading tasks and sessions (no key)', r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ method: 'POST', path: '/api/sessions/heartbeat', headers: { 'content-type': 'application/json', host: `127.0.0.1:${base.port}` }, body: JSON.stringify({ session: 'thief', project: process.argv[3] ?? '' }) })
check('another program posing as your Claude Code session to receive tasks (no key)', r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ method: 'POST', path: '/api/launch', headers: { 'content-type': 'application/json', host: `127.0.0.1:${base.port}` }, body: JSON.stringify({ manager: { skills: [] }, agents: [] }) })
check('another program writing agent files into your project (no key)', r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 50)}`)

r = await raw({ path: '/%2e%2e/%2e%2e/package.json', headers: { host: `127.0.0.1:${base.port}` } })
check('reading files outside the app (path traversal)', r.status === 404 || r.status === 400, `${r.status}`)

for (const x of results) console.log(`${x.blocked ? 'BLOCKED ' : 'ALLOWED!'}  ${x.name}  [${x.detail}]`)
process.exitCode = results.every((x) => x.blocked) ? 0 : 1
