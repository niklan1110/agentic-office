import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { candidates, findClaude, pluginInstalled } from '../server/claude.mjs'

let tmp

// A fake Claude Code that only answers --version.
async function fake(dir, version) {
  await mkdir(dir, { recursive: true })
  if (process.platform === 'win32') {
    const file = path.join(dir, 'claude.cmd')
    await writeFile(file, `@echo ${version} (Claude Code)\r\n`)
    return file
  }
  const file = path.join(dir, 'claude')
  await writeFile(file, `#!/bin/sh\necho "${version} (Claude Code)"\n`)
  await chmod(file, 0o755)
  return file
}

before(async () => { tmp = await mkdtemp(path.join(os.tmpdir(), 'office-claude-')) })
after(() => rm(tmp, { recursive: true, force: true }))

test('the newest Claude Code wins over an old one on PATH', async () => {
  const old = await fake(path.join(tmp, 'old'), '2.1.71')
  const fresh = await fake(path.join(tmp, 'fresh'), '2.1.296')
  const middle = await fake(path.join(tmp, 'middle'), '2.1.100')

  assert.deepEqual(findClaude([old, fresh, middle]), { bin: fresh, version: '2.1.296' })
  assert.equal(findClaude([]), undefined)
})

test('candidates are found on PATH and in editor extension folders', async () => {
  const home = path.join(tmp, 'home')
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const ext = path.join(home, '.vscode', 'extensions', 'anthropic.claude-code-9.9.9', 'resources', 'native-binary')

  await mkdir(ext, { recursive: true })
  await writeFile(path.join(ext, exe), '')

  const onPath = await fake(path.join(tmp, 'bin'), '2.0.0')
  const found = candidates(home, { PATH: path.dirname(onPath) })

  assert.ok(found.includes(path.join(ext, exe)))
  assert.ok(found.includes(onPath))
})

test('the plugin counts as installed when Claude Code has a record of it', async () => {
  const home = path.join(tmp, 'h2')

  assert.equal(await pluginInstalled(home), false)
  await mkdir(path.join(home, '.claude', 'plugins'), { recursive: true })
  await writeFile(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'agent-office@agent-office': [{}] } }))
  assert.equal(await pluginInstalled(home), true)
})
