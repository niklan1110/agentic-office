#!/usr/bin/env node
// Takes the README screenshots of a running office with headless Chrome, at exact
// sizes, through the DevTools protocol (Node 22+, no dependencies).
//
//   node scripts/capture.mjs <office url> <out dir> [name,name…]   (CHROME=path for another browser)
//
// It changes the office's theme while it works; the office must already show a team.

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const [base = 'http://127.0.0.1:7777', out = 'docs/media', only = ''] = process.argv.slice(2)
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SHOTS = [
  { name: 'office-light', theme: 'studio', url: '/?from=setup&speed=6', w: 1400, h: 820, scale: 1.5, wait: 9000 },
  { name: 'office-dark', theme: 'night', url: '/?from=setup&speed=6', w: 1400, h: 820, scale: 1.5, wait: 9000 },
  { name: 'social-preview', theme: 'neon', url: '/?from=setup&speed=6&clean', w: 1280, h: 640, scale: 1, wait: 9000, format: 'jpeg' },
  { name: 'themes-studio', theme: 'studio', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'themes-night', theme: 'night', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'themes-cabin', theme: 'cabin', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'themes-glass', theme: 'glass', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'themes-matrix', theme: 'matrix', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'themes-neon', theme: 'neon', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-open', layout: 'open', theme: 'studio', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-pairs', layout: 'pairs', theme: 'cabin', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-cubicles', layout: 'cubicles', theme: 'matrix', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-offices', layout: 'offices', theme: 'glass', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-pods', layout: 'pods', theme: 'neon', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'layout-bench', layout: 'bench', theme: 'night', url: '/?from=setup&speed=6&clean', w: 1000, h: 620, scale: 1, wait: 8000 },
  { name: 'phone', theme: 'night', url: '/?from=setup&speed=6', w: 390, h: 844, scale: 3, mobile: true, wait: 9000 },
  { name: 'setup-agents', theme: 'studio', url: '/setup.html#agents', w: 1400, h: 900, scale: 1.5, wait: 2500 },
  { name: 'setup-new-agent', url: '/setup.html#agents/new', w: 1400, h: 900, scale: 1.5, wait: 2500 },
  { name: 'offices', url: '/offices.html', w: 1100, h: 560, scale: 1.5, wait: 2500 },
]

const profile = await mkdtemp(path.join(os.tmpdir(), 'capture-'))
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break } catch { await sleep(200) }
}

async function shoot(shot) {
  if (shot.theme || shot.layout) await fetch(`${base}/api/office`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: shot.theme, layout: shot.layout ?? 'open' }) })

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  await new Promise((r) => { ws.onopen = r })

  const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })) })

  await send('Emulation.setDeviceMetricsOverride', { width: shot.w, height: shot.h, deviceScaleFactor: shot.scale, mobile: Boolean(shot.mobile) })
  if (shot.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.enable')
  await send('Page.navigate', { url: base + shot.url })
  await sleep(shot.wait)

  // WebP keeps the README light (GitHub renders it); the social preview must be PNG or JPEG.
  const format = shot.format ?? 'webp'
  const { result } = await send('Page.captureScreenshot', { format, quality: 86, captureBeyondViewport: false })
  const file = `${shot.name}.${format === 'jpeg' ? 'jpg' : format}`

  await writeFile(path.join(out, file), Buffer.from(result.data, 'base64'))
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {})
  console.log(`  ${file}`)
}

try {
  for (const shot of SHOTS) if (!only || only.split(',').includes(shot.name)) await shoot(shot)
} finally {
  browser.kill()
}
