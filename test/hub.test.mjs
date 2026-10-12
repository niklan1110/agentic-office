import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LEASE_MS, MAX_TRIES, QUEUE_LIMIT, cleanTask, createHub, samePath } from '../server/hub.mjs'

function clock(start = 1_000_000) {
  let t = start
  const now = () => t
  now.add = (ms) => { t += ms }
  return now
}

const PROJECT = process.platform === 'win32' ? 'C:\\work\\app' : '/work/app'
const OTHER = process.platform === 'win32' ? 'C:\\work\\other' : '/work/other'

test('paths match however they are spelled', () => {
  assert.ok(samePath('C:\\Work\\App\\', 'c:/work/app', 'win32'))
  assert.ok(!samePath('/work/App', '/work/app', 'linux'))
  assert.ok(samePath('/work/app/', '/work/app', 'linux'))
  assert.ok(!samePath('', '/work/app'))
  assert.ok(!samePath(undefined, '/work/app'))
})

test('a session of the project gets the queued task, once, in order', () => {
  const now = clock()
  const hub = createHub({ project: PROJECT, version: '1.0.0', now })

  hub.queue('first')
  hub.queue('second')

  const a = hub.heartbeat({ session: 's1', project: PROJECT, version: '1.0.0' })

  assert.equal(a.match, true)
  assert.equal(a.task.text, 'first')
  // The same session gets nothing more until it confirms.
  assert.equal(hub.heartbeat({ session: 's1', project: PROJECT }).task, null)
  assert.ok(hub.result(a.task.id, 's1', { ok: true }).task)
  assert.equal(hub.heartbeat({ session: 's1', project: PROJECT }).task.text, 'second')
})

test('a session of another project is seen but gets no task', () => {
  const hub = createHub({ project: PROJECT, version: '1.0.0', now: clock() })

  hub.queue('for the app only')

  const beat = hub.heartbeat({ session: 'x', project: OTHER })

  assert.equal(beat.match, false)
  assert.equal(beat.task, null)
  assert.equal(hub.status().sessions[0].match, false)
  assert.equal(hub.status().connected, 0)
})

test('a lease nobody confirms goes back to the queue, then fails after the last try', () => {
  const now = clock()
  const hub = createHub({ project: PROJECT, version: '1.0.0', now })

  hub.queue('flaky')

  for (let i = 1; i <= MAX_TRIES; i++) {
    assert.equal(hub.heartbeat({ session: `s${i}`, project: PROJECT }).task?.text, 'flaky', `try ${i}`)
    now.add(LEASE_MS + 1)
  }

  const [task] = hub.status().tasks

  assert.equal(task.state, 'failed')
  assert.match(task.reason, /no session confirmed/)
  assert.equal(hub.heartbeat({ session: 'late', project: PROJECT }).task, null)
})

test('a session that cannot start a task fails it with its reason', () => {
  const hub = createHub({ project: PROJECT, version: '1.0.0', now: clock() })
  const { task } = hub.queue('do it')

  hub.heartbeat({ session: 's1', project: PROJECT })
  assert.ok(hub.result(task.id, 'other', { ok: false }).error, 'only the session holding the lease may answer')
  hub.result(task.id, 's1', { ok: false, reason: 'busy' })
  assert.deepEqual([hub.status().tasks[0].state, hub.status().tasks[0].reason], ['failed', 'busy'])
})

test('sessions go quiet: connected only while heartbeats keep coming', () => {
  const now = clock()
  const hub = createHub({ project: PROJECT, version: '1.0.0', now })

  hub.heartbeat({ session: 's1', project: PROJECT, plugin: 'agent-office', version: '0.9.0' })
  assert.equal(hub.status().connected, 1)
  assert.equal(hub.status().sessions[0].version, '0.9.0')
  now.add(9000)
  assert.equal(hub.status().connected, 0)
})

test('the queue has a limit, tasks need text, and text is cleaned', () => {
  const hub = createHub({ project: PROJECT, version: '1.0.0', now: clock() })

  assert.ok(hub.queue('   ').error)
  assert.ok(hub.queue(42).error)
  for (let i = 0; i < QUEUE_LIMIT; i++) assert.ok(hub.queue(`t${i}`).task)
  assert.match(hub.queue('one more').error, /too many/)
  assert.equal(cleanTask('a\u0000b\nc\td'), 'ab\nc\td')
  assert.equal(cleanTask('x'.repeat(5000)).length, 4000)
})

test('a heartbeat without a session id is refused, and changes are announced', () => {
  let changes = 0
  const hub = createHub({ project: PROJECT, version: '1.0.0', now: clock(), onChange: () => changes++ })

  assert.ok(hub.heartbeat({ project: PROJECT }).error)
  hub.heartbeat({ session: 's1', project: PROJECT })
  hub.queue('x')
  assert.ok(changes >= 2)
})
