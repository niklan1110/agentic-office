import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RESULT_MS, STALE_MS, WORK_MS, apply, createState, findRole, roleOfAgent, roleStats, roleStatuses, tokens } from '../public/js/model.js'
import { clip, validate } from '../public/js/protocol.js'
import { ROLE_IDS, roleOf } from '../public/js/roles.js'

const T0 = 1_000_000
const spawn = (agent, subagentType, extra = {}) => ({ type: 'spawn', agent, subagentType, label: '', name: '', parent: 'main', ...extra })
const run = (events) => events.reduce((state, ev) => apply(state, ev), createState())
const status = (state, role, now) => roleStatuses(state, now)[role].status

test('roleOf maps agent types to the ten roles', () => {
  assert.equal(roleOf('office-bridge:qa'), 'qa')
  assert.equal(roleOf('office-bridge:security'), 'security')
  assert.equal(roleOf('Explore'), 'researcher')
  assert.equal(roleOf('Plan'), 'writer')
  assert.equal(roleOf('general-purpose'), 'developer')
  assert.equal(roleOf('office-bridge:engineer'), 'developer') // an earlier name of the role
  assert.equal(roleOf('office-bridge:architect'), 'designer')
  assert.equal(roleOf('someplugin:unknown-thing'), 'developer')
  assert.equal(roleOf('constructor'), 'developer')
  assert.equal(roleOf('manager'), 'developer') // the manager is only the main session
  assert.equal(roleOf(''), 'developer')
  assert.equal(ROLE_IDS.length, 10)
})

test('validate accepts each event type and refuses bad ones', () => {
  assert.equal(validate({ type: 'tool', agent: 'a1', tool: 'Bash' }).value.tool, 'Bash')
  assert.equal(validate({ type: 'task', text: 'Fix the tests\nplease' }).value.text, 'Fix the tests please')
  assert.equal(validate({ type: 'task' }).value.text, '')
  assert.equal(validate({ type: 'nope' }).error, 'unknown type')
  assert.equal(validate({ type: 'tool', agent: 'bad id!', tool: 'Bash' }).error, 'bad agent')
  assert.equal(validate('text').error, 'not an object')
  assert.equal(validate({ type: 'usage', agent: 'main', input: -5, output: 'x' }).value.input, 0)
  assert.equal(validate({ type: 'tool', agent: 'a1', tool: 'Bash', at: 123 }).value.at, 123)
})

test('accepts exactly the events the office-bridge mod sends', () => {
  // These are the shapes mods/office-bridge/hooks/events.ts builds.
  const fromMod = [
    { type: 'task', text: 'Add rate limiting' },
    { type: 'spawn', agent: 'a1', subagentType: 'office-bridge:qa', label: 'qa', name: 'qa', parent: 'main' },
    { type: 'tool', agent: 'main', tool: 'Bash' },
    { type: 'think', agent: 'a1', model: 'claude-sonnet-5-5' },
    { type: 'usage', agent: 'a1', model: 'claude-sonnet-5-5', input: 1000, output: 200, cacheRead: 3000, cacheWrite: 500 },
    { type: 'message', from: 'main', to: 'qa', text: '' },
    { type: 'done', agent: 'a1', seconds: 12, reason: 'answer' },
  ]

  for (const event of fromMod) {
    const checked = validate(event)

    assert.equal(checked.error, undefined, event.type)
    assert.deepEqual({ ...checked.value, at: undefined }, { ...event, at: undefined })
  }
})

test('clip strips control characters and cuts length', () => {
  assert.equal(clip('a\nb\tc', 10), 'a b c')
  assert.equal(clip('abcdef', 3), 'abc')
  assert.equal(clip(undefined, 3), '')
})

test('everyone starts idle; a tool call makes a role work, then think, then settle', () => {
  const state = run([
    { type: 'task', text: 'Fix it', at: T0 },
    spawn('a1', 'office-bridge:developer', { at: T0 }),
    { type: 'tool', agent: 'a1', tool: 'Edit', at: T0 + 1000 },
  ])

  assert.equal(status(state, 'developer', T0 + 1000), 'working')
  assert.equal(roleStatuses(state, T0 + 1000).developer.tool, 'Edit')
  assert.equal(status(state, 'developer', T0 + 1000 + WORK_MS + 1), 'thinking') // running, between tools
  assert.equal(status(state, 'qa', T0 + 1000), 'idle')
  assert.equal(status(createState(), 'developer', T0), 'idle')
})

test('the task makes the manager think until the turn ends', () => {
  let state = run([{ type: 'task', text: 'Fix it', at: T0 }])

  assert.equal(status(state, 'manager', T0 + 1000), 'thinking')
  assert.equal(state.task.text, 'Fix it')

  state = apply(state, { type: 'done', agent: 'main', seconds: 9, reason: 'answer', at: T0 + 9000 })
  assert.equal(status(state, 'manager', T0 + 9500), 'done')
  assert.equal(status(state, 'manager', T0 + 9000 + RESULT_MS + 1), 'idle')
})

test('a finished agent shows done, a failed one shows error, then both go idle', () => {
  const state = run([
    spawn('a1', 'office-bridge:qa', { at: T0 }),
    spawn('a2', 'office-bridge:reviewer', { at: T0 }),
    { type: 'done', agent: 'a1', seconds: 5, reason: 'answer', at: T0 + 5000 },
    { type: 'done', agent: 'a2', seconds: 5, reason: 'error', at: T0 + 5000 },
  ])

  assert.equal(status(state, 'qa', T0 + 6000), 'done')
  assert.equal(status(state, 'reviewer', T0 + 6000), 'error')
  assert.equal(status(state, 'qa', T0 + 5000 + RESULT_MS + 1), 'idle')
  assert.equal(status(state, 'reviewer', T0 + 5000 + RESULT_MS + 1), 'idle')
})

test('several agents of one role count together; the busiest status wins', () => {
  const state = run([
    spawn('a1', 'office-bridge:developer', { at: T0 }),
    spawn('a2', 'office-bridge:developer', { at: T0 }),
    { type: 'tool', agent: 'a2', tool: 'Bash', at: T0 + 1000 },
    { type: 'done', agent: 'a1', seconds: 1, reason: 'answer', at: T0 + 1000 },
  ])
  const dev = roleStatuses(state, T0 + 1500).developer

  assert.equal(dev.running, 1)
  assert.equal(dev.status, 'working') // working beats the other agent's done

  const both = run([spawn('a1', 'office-bridge:developer', { at: T0 }), spawn('a2', 'office-bridge:developer', { at: T0 })])

  assert.equal(roleStatuses(both, T0 + 100).developer.running, 2)
})

test('an agent that goes silent for a long time stops counting as running', () => {
  const state = run([spawn('a1', 'office-bridge:writer', { at: T0 })])

  assert.equal(status(state, 'writer', T0 + 1000), 'thinking')
  assert.equal(status(state, 'writer', T0 + STALE_MS + 1), 'idle')
})

test('an unknown agent id is picked up as a developer; main is the manager', () => {
  const state = run([{ type: 'tool', agent: 'ghost', tool: 'Read', at: T0 }])

  assert.equal(status(state, 'developer', T0 + 100), 'working')
  assert.equal(roleOfAgent(state, 'main'), 'manager')
  assert.equal(roleOfAgent(state, 'ghost'), 'developer')
  assert.equal(roleOfAgent(state, 'nobody'), undefined)
})

test('a message names its recipient by name, label, id or role', () => {
  const state = run([
    spawn('a1', 'office-bridge:qa', { name: 'qa-bot', label: 'Test the limiter' }),
    { type: 'message', from: 'a1', to: 'developer', text: 'Burst case fails', at: T0 },
  ])

  assert.equal(findRole(state, 'qa-bot'), 'qa')
  assert.equal(findRole(state, 'Test the limiter'), 'qa')
  assert.equal(findRole(state, 'a1'), 'qa')
  assert.equal(findRole(state, 'manager'), 'manager')
  assert.equal(findRole(state, 'security'), 'security')
  assert.equal(findRole(state, 'nobody'), undefined)
  assert.equal(state.lastMessage.text, 'Burst case fails')
  assert.equal(state.lastMessage.from, 'a1')
})

test('stats add up per role across agents', () => {
  const state = run([
    spawn('a1', 'office-bridge:qa'),
    spawn('a2', 'office-bridge:qa'),
    { type: 'tool', agent: 'a1', tool: 'Bash' },
    { type: 'tool', agent: 'a2', tool: 'Bash' },
    { type: 'usage', agent: 'a1', model: 'm', input: 1000, output: 200, cacheRead: 3000, cacheWrite: 500 },
  ])
  const qa = roleStats(state).qa

  assert.deepEqual(qa, { agents: 2, tools: 2, input: 4500, output: 200 })
})

test('tokens formats counts for people', () => {
  assert.equal(tokens(999), '999')
  assert.equal(tokens(1234), '1.2k')
  assert.equal(tokens(1234567), '1.2M')
})
