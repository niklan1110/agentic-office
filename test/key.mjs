// Tests talk to the office as its owner: requests to a test server carry its key.
// fetchWithoutKey is how an outsider (another program on the computer) would call.
const keys = new Map()

export const fetchWithoutKey = globalThis.fetch

globalThis.fetch = (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input)

  for (const [base, key] of keys) {
    if (url.startsWith(base)) {
      const headers = new Headers(init.headers)

      if (!headers.has('x-agent-office-key')) headers.set('x-agent-office-key', key)

      return fetchWithoutKey(input, { ...init, headers })
    }
  }

  return fetchWithoutKey(input, init)
}

export const allow = (base, key) => keys.set(base, key)
