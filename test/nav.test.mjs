import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGraph, makeRoute, routeAt, routeBetween, shortestPath } from '../public/js/nav.js'
import { DESKS, EDGES, ERRANDS, NODES, SPOTS } from '../public/js/office-map.js'
import { ROLE_IDS } from '../public/js/roles.js'

const graph = buildGraph(NODES, EDGES)

test('the map has a desk, a meeting seat and a home spot for every role', () => {
  for (const id of ROLE_IDS) {
    assert.ok(SPOTS[`home_${id}`], `home_${id}`)
    if (id !== 'manager') {
      assert.ok(DESKS[id], `desk for ${id}`)
      assert.ok(SPOTS[`seat_${id}`], `seat_${id}`)
    }
  }

  assert.ok(SPOTS.stage)
  assert.equal(Object.keys(DESKS).length, 9)
})

test('every spot can be reached from every other, over finite routes', () => {
  const ids = Object.keys(SPOTS)

  for (const from of ids) {
    for (const to of ids) {
      const route = routeBetween(SPOTS, NODES, graph, from, to)

      assert.ok(Number.isFinite(route.len), `${from} → ${to}`)
      assert.ok(route.P.length >= 1)
    }
  }
})

test('every errand spot exists and its node is on the corridor graph', () => {
  for (const [id, weight] of ERRANDS) {
    assert.ok(SPOTS[id], id)
    assert.ok(weight > 0)
    assert.ok(NODES[SPOTS[id].node], `${id} node`)
  }
})

test('a route starts at the first spot and ends at the second', () => {
  const route = routeBetween(SPOTS, NODES, graph, 'home_developer', 'seat_qa')
  const start = routeAt(route, 0)
  const end = routeAt(route, route.len)
  const [hx, hz] = SPOTS.home_developer.p
  const [sx, sz] = SPOTS.seat_qa.p

  assert.ok(Math.hypot(start.x - hx, start.z - hz) < 0.01)
  assert.ok(Math.hypot(end.x - sx, end.z - sz) < 0.01)
})

test('a route from a spot to itself goes out to the corridor and back', () => {
  // The app never asks for one: a step that goes to where you already are is skipped.
  const route = routeBetween(SPOTS, NODES, graph, 'home_qa', 'home_qa')
  const start = routeAt(route, 0)
  const end = routeAt(route, route.len)

  assert.ok(route.len > 0)
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 0.01)
})

test('shortestPath finds the short way round and refuses a split graph', () => {
  const nodes = { a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10], z: [99, 99] }
  const edges = [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'c']]
  const g = buildGraph(nodes, [...edges, ['a', 'c']])

  assert.deepEqual(shortestPath(nodes, g, 'a', 'c'), ['a', 'c']) // the diagonal is shorter than 20
  assert.deepEqual(shortestPath(nodes, buildGraph(nodes, edges), 'a', 'c').length, 3)
  assert.throws(() => shortestPath(nodes, g, 'a', 'z'), /no route/)
})

test('routeAt walks along the polyline and reports the leg direction', () => {
  const route = makeRoute([[0, 0], [10, 0], [10, 10]])

  assert.equal(route.len, 20)
  assert.deepEqual(routeAt(route, 5), { x: 5, z: 0, dx: 10, dz: 0 })
  assert.deepEqual(routeAt(route, 15), { x: 10, z: 5, dx: 0, dz: 10 })
  assert.deepEqual(routeAt(route, 99), { x: 10, z: 10, dx: 0, dz: 10 }) // past the end stays at the end
})

test('makeRoute merges points that are on top of each other', () => {
  const route = makeRoute([[0, 0], [0.001, 0], [5, 0]])

  assert.equal(route.P.length, 2)
  assert.equal(route.len, 5)
})
