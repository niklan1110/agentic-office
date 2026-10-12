// Finding Claude Code on this computer and installing the plugin with it. People
// often have several: an old one on PATH and a newer one inside VS Code, and only a
// current one installs the plugin correctly, so this picks the newest.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const EXE = process.platform === 'win32' ? 'claude.exe' : 'claude'

// Every Claude Code binary we can find: on PATH, in editor extensions, in the native install folders.
export function candidates(home = os.homedir(), env = process.env) {
  const found = new Set()
  const add = (p) => { if (p && existsSync(p)) found.add(path.resolve(p)) }

  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    for (const name of process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude']) add(path.join(dir, name))
  }
  for (const editor of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.vscode-server']) {
    const ext = path.join(home, editor, 'extensions')
    let entries = []
    try { entries = readdirSync(ext).filter((n) => n.startsWith('anthropic.claude-code-')) } catch { /* no such editor */ }
    for (const n of entries) add(path.join(ext, n, 'resources', 'native-binary', EXE))
  }
  add(path.join(home, '.local', 'bin', EXE))
  add(path.join(home, '.claude', 'local', EXE))

  return [...found]
}

const parseVersion = (text) => /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '')?.slice(1).map(Number)
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false }

function run(bin, args, timeout = 120000) {
  // An npm shim on Windows (claude.cmd) runs through cmd.exe; the arguments are our own fixed words.
  const [cmd, argv] = /\.cmd$/i.test(bin) ? ['cmd.exe', ['/d', '/s', '/c', bin, ...args]] : [bin, args]
  const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout, windowsHide: true })

  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

// The newest Claude Code, as { bin, version }, or undefined when there is none.
export function findClaude(list = candidates()) {
  let best

  for (const bin of list) {
    const v = parseVersion(run(bin, ['--version'], 15000).out)

    if (v && (!best || newer(v, best.v))) best = { bin, v }
  }

  return best && { bin: best.bin, version: best.v.join('.') }
}

// Whether the plugin is installed, from Claude Code's own record.
export async function pluginInstalled(home = os.homedir()) {
  try {
    const installed = JSON.parse(await readFile(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')).plugins ?? {}

    return Object.keys(installed).some((k) => k.startsWith('agent-office@'))
  } catch {
    return false
  }
}

// Adds the marketplace (a GitHub repo, or a local folder) and installs the plugin for every project.
export function installPlugin(claude, source, log = console.log) {
  log(`  Using Claude Code ${claude.version} (${claude.bin})`)

  const add = run(claude.bin, ['plugin', 'marketplace', 'add', source])

  if (!add.ok && !/already/i.test(add.out)) return { ok: false, out: add.out }
  if (/already/i.test(add.out)) run(claude.bin, ['plugin', 'marketplace', 'update', 'agent-office'])

  const install = run(claude.bin, ['plugin', 'install', 'agent-office@agent-office', '--scope', 'user'])

  return { ok: install.ok || /already installed/i.test(install.out), out: install.out }
}
