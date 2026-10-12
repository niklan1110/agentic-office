// The offices running on this computer, one file each in ~/.agent-office/offices/,
// so any office can list all of them (the Offices page). An office adds its file
// when it starts and removes it when it stops; a file left by a crashed office is
// dropped the next time someone lists them.

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const officesDir = (home = process.env.AGENT_OFFICE_HOME ?? path.join(os.homedir(), '.agent-office')) => path.join(home, 'offices')

const fileFor = (dir, project) => path.join(dir, createHash('sha256').update(project.toLowerCase()).digest('hex').slice(0, 16) + '.json')

export async function register(dir, info) {
  await mkdir(dir, { recursive: true })
  await writeFile(fileFor(dir, info.project), JSON.stringify({ ...info, pid: process.pid }, null, 2) + '\n')
}

export async function unregister(dir, project) {
  const file = fileFor(dir, project)

  try {
    if (JSON.parse(await readFile(file, 'utf8')).pid === process.pid) await rm(file, { force: true })
  } catch {
    // Already gone.
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)

    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// Every registered office with its live summary; offices that do not answer are left out.
export async function listOffices(dir, fetchImpl = fetch) {
  let names = []

  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }

  const offices = await Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, name)
      let info

      try {
        info = JSON.parse(await readFile(file, 'utf8'))
      } catch {
        return null
      }

      if (!alive(info.pid)) {
        await rm(file, { force: true })

        return null
      }

      try {
        const res = await fetchImpl(new URL('/api/summary', info.url), { signal: AbortSignal.timeout(1500) })

        return res.ok ? { ...(await res.json()), url: info.url } : null
      } catch {
        return null
      }
    }),
  )

  return offices.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
}
