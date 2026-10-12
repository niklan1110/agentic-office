import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGraph, routeAt, routeBetween } from '../public/js/nav.js'
import { LAYOUTS, officeMap } from '../public/js/office-map.js'
import { ROLE_IDS } from '../public/js/roles.js'

const inside = ([x0, z0, x1, z1], x, z, pad = 0.35) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad

for (const { id } of LAYOUTS) {
  test(`${id}: every role has a desk and a home, and every spot reaches every other`, () => {
    const map = officeMap(id)
    const graph = buildGraph(map.NODES, map.EDGES)

    for (const role of ROLE_IDS) assert.ok(map.SPOTS[`home_${role}`], `home_${role}`)
    assert.equal(Object.keys(map.DESKS).length, 9)

    const spots = Object.keys(map.SPOTS)

    for (const a of spots) for (const b of spots) assert.ok(routeBetween(map.SPOTS, map.NODES, graph, a, b).len >= 0)
  })

  test(`${id}: no route walks through a desk, table, wall or partition`, () => {
    const map = officeMap(id)
    const graph = buildGraph(map.NODES, map.EDGES)
    const spots = Object.keys(map.SPOTS)

    for (const a of spots) {
      for (const b of spots) {
        const route = routeBetween(map.SPOTS, map.NODES, graph, a, b)

        for (let s = 0; s <= route.len; s += 0.25) {
          const { x, z } = routeAt(route, s)
          const hit = map.obstacles.find((r) => inside(r, x, z))

          assert.equal(hit, undefined, `${a} → ${b} walks through [${hit}] at (${x.toFixed(1)}, ${z.toFixed(1)})`)
        }
      }
    }
  })
}

test('an unknown layout is the open plan', () => {
  assert.equal(officeMap('nope').layout, 'open')
})

test('the back rooms fill the back wall in a different order in every layout', async () => {
  const { ROOMS } = await import('../public/js/office-map.js')
  const orders = new Set()

  for (const { id } of LAYOUTS) {
    const { rooms } = officeMap(id)
    let x = -50.5

    assert.deepEqual([...rooms.order].sort(), Object.keys(ROOMS).sort(), `${id} has every room once`)
    for (const room of rooms.order) {
      assert.equal(ROOMS[room].x0 + rooms.shift[room], x, `${id}: ${room} starts where the last one ended`)
      x += ROOMS[room].w
    }
    assert.equal(x, 40, `${id}: the rooms fill the wall`)
    orders.add(rooms.order.join())
  }

  assert.equal(orders.size, LAYOUTS.length)
})
