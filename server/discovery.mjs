// Discovery: how a Claude Code session finds the office server of its project with
// nothing configured. The running server writes .claude/agent-office/server.json in
// the project; the plugin reads it on each heartbeat. The file goes when the server
// stops; a file left by a server that crashed is noticed because nobody answers there.

import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import { writePrivate } from './auth.mjs'

export const DISCOVERY_FILE = path.join('.claude', 'agent-office', 'server.json')

export const discoveryPath = (projectDir) => path.join(projectDir, DISCOVERY_FILE)

export async function writeDiscovery(projectDir, info) {
  const file = discoveryPath(projectDir)

  await writePrivate(file, JSON.stringify({ ...info, pid: process.pid }, null, 2) + '\n')

  return file
}

export async function readDiscovery(projectDir) {
  try {
    return JSON.parse(await readFile(discoveryPath(projectDir), 'utf8'))
  } catch {
    return null
  }
}

// Removes the file only if this process wrote it, so stopping a second server keeps the first one's.
export async function removeDiscovery(projectDir) {
  const info = await readDiscovery(projectDir)

  if (info && info.pid === process.pid) await rm(discoveryPath(projectDir), { force: true })
}

// The office server already running for this project, if one answers at its recorded URL.
export async function runningServer(projectDir, fetchImpl = fetch) {
  const info = await readDiscovery(projectDir)

  if (!info?.url) return null

  try {
    const res = await fetchImpl(new URL('/api/hello', info.url), { signal: AbortSignal.timeout(1500) })
    const hello = res.ok ? await res.json() : null

    return hello?.app === 'agent-office' ? { ...info, ...hello } : null
  } catch {
    return null
  }
}
