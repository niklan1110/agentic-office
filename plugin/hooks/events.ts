// What the mod tells the office page. The office server validates and clips
// every event again, so this only has to be well formed.

export type OfficeEvent =
  | { type: 'task'; text: string }
  | { type: 'spawn'; agent: string; subagentType: string; label: string; name: string; parent: string }
  | { type: 'tool'; agent: string; tool: string }
  | { type: 'think'; agent: string; model: string }
  | { type: 'usage'; agent: string; model: string; input: number; output: number; cacheRead: number; cacheWrite: number }
  | { type: 'message'; from: string; to: string; text: string }
  | { type: 'done'; agent: string; seconds: number; reason: string }

export type MessageEvent = Extract<OfficeEvent, { type: 'message' }>

export const MAIN = 'main'

// Tools the office shows in other ways: a spawn is a new person, a send is an envelope.
const SHOWN_ELSEWHERE = new Set(['Agent', 'SendMessage'])

export function clip(text: string, max: number): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
}

export function isShown(tool: string): boolean {
  return !SHOWN_ELSEWHERE.has(tool)
}

/** True for an address on this machine: the office server takes nothing else. */
export function isLocal(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)

    return (protocol === 'http:' || protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)
  } catch {
    return false
  }
}

/** A new task from the person: the office calls a meeting for it. */
export function taskEvent(text: string, showText: boolean): OfficeEvent {
  return { type: 'task', text: showText ? clip(text, 200) : '' }
}

// Prompts the person sent (typed, or through the SDK or a bridge), not ones the
// engine or another plugin submitted.
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

export function isFromPerson(origin: { kind: string } | undefined): boolean {
  return origin === undefined || PERSON_ORIGINS.has(origin.kind)
}

export function spawnEvent(
  agent: string,
  subagentType: string,
  name: string | undefined,
  description: string,
  parent: string | undefined,
): OfficeEvent {
  return {
    type: 'spawn',
    agent,
    subagentType: clip(subagentType, 80),
    label: clip(name || description, 60),
    name: clip(name ?? '', 60),
    parent: parent ?? MAIN,
  }
}

export function toolEvent(agent: string | undefined, tool: string): OfficeEvent {
  return { type: 'tool', agent: agent ?? MAIN, tool: clip(tool, 40) }
}

export function thinkEvent(agent: string | undefined, model: string): OfficeEvent {
  return { type: 'think', agent: agent ?? MAIN, model: clip(model, 80) }
}

export type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export function usageEvent(agent: string | undefined, usage: Usage): OfficeEvent {
  return {
    type: 'usage',
    agent: agent ?? MAIN,
    model: clip(usage.model, 80),
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
  }
}

export function messageEvent(from: string | undefined, to: string, text: string, showText: boolean): MessageEvent {
  return { type: 'message', from: from ?? MAIN, to: clip(to, 80), text: showText ? clip(text, 200) : '' }
}

export function doneEvent(agent: string | undefined, durationMs: number, reason: string): OfficeEvent {
  return { type: 'done', agent: agent ?? MAIN, seconds: Math.round(durationMs / 1000), reason }
}
