// "View on phone": an opt-in second door to the office, on the home network, that only
// lets you watch. It listens on all interfaces on its own port, and every request
// needs the secret from the QR code: the first visit swaps it for a cookie. Only a
// few GET routes go through (the office page and its live data); everything that
// changes something, and anything about other projects, stays on the loopback door.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import http from 'node:http'
import os from 'node:os'

const qrcode = createRequire(import.meta.url)('./vendor/qrcode.cjs')

// What the phone may open. Pages that change things (setup, offices) are not among them.
const ALLOWED = [/^\/$/, /^\/index\.html$/, /^\/(style\.css|fonts\/[\w.-]+|vendor\/three\/[\w./-]+|js\/[\w.-]+\.js)$/, /^\/api\/(hello|stream|status|team|office)$/]
const COOKIE = 'agent_office_view'

// The computer's address on the home network: the first private IPv4 one.
export function lanAddress(interfaces = os.networkInterfaces()) {
  const all = Object.values(interfaces).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
  const local = all.find((i) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))

  return (local ?? all[0])?.address
}

export const qrSvg = (text) => {
  const code = qrcode(0, 'M')

  code.addData(text)
  code.make()

  return code.createSvgTag({ cellSize: 5, margin: 3, scalable: true })
}

const same = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

function cookie(req) {
  return (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1]
}

// handle(req, res): the office's own router, called with req.viewOnly set.
export function createPhoneShare({ handle, address = lanAddress }) {
  let server = null
  let token = ''
  let url = ''

  const door = (req, res) => {
    const u = new URL(req.url ?? '/', 'http://phone')
    const given = u.searchParams.get('k')

    if (given !== null) {
      if (!same(given, token)) return void res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('This link has expired. Scan the QR code in the office again.')
      res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` })

      return void res.end()
    }
    if (!same(cookie(req), token)) return void res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Scan the QR code in the office to watch it from your phone.')
    if (req.method !== 'GET' || !ALLOWED.some((re) => re.test(u.pathname))) return void res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not available from the phone')

    req.viewOnly = true
    handle(req, res)
  }

  return {
    status: () => ({ on: Boolean(server), url, qr: server ? qrSvg(url) : '' }),

    async enable(port = 0) {
      if (server) return this.status()

      const host = address()

      if (!host) throw new Error('this computer is not on a network a phone can reach')

      token = randomBytes(18).toString('base64url')
      server = http.createServer(door)
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '0.0.0.0', resolve)
      })
      url = `http://${host}:${server.address().port}/?k=${token}`

      return this.status()
    },

    async disable() {
      if (!server) return this.status()

      const s = server

      server = null
      token = ''
      url = ''
      s.closeAllConnections?.()
      await new Promise((resolve) => s.close(() => resolve()))

      return this.status()
    },
  }
}
