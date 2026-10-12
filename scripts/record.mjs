#!/usr/bin/env node
// Records the README's animated hero: a running office gets a task, the team meets,
// then goes back to work. The page runs in recording mode (?record), where it only
// moves when stepped, so every frame is exactly 1/FPS of a second however slowly this
// machine renders. ffmpeg turns the frames into a looping animated WebP.
//
//   node scripts/record.mjs <office url> <out file.webp> [seconds] [speed]
//
// Needs ffmpeg on PATH (CHROME=path for another browser). The office should show a team.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const [base = 'http://127.0.0.1:7777', out = 'docs/media/hero.webp', secs = '18', speed = '3'] = process.argv.slice(2)
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334, W = 1200, H = 680, FPS = 12
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const frames = await mkdtemp(path.join(os.tmpdir(), 'record-'))
const profile = await mkdtemp(path.join(os.tmpdir(), 'record-profile-'))
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break } catch { await sleep(200) }
  }

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } }
  await new Promise((r) => { ws.onopen = r })

  const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })) })
  const step = (n) => send('Runtime.evaluate', { expression: `window.__agentOffice.step(${1 / FPS}, ${n})` })

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.enable')
  await send('Page.navigate', { url: `${base}/?from=setup&clean&record&speed=${speed}` })
  await sleep(6000)
  await step(FPS * 2) // let everyone settle at their desks first

  // A task arrives: the manager calls the meeting, then the team gets to work.
  await post('/api/events', { type: 'task', text: 'Ship the new sign-up flow' })
  await sleep(500)

  const work = setInterval(() => {
    for (const a of ['builder', 'qa', 'designer']) post('/api/events', { type: 'tool', agent: a, tool: 'Edit' }).catch(() => {})
  }, 1000)
  const count = Number(secs) * FPS

  for (let n = 0; n < count; n++) {
    await step(1)
    const { result } = await send('Page.captureScreenshot', { format: 'png' })

    await writeFile(path.join(frames, `f${String(n).padStart(5, '0')}.png`), Buffer.from(result.data, 'base64'))
  }
  clearInterval(work)
  ws.close()
  console.log(`  ${count} frames`)

  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.png'),
    '-vf', 'scale=900:-1:flags=lanczos', '-loop', '0', '-c:v', 'libwebp_anim', '-quality', '72', '-compression_level', '6', path.resolve(out)], { stdio: 'inherit' })

  if (ff.status !== 0) throw new Error('ffmpeg failed')
  console.log(`  wrote ${out}`)
} finally {
  browser.kill()
  await rm(frames, { recursive: true, force: true }).catch(() => {})
}
