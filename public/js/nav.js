// Walking routes over the office's corridor graph: spot → corridor → spot.
// Pure arithmetic (no three.js), so Node can test it against the real map.

export function buildGraph(nodes, edges) {
  const adj = {}

  for (const key of Object.keys(nodes)) adj[key] = []

  for (const [a, b] of edges) {
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1])

    adj[a].push([b, d])
    adj[b].push([a, d])
  }

  return adj
}

// Dijkstra: the node keys from `from` to `to`, both included.
export function shortestPath(nodes, adj, from, to) {
  const dist = {}
  const prev = {}
  const open = new Set(Object.keys(nodes))

  for (const key of open) dist[key] = Infinity
  dist[from] = 0

  while (open.size) {
    let current = null

    for (const key of open) if (current === null || dist[key] < dist[current]) current = key
    if (dist[current] === Infinity) break
    open.delete(current)
    if (current === to) break

    for (const [next, d] of adj[current]) {
      if (dist[current] + d < dist[next]) {
        dist[next] = dist[current] + d
        prev[next] = current
      }
    }
  }

  if (dist[to] === Infinity) throw new Error(`no route from ${from} to ${to}`)

  const path = [to]

  while (path[0] !== from) path.unshift(prev[path[0]])

  return path
}

// A polyline with cumulative lengths. Points closer than 0.01 are merged.
export function makeRoute(points) {
  const P = []

  for (const [x, z] of points) {
    const last = P[P.length - 1]

    if (!last || Math.hypot(last[0] - x, last[1] - z) > 0.01) P.push([x, z])
  }

  const L = [0]

  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))

  return { P, L, len: L[L.length - 1] }
}

// Where `s` units along the route you are, and which way the leg you are on points.
export function routeAt(route, s) {
  const { P, L } = route

  if (P.length < 2) return { x: P[0][0], z: P[0][1], dx: 0, dz: 1 }

  let i = 0

  while (i < L.length - 2 && s > L[i + 1]) i++

  const seg = L[i + 1] - L[i]
  const t = seg ? Math.min(1, (s - L[i]) / seg) : 0

  return {
    x: P[i][0] + (P[i + 1][0] - P[i][0]) * t,
    z: P[i][1] + (P[i + 1][1] - P[i][1]) * t,
    dx: P[i + 1][0] - P[i][0],
    dz: P[i + 1][1] - P[i][1],
  }
}

// From the end of one spot's local path, along the corridors, to the end of another's.
export function routeBetween(spots, nodes, adj, from, to) {
  const A = spots[from]
  const Z = spots[to]
  const points = [...A.path].reverse()

  for (const key of shortestPath(nodes, adj, A.node, Z.node)) points.push(nodes[key])
  points.push(...Z.path)

  return makeRoute(points)
}
