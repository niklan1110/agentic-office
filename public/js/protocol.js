// The wire format between the Claude Code bridge mod and the office page.
// Each event is one JSON object with a `type`. The server adds `at` (ms since epoch).

export const TYPES = Object.freeze(['task', 'spawn', 'tool', 'think', 'usage', 'message', 'done'])

const AGENT = /^[A-Za-z0-9_.:@-]{1,80}$/
const MAIN = 'main'

// Text without control characters, cut to `max` characters.
export function clip(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max)
}

function count(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1e12 ? Math.floor(value) : 0
}

function agent(value, fallback) {
  const id = typeof value === 'string' ? value : fallback

  return AGENT.test(id ?? '') ? id : null
}

function check(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'not an object' }
  }

  const { type } = input

  if (!TYPES.includes(type)) return { error: 'unknown type' }

  switch (type) {
    case 'task':
      return { value: { type, text: clip(input.text, 200) } }
    case 'spawn': {
      const id = agent(input.agent)

      if (!id) return { error: 'bad agent' }

      return {
        value: {
          type,
          agent: id,
          subagentType: clip(input.subagentType, 80),
          label: clip(input.label, 60),
          name: clip(input.name, 60),
          parent: agent(input.parent, MAIN) ?? MAIN,
        },
      }
    }
    case 'tool': {
      const id = agent(input.agent)

      if (!id) return { error: 'bad agent' }

      return { value: { type, agent: id, tool: clip(input.tool, 40) } }
    }
    case 'think': {
      const id = agent(input.agent)

      if (!id) return { error: 'bad agent' }

      return { value: { type, agent: id, model: clip(input.model, 80) } }
    }
    case 'usage': {
      const id = agent(input.agent)

      if (!id) return { error: 'bad agent' }

      return {
        value: {
          type,
          agent: id,
          model: clip(input.model, 80),
          input: count(input.input),
          output: count(input.output),
          cacheRead: count(input.cacheRead),
          cacheWrite: count(input.cacheWrite),
        },
      }
    }
    case 'message': {
      const from = agent(input.from, MAIN)

      if (!from) return { error: 'bad sender' }

      return { value: { type, from, to: clip(input.to, 80), text: clip(input.text, 200) } }
    }
    case 'done': {
      const id = agent(input.agent)

      if (!id) return { error: 'bad agent' }

      return { value: { type, agent: id, seconds: count(input.seconds), reason: clip(input.reason, 20) } }
    }
    default:
      return { error: 'unknown type' }
  }
}

// { value } with a clean event (and its `at` when the input had one), or { error }.
export function validate(input) {
  const result = check(input)

  if (result.value) result.value.at = Number.isFinite(input.at) ? input.at : undefined

  return result
}
