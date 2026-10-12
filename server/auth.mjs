// The office key: a secret per project, so only you reach your office. Listening on
// 127.0.0.1 keeps other computers out; the key keeps out other programs and other
// user accounts on this computer, which can reach 127.0.0.1 too.
//
// The key lives in <project>/.claude/agent-office/key, readable only by you. Your
// Claude Code sessions read it there (the plugin sends it with every request), and
// your browser gets it once from the link the office opens, then keeps it as an
// HttpOnly cookie for this project.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const KEY_HEADER = 'x-agent-office-key'
export const keyPath = (projectDir) => path.join(projectDir, '.claude', 'agent-office', 'key')
export const newKey = () => randomBytes(32).toString('base64url')

// Writes a file only its owner can read (on Windows, files in your profile already are).
export async function writePrivate(file, text) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text, { mode: 0o600 })
  await chmod(file, 0o600).catch(() => {})
}

// The project's key, made on first use and kept, so the browser's cookie survives restarts.
export async function loadKey(projectDir) {
  try {
    const key = (await readFile(keyPath(projectDir), 'utf8')).trim()

    if (/^[\w-]{40,}$/.test(key)) return key
  } catch {
    // None yet.
  }

  const key = newKey()

  await writePrivate(keyPath(projectDir), key + '\n')

  return key
}

// One cookie per project: cookies are shared by every port on 127.0.0.1.
export const cookieName = (projectDir) => 'agent_office_' + createHash('sha256').update(path.resolve(projectDir).toLowerCase()).digest('hex').slice(0, 12)

export function sameKey(given, key) {
  if (typeof given !== 'string' || typeof key !== 'string' || given.length !== key.length) return false

  return timingSafeEqual(Buffer.from(given), Buffer.from(key))
}

// The key a request carries: the plugin's header, or the browser's cookie.
export function keyOf(req, cookie) {
  const header = req.headers[KEY_HEADER]

  if (typeof header === 'string') return header

  return (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === cookie)?.[1]
}

export const LOCKED_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Locked · Agent Office</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#EFE6DA;color:#1F1E1C;font:16px/1.55 system-ui,sans-serif}main{max-width:520px;padding:32px}h1{font-size:22px;margin:0 0 10px}code{background:rgba(0,0,0,.06);padding:2px 6px;border-radius:5px}</style></head>
<body><main><h1>This office is locked to its owner</h1><p>Open it from the link Agent Office printed in your terminal. Or run <code>npx github:niklan1110/agentic-office</code> again in the project folder: it opens the right link for you.</p></main></body></html>`
