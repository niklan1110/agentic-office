import { describe, expect, test } from 'claude-code/testing'
import type { AgentSpawnInput, PromptSubmitInput, SessionSendInput } from 'claude-code'

import { localBase, newLink, parseBeat, parseDiscovery, report, statusLine } from '../hooks/connection'
import { clip, doneEvent, isFromPerson, isLocal, isShown, messageEvent, spawnEvent, taskEvent, toolEvent, usageEvent } from '../hooks/events'
import { parseTeam, promptFor, roleOfAgent } from '../hooks/roles'
import { isPageTask, teamNote } from '../hooks/tasks'

const USAGE = {
  model: 'claude-sonnet-5-5',
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 3000,
  cache_creation_input_tokens: 500,
}

const SPAWN: AgentSpawnInput = {
  tool_use_id: 'toolu_1', prompt: 'build the login form', description: 'Login form',
  subagentType: 'agent-office:ada', provider: { plugin: 'agent-office', tier: 'user' }, parentModel: 'claude-opus-5-5',
  background: false, fork: false,
}

describe('events', () => {
  test('a spawn is labelled by name, then by description, and parented to main by default', () => {
    expect(spawnEvent('a1', 'agent-office:qa', 'qa', 'Test it', undefined)).toEqual({
      type: 'spawn', agent: 'a1', subagentType: 'agent-office:qa', label: 'qa', name: 'qa', parent: 'main',
    })
    expect(spawnEvent('a2', 'Explore', undefined, 'Find the loader', 'a1')).toMatchObject({
      label: 'Find the loader', name: '', parent: 'a1',
    })
  })

  test('the main loop has no agent id and is called main', () => {
    expect(toolEvent(undefined, 'Bash')).toEqual({ type: 'tool', agent: 'main', tool: 'Bash' })
    expect(doneEvent(undefined, 12_400, 'answer')).toEqual({ type: 'done', agent: 'main', seconds: 12, reason: 'answer' })
  })

  test('usage keeps the four counts', () => {
    expect(usageEvent('a1', USAGE)).toEqual({
      type: 'usage', agent: 'a1', model: 'claude-sonnet-5-5', input: 1000, output: 200, cacheRead: 3000, cacheWrite: 500,
    })
  })

  test('message text is cut, cleaned, and left out when hidden', () => {
    expect(messageEvent('a1', 'qa', 'line one\nline two', true).text).toBe('line one line two')
    expect(messageEvent('a1', 'qa', 'x'.repeat(500), true).text).toHaveLength(200)
    expect(messageEvent('a1', 'qa', 'secret', false).text).toBe('')
    expect(messageEvent(undefined, 'qa', 'hi', true)).toMatchObject({ from: 'main', to: 'qa' })
  })

  test('the Agent and SendMessage tools are shown as people and envelopes, not as tool use', () => {
    expect(isShown('Agent')).toBe(false)
    expect(isShown('SendMessage')).toBe(false)
    expect(isShown('Edit')).toBe(true)
  })

  test('only local addresses may receive events', () => {
    expect(isLocal('http://127.0.0.1:7777/event')).toBe(true)
    expect(isLocal('http://localhost:9000/event')).toBe(true)
    expect(isLocal('http://example.com/event')).toBe(false)
    expect(isLocal('http://127.0.0.1.evil.test/event')).toBe(false)
    expect(isLocal('ftp://127.0.0.1/event')).toBe(false)
    expect(isLocal('not a url')).toBe(false)
  })

  test('clip removes control characters', () => {
    expect(clip('a\u0000b\tc', 10)).toBe('a b c')
  })
})

describe('roles', () => {
  test('no team file, a broken one, or one never launched means no team', () => {
    expect(parseTeam(undefined)).toBeUndefined()
    expect(parseTeam('not json')).toBeUndefined()
    expect(parseTeam(JSON.stringify({ agents: [] }))).toBeUndefined()
  })

  test('a launched team: each agent with its id, character, model and clean skills', () => {
    const team = parseTeam(JSON.stringify({
      launchedAt: 5,
      agents: [
        { id: 'ada', name: 'Ada', character: 'developer', description: 'Builds the front end.', model: 'opus', skills: ['react-patterns', 'bad/../name'] },
        { id: 'Not An Id', name: 'x' },
        { id: 'mo', name: 'Mo', character: 'nope', model: 'gpt', skills: [] },
      ],
      summaries: { 'react-patterns': 'React idioms.' },
    }))

    expect(team?.launchedAt).toBe(5)
    expect(team?.agents.map((a) => a.id)).toEqual(['ada', 'mo'])
    expect(team?.agents[1]).toMatchObject({ character: 'developer', model: 'inherit' })

    const ada = roleOfAgent(team!.agents[0]!, team!.summaries)

    expect(ada).toMatchObject({ name: 'ada', person: 'Ada', title: 'Developer', model: 'opus', skills: ['react-patterns'] })
    expect(ada.description).toContain('Ada, the Developer. Builds the front end. Skills: react-patterns (React idioms.)')
    expect(promptFor(ada)).toContain('You are Ada, the Developer')
    expect(roleOfAgent(team!.agents[1]!, {})).not.toHaveProperty('model')
  })

  test('the note for a page task names each agent by the type the model calls', () => {
    const team = parseTeam(JSON.stringify({ launchedAt: 1, agents: [{ id: 'mo', name: 'Mo', character: 'writer', skills: [] }] }))!
    const mo = roleOfAgent(team.agents[0]!, {})

    expect(teamNote([{ ...mo, agentType: 'mo' }])).toContain('mo (Mo, Writer; skills: none)')
    expect(teamNote([{ ...mo, agentType: 'agent-office:mo' }])).toContain('agent-office:mo (Mo, Writer')
    expect(teamNote([])).toBe('This task was sent from the Agent Office page.')
  })
})

describe('tasks', () => {
  test('a task carries the prompt, cut and cleaned, or nothing when hidden', () => {
    expect(taskEvent('Fix the\nflaky tests', true)).toEqual({ type: 'task', text: 'Fix the flaky tests' })
    expect(taskEvent('secret plan', false)).toEqual({ type: 'task', text: '' })
    expect((taskEvent('x'.repeat(500), true) as { text: string }).text).toHaveLength(200)
  })

  test('only prompts from the person start a task', () => {
    expect(isFromPerson({ kind: 'composer' })).toBe(true)
    expect(isFromPerson({ kind: 'sdk' })).toBe(true)
    expect(isFromPerson(undefined)).toBe(true)
    expect(isFromPerson({ kind: 'task-notification' })).toBe(false)
    expect(isFromPerson({ kind: 'plugin' })).toBe(false)
  })
})

describe('hooks', () => {
  test('a spawn goes through unchanged', async ($, on) => {
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'claude-sonnet-5-5', agentId: 'agent-1' }))

    const spawned = await $.agent.spawn(SPAWN)

    expect(spawned).toEqual({ model: 'claude-sonnet-5-5', agentId: 'agent-1' })
  })

  test('a refused spawn stays refused', async ($, on) => {
    on('agent.spawn', () => ({ deny: 'no more agents' }))

    expect(await $.agent.spawn(SPAWN)).toEqual({ deny: 'no more agents' })
  })

  test('a message goes through unchanged, with or without text shown', async ($, on) => {
    on('session.send', () => ({ isDelivered: true as const }))

    const send: SessionSendInput = { to: 'qa', text: 'Login form is in.', origin: { kind: 'model' }, agentId: 'agent-1' }

    expect(await $.session.send(send)).toEqual({ isDelivered: true })
  })

  test('a prompt goes through unchanged', async ($, on) => {
    on('prompt.submit', ($, e) => ({ text: e.text }))

    const prompt: PromptSubmitInput = { text: 'Fix the flaky tests', wait: false, origin: { kind: 'composer' } } as PromptSubmitInput

    expect((await $.prompt.submit(prompt)).text).toBe('Fix the flaky tests')
  })

  test('a turn that ends is answered as before', async ($, on) => {
    on('turn.complete', () => ({ text: 'finished' }))

    const done = await $.turn.complete({
      turnId: 't1', agentId: 'agent-1', reason: 'answer', durationMs: 4200, isAborted: false, text: 'finished',
    } as never)

    expect(done.text).toBe('finished')
  })

  test('with an address that is not local, nothing breaks and spawns still go through', { options: { officeUrl: 'http://example.com' } }, async ($, on) => {
    on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'agent-2' }))

    expect((await $.agent.spawn(SPAWN)).agentId).toBe('agent-2')
  })
})

describe('connection', () => {
  test('only a local http address is a server address', () => {
    expect(localBase('http://127.0.0.1:7781/event')).toBe('http://127.0.0.1:7781')
    expect(localBase('http://localhost:7777')).toBe('http://localhost:7777')
    expect(localBase('https://127.0.0.1:7777')).toBeUndefined()
    expect(localBase('http://example.com')).toBeUndefined()
    expect(localBase('not a url')).toBeUndefined()
  })

  test('the discovery file gives the server address, or nothing', () => {
    expect(parseDiscovery(JSON.stringify({ app: 'agent-office', url: 'http://127.0.0.1:7779' }))).toBe('http://127.0.0.1:7779')
    expect(parseDiscovery(JSON.stringify({ app: 'other', url: 'http://127.0.0.1:7779' }))).toBeUndefined()
    expect(parseDiscovery(JSON.stringify({ app: 'agent-office', url: 'http://evil.test' }))).toBeUndefined()
    expect(parseDiscovery('{')).toBeUndefined()
    expect(parseDiscovery(undefined)).toBeUndefined()
  })

  test('a heartbeat answer says whether the session belongs, and may carry a task', () => {
    expect(parseBeat(JSON.stringify({ match: true, task: { id: '3', text: 'Fix it' }, project: '/p', serverVersion: '1.0.0' })))
      .toEqual({ match: true, task: { id: '3', text: 'Fix it' }, project: '/p', serverVersion: '1.0.0' })
    expect(parseBeat(JSON.stringify({ match: false, task: null }))?.task).toBeUndefined()
    expect(parseBeat(JSON.stringify({ match: true, task: { id: 3, text: 'x' } }))?.task).toBeUndefined()
    expect(parseBeat('nope')).toBeUndefined()
    expect(parseBeat('{}')).toBeUndefined()
  })

  test('the status line is quiet without an office and short otherwise', () => {
    const link = newLink()

    expect(statusLine({ ...link, state: 'no-server' })).toBeUndefined()
    expect(statusLine({ ...link, state: 'connected' })).toBe('office: connected')
    expect(statusLine({ ...link, state: 'unreachable' })).toContain('/office')
  })

  test('the /office report names the problem and the fix', () => {
    const link = { ...newLink(), project: '/work/app', version: '1.0.0', session: 's1' }

    expect(report({ ...link, state: 'no-server' }, 0)).toContain('npx agent-office')
    expect(report({ ...link, state: 'other-project', url: 'http://127.0.0.1:7777', serverProject: '/work/other' }, 0)).toContain('/work/other')
    expect(report({ ...link, state: 'connected', url: 'http://127.0.0.1:7777', serverVersion: '0.9.0', lastOkAt: 1000 }, 1500)).toContain('update the older one')
  })
})

describe('tasks from the office page', () => {
  test('only this plugin\'s own-words prompts count as page tasks', () => {
    expect(isPageTask({ kind: 'plugin', name: 'agent-office', asUser: true }, 'agent-office')).toBe(true)
    expect(isPageTask({ kind: 'plugin', name: 'agent-office' }, 'agent-office')).toBe(false)
    expect(isPageTask({ kind: 'plugin', name: 'other', asUser: true }, 'agent-office')).toBe(false)
    expect(isPageTask({ kind: 'composer' }, 'agent-office')).toBe(false)
    expect(isPageTask(undefined, 'agent-office')).toBe(false)
  })
})
