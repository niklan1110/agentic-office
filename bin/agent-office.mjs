#!/usr/bin/env node
// agent-office: start the office for a project, or check why a session does not connect.

import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { readDiscovery, runningServer } from '../server/discovery.mjs'
import { VERSION, createServer, skillSources } from '../server/server.mjs'
import { createCatalog } from '../server/catalog.mjs'

const HELP = `agent-office ${VERSION}

Usage:
  agent-office [start] [options]   start the office for a project (the current directory by default)
  agent-office doctor [options]    check the server, the plugin and the skills, and say what to fix

Options:
  --project <dir>   the project to work on                       (default: the current directory)
  --skills <dir>    a skill collection to pick skills from; repeat for more
                    (also AGENT_OFFICE_SKILLS, separated by "${path.delimiter}")
  --port <n>        the port to try first; the next free one is used if it is taken (default: 7777)
  --strict-port     fail instead of moving to the next free port
  --no-open         do not open the browser
  -v, --version     print the version
  -h, --help        print this help

In Claude Code, install the plugin once:
  /plugin marketplace add niklan1110/agent-office
  /plugin install agent-office@agent-office`

function parse(argv) {
  const opts = { command: 'start', project: process.cwd(), skills: [], port: 7777, strictPort: false, open: true }
  const args = [...argv]

  if (args[0] && !args[0].startsWith('-')) opts.command = args.shift()

  while (args.length) {
    const a = args.shift()
    const value = () => {
      const v = args.shift()
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`)
      return v
    }

    if (a === '--project') opts.project = value()
    else if (a === '--skills') opts.skills.push(value())
    else if (a === '--port') opts.port = Number(value())
    else if (a === '--strict-port') opts.strictPort = true
    else if (a === '--no-open') opts.open = false
    else if (a === '-v' || a === '--version') opts.command = 'version'
    else if (a === '-h' || a === '--help') opts.command = 'help'
    else throw new Error(`unknown option ${a}`)
  }

  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) throw new Error('--port must be a port number')
  opts.project = path.resolve(opts.project)
  opts.skills = [...opts.skills, ...(process.env.AGENT_OFFICE_SKILLS ?? '').split(path.delimiter).filter(Boolean)].map((d) => path.resolve(d))

  return opts
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]

  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  } catch {
    // No browser to open: the URL is printed anyway.
  }
}

async function start(opts) {
  await access(opts.project).catch(() => {
    throw new Error(`no such project folder: ${opts.project}`)
  })

  const already = await runningServer(opts.project)

  if (already) {
    console.log(`The office for this project is already running: ${already.url}`)
    if (opts.open) openBrowser(already.url)

    return
  }

  const office = createServer({ projectDir: opts.project, collections: opts.skills })
  const url = await office.listen({ port: opts.port, strictPort: opts.strictPort })
  const skills = await createCatalog(skillSources(opts.project, opts.skills)).list()

  console.log(`Agent Office ${VERSION}`)
  console.log(`  Office:   ${url}`)
  console.log(`  Project:  ${opts.project}`)
  console.log(`  Skills:   ${skills.length} found${opts.skills.length ? '' : ' (add a collection with --skills <dir>)'}`)
  console.log('  Claude Code sessions in this project with the agent-office plugin connect by themselves.')
  console.log('  Press Ctrl+C to stop.')

  // Say when sessions come and go, so the terminal shows the connection too.
  let last = ''
  setInterval(() => {
    const s = office.hub.status()
    const line = s.sessions.filter((x) => x.connected).map((x) => `${x.match ? '' : 'other project: '}${path.basename(x.project)} (plugin ${x.version || '?'})`).join(', ')

    if (line !== last) console.log(line ? `  Connected: ${line}` : '  No Claude Code session connected.')
    last = line
  }, 2000).unref()

  const stop = async () => {
    await office.close()
    process.exit(0)
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  if (opts.open) openBrowser(url)
}

// What the plugin install in ~/.claude says, for doctor.
async function pluginInstall(home = os.homedir()) {
  const read = async (p) => JSON.parse(await readFile(p, 'utf8').catch(() => '{}'))
  const installed = (await read(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))).plugins ?? {}
  const settings = await read(path.join(home, '.claude', 'settings.json'))
  const find = (name) => Object.entries(installed).filter(([k]) => k.startsWith(name + '@')).flatMap(([k, v]) => v.map((x) => ({ key: k, ...x })))

  return { current: find('agent-office'), old: find('office-bridge'), oldConfig: Object.entries(settings.pluginConfigs ?? {}).filter(([k]) => k.startsWith('office-bridge@')) }
}

async function doctor(opts) {
  let problems = 0
  const ok = (msg) => console.log(`  ok    ${msg}`)
  const bad = (msg, fix) => {
    problems++
    console.log(`  FIX   ${msg}\n        → ${fix}`)
  }

  console.log(`Agent Office ${VERSION} doctor, for ${opts.project}\n`)

  if (Number(process.versions.node.split('.')[0]) >= 20) ok(`Node ${process.versions.node}`)
  else bad(`Node ${process.versions.node} is too old`, 'install Node 20 or newer')

  const server = await runningServer(opts.project)
  const recorded = await readDiscovery(opts.project)

  if (server) ok(`office server running at ${server.url} (version ${server.version})`)
  else if (recorded) bad(`.claude/agent-office/server.json points at ${recorded.url}, but nothing answers there`, 'start the office: npx agent-office (the stale file is replaced)')
  else bad('no office server is running for this project', 'start it in the project folder: npx agent-office')

  if (server) {
    try {
      const status = await (await fetch(new URL('/api/status', server.url))).json()
      const here = status.sessions.filter((s) => s.connected && s.match)
      const elsewhere = status.sessions.filter((s) => s.connected && !s.match)

      if (here.length) ok(`${here.length} Claude Code session(s) connected: plugin ${here.map((s) => s.version).join(', ')}`)
      else bad('no Claude Code session of this project is connected', 'open Claude Code in this folder (VS Code or `claude`) with the agent-office plugin installed and enabled')
      for (const s of elsewhere) bad(`a session from another project is talking to this server: ${s.project}`, 'remove a fixed officeUrl from that session\'s plugin options, so it finds its own project\'s office')
      for (const s of here.filter((x) => x.version && x.version !== VERSION)) bad(`a session runs plugin ${s.version}, the server is ${VERSION}`, '/plugin update agent-office, then restart that session')
    } catch {
      bad('the server did not answer /api/status', 'restart it')
    }
  }

  const plugin = await pluginInstall()

  if (plugin.current.length) ok(`plugin installed: ${plugin.current.map((p) => `${p.key} ${p.version ?? ''} (${p.scope})`).join('; ')}`)
  else bad('the agent-office plugin is not installed in Claude Code', 'in Claude Code: /plugin marketplace add niklan1110/agent-office, then /plugin install agent-office@agent-office')
  for (const key of new Set(plugin.old.map((p) => p.key))) {
    const installs = plugin.old.filter((p) => p.key === key).map((p) => `${p.version ?? '?'} (${p.scope}${p.projectPath ? ` ${p.projectPath}` : ''})`)

    bad(`the old office-bridge plugin is installed ${installs.length}×: ${installs.join('; ')}`, `uninstall it in each scope, so old code does not report your sessions: /plugin uninstall ${key}`)
  }
  for (const [k, v] of plugin.oldConfig) if (v?.options?.officeUrl) bad(`${k} has a fixed officeUrl ${v.options.officeUrl}`, 'the new plugin needs no URL; remove the old plugin and its settings')

  const skills = await createCatalog(skillSources(opts.project, opts.skills)).list()
  const kinds = Object.groupBy ? Object.groupBy(skills, (s) => s.source) : {}

  if (skills.length) ok(`${skills.length} skills: ${Object.entries(kinds).map(([k, v]) => `${v.length} ${k}`).join(', ')}`)
  else bad('no skills found', 'point at a collection: npx agent-office --skills <dir with skill folders>')

  console.log(problems ? `\n${problems} thing(s) to fix.` : '\nEverything looks right.')
  process.exitCode = problems ? 1 : 0
}

try {
  const opts = parse(process.argv.slice(2))

  if (opts.command === 'help') console.log(HELP)
  else if (opts.command === 'version') console.log(VERSION)
  else if (opts.command === 'start') await start(opts)
  else if (opts.command === 'doctor') await doctor(opts)
  else throw new Error(`unknown command ${opts.command}`)
} catch (err) {
  console.error(`agent-office: ${err.message}\n\nRun agent-office --help for usage.`)
  process.exitCode = 2
}
