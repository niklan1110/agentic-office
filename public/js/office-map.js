// Where things are in the office and how agents walk between them, per layout: the
// desks, the corridor graph, the spots (desks, meeting seats, kitchen, lounge), the
// errands, and the furniture to walk around. Pure data, no three.js, so Node tests
// every route of every layout.
//
// Every layout keeps the rooms along the back wall (manager, conference, kitchen,
// lounge) and the corridor in front of them; a layout arranges the floor below:
// the desks, the partitions or walls, the lower aisle, and where the copier goes.

export const PI = Math.PI, T = 2.8;
export const COLS = [-36, -23, -10, 3, 16];
export const ZC = -9.5; // the corridor along the back rooms
const DESK_W = 9.5, DESK_D = 4, SEAT = 4.3; // a desk, and how far its chair is from the desk's middle

export const LAYOUTS = Object.freeze([
  { id: 'open', name: 'Open plan', blurb: 'Two rows of desks in one big room.' },
  { id: 'pairs', name: 'Pairs', blurb: 'Desks pushed together in twos, partners face to face.' },
  { id: 'cubicles', name: 'Cubicle farm', blurb: 'Grey walled cubicles in rows. Very Matrix.' },
  { id: 'offices', name: 'Private offices', blurb: 'Everyone in a glass-walled room of their own.' },
  { id: 'pods', name: 'Round tables', blurb: 'Pods of three around shared round tables.' },
  { id: 'bench', name: 'Long table', blurb: 'One long startup bench, workers on both sides.' },
])
export const layoutById = (id) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]

// A desk (or a seat at a table) at x, z turned by ry; the chair is SEAT in front of it.
// The rooms along the back wall, as they stand in the original office: left edge and width.
// Glass-walled rooms need glass where they meet a neighbour.
export const ROOMS = Object.freeze({
  manager: { x0: -50.5, w: 20.5, glazed: true },
  conference: { x0: -30, w: 34, glazed: true },
  kitchen: { x0: 4, w: 22, glazed: false },
  lounge: { x0: 26, w: 14, glazed: false },
})
const ROOM_ORDER = {
  open: ['manager', 'conference', 'kitchen', 'lounge'],
  pairs: ['kitchen', 'conference', 'lounge', 'manager'],
  cubicles: ['manager', 'kitchen', 'conference', 'lounge'],
  offices: ['lounge', 'kitchen', 'conference', 'manager'],
  pods: ['conference', 'lounge', 'manager', 'kitchen'],
  bench: ['lounge', 'manager', 'conference', 'kitchen'],
}

// Where each room goes in a given order: how far it moves along x, and where glass walls stand.
export function placeRooms(order) {
  const shift = {}
  const glassAt = []
  let x = -50.5

  order.forEach((id, i) => {
    if (i > 0 && (ROOMS[id].glazed || ROOMS[order[i - 1]].glazed)) glassAt.push(x)
    shift[id] = x - ROOMS[id].x0
    x += ROOMS[id].w
  })
  if (ROOMS[order.at(-1)].glazed) glassAt.push(x)

  return { order, shift, glassAt }
}

const desk = (id, x, z, ry = 0, kind = 'desk') => ({ id, x, z, ry, kind, seat: [x - Math.sin(ry) * SEAT, z - Math.cos(ry) * SEAT] })

// Rectangles agents must not walk through: [x0, z0, x1, z1].
const rectOf = (d) => (Math.abs(Math.sin(d.ry)) > .5
  ? [d.x - DESK_D / 2, d.z - DESK_W / 2, d.x + DESK_D / 2, d.z + DESK_W / 2]
  : [d.x - DESK_W / 2, d.z - DESK_D / 2, d.x + DESK_W / 2, d.z + DESK_D / 2])
const wall = (x0, z0, x1, z1, t = .3) => [Math.min(x0, x1) - t / 2, Math.min(z0, z1) - t / 2, Math.max(x0, x1) + t / 2, Math.max(z0, z1) + t / 2]

function layoutPlan(id) {
  const rowA = ['developer', 'reviewer', 'qa', 'researcher', 'designer']
  const rowB = ['devops', 'writer', 'analyst', 'security']
  const twoRows = () => [...rowA.map((r, i) => desk(r, COLS[i], .8)), ...rowB.map((r, i) => desk(r, COLS[i], 14.8))]

  switch (id) {
    case 'pairs': {
      const pairs = [['developer', 'reviewer'], ['qa', 'researcher'], ['designer', 'devops'], ['writer', 'analyst']]
      return {
        aisle: 12.5, copier: [21, 17.4], boxes: false,
        desks: [...pairs.flatMap(([a, b], i) => [desk(a, COLS[i], .8), desk(b, COLS[i], 4.8, PI)]), desk('security', COLS[4], .8)],
      }
    }
    case 'cubicles': {
      const parts = []
      const row = (xs, z0, z1) => {
        xs.forEach((x) => parts.push([x - 6.5, z0, x - 6.5, z1]))
        parts.push([xs.at(-1) + 6.5, z0, xs.at(-1) + 6.5, z1], [xs[0] - 6.5, z1, xs.at(-1) + 6.5, z1])
      }
      row(COLS, -5.6, 3.4)
      row(COLS.slice(0, 4), 8.4, 17.4)
      return { aisle: 6.6, copier: [16, 13.4], boxes: true, desks: twoRows(), partitions: parts }
    }
    case 'offices': {
      // Glass rooms, door in the middle of the front wall: [x0, z0, x1, z1, gaps along the wall].
      const glass = []
      const room = (x, z0, z1) => {
        glass.push([x - 6.5, z0, x + 6.5, z0, [[5, 8]]], [x - 6.5, z1, x + 6.5, z1])
      }
      COLS.forEach((x) => room(x, -6, 4.6))
      COLS.slice(0, 4).forEach((x) => room(x, 8.4, 19))
      const sides = (xs, z0, z1) => [...xs.map((x) => x - 6.5), xs.at(-1) + 6.5].forEach((x) => glass.push([x, z0, x, z1]))
      sides(COLS, -6, 4.6)
      sides(COLS.slice(0, 4), 8.4, 19)
      return { aisle: 6.6, copier: [16, 13.4], boxes: true, desks: twoRows(), glass, rugs: [...COLS.map((x) => [x, -.7]), ...COLS.slice(0, 4).map((x) => [x, 13.7])] }
    }
    case 'pods': {
      // Three seats around each table: one from the back corridor, two from the aisle.
      const pods = [[-34, ['developer', 'reviewer', 'qa']], [-12, ['researcher', 'designer', 'writer']], [10, ['devops', 'analyst', 'security']]]
      const z = 3.5, r = 3.4 // table centre z and how far a laptop sits from the centre
      return {
        aisle: 13.5, copier: [21, 17.4], boxes: false,
        tables: pods.map(([x]) => [x, z]),
        desks: pods.flatMap(([x, ids]) => [
          { ...desk(ids[0], x, z - r, 0, 'laptop'), seat: [x, z - r - 2.6] },
          { ...desk(ids[1], x - 2.77, z + 1.6, PI - 1.05, 'laptop'), seat: [x - 5, z + 2.9] },
          { ...desk(ids[2], x + 2.77, z + 1.6, PI + 1.05, 'laptop'), seat: [x + 5, z + 2.9] },
        ]),
      }
    }
    case 'bench': {
      const north = rowA.map((r, i) => desk(r, -38 + i * 11, 1, 0, 'bare'))
      const south = rowB.map((r, i) => desk(r, -32.5 + i * 11, 5, PI, 'bare'))
      return { aisle: 12, copier: [21, 17.4], boxes: false, bench: [-44, -1, 12, 7], desks: [...north, ...south] }
    }
    default:
      return { aisle: 6.6, copier: [16, 13.4], boxes: true, desks: twoRows() }
  }
}

// Everything the office and its routes need for one layout.
export function officeMap(layoutId = 'open') {
  const plan = layoutPlan(layoutById(layoutId).id)
  const rooms = placeRooms(ROOM_ORDER[layoutById(layoutId).id])
  const mv = (room, pts) => pts.map(([x, z]) => [x + rooms.shift[room], z]) // a room's points, moved with it
  const dx = rooms.shift
  const Z = plan.aisle
  const NODES = {
    cL: [-46, ZC], cMgr: [-34 + dx.manager, ZC], cConf: [-12.5 + dx.conference, ZC], cKit: [15 + dx.kitchen, ZC], cR: [25.5, ZC], cLounge: [33 + dx.lounge, ZC],
    mL: [-46, Z], mR: [25.5, Z], mX: [35, Z],
  }
  // A corridor node at x, made on demand: c@x on the back corridor, m@x on the aisle.
  const at = (row, x) => {
    const key = `${row}@${Math.round(x * 10) / 10}`
    NODES[key] ??= [x, row === 'c' ? ZC : Z]
    return key
  }

  const SPOTS = {}
  const S = (id, node, path, rot, extra = {}) => (SPOTS[id] = { node, path, p: path[path.length - 1], rot, ...extra })
  const DESKS = {}

  // Desks: a chair in front of the back corridor is reached from it; the rest from the aisle.
  for (const d of plan.desks) {
    DESKS[d.id] = d
    const [sx, sz] = d.seat
    const fromBack = sz < (ZC + Z) / 2
    const rot = Math.atan2(d.x - sx, d.z - sz)
    S('home_' + d.id, at(fromBack ? 'c' : 'm', sx), [[sx, sz]], rot)
  }

  // The rooms along the back wall: the same in every layout.
  S('home_manager', 'cMgr', mv('manager', [[-34, -25.5], [-42, -25.5]]), 0)
  const MGR = [-13, -27]
  S('stage', 'cConf', mv('conference', [[-12.5, -14.5], MGR]), 0)
  const seat = (id, x, z) => S('seat_' + id, 'cConf', mv('conference', [[-12.5, -14.5], [x, z]]), Math.atan2(MGR[0] - x, MGR[1] - z))
  ;[-26, -19.5, -13, -6.5, 0].forEach((x, i) => seat(['developer', 'reviewer', 'qa', 'researcher', 'designer'][i], x, -21))
  ;[-22.75, -16.25, -9.75, -3.25].forEach((x, i) => seat(['devops', 'writer', 'analyst', 'security'][i], x, -16.5))
  S('coffee', 'cKit', mv('kitchen', [[15, -15], [12, -24.8]]), PI, { item: 'coffee', label: 'Making coffee', wait: 3.2, anim: 'work' })
  S('fridge', 'cKit', mv('kitchen', [[15, -15], [6.8, -24.8]]), PI, { item: 'can', label: 'Raiding the fridge', wait: 2.4, anim: 'idle' })
  S('cooler', 'cKit', mv('kitchen', [[15, -15], [24.3, -25.3]]), PI, { item: 'water', label: 'Getting a glass of water', wait: 2.6, anim: 'idle' })
  S('vending', 'cLounge', mv('lounge', [[33, -15], [33.5, -17]]), PI / 2, { item: 'snack', label: 'At the vending machine', wait: 2.6, anim: 'work' })
  S('sofaL', 'cLounge', mv('lounge', [[33, -15], [27.8, -15], [27.8, -25], [30, -25]]), 0, { label: 'Resting on the sofa', wait: 7, anim: 'idle' })
  S('sofaR', 'cLounge', mv('lounge', [[33, -15], [27.8, -15], [27.8, -25], [36, -25]]), 0, { label: 'Resting on the sofa', wait: 7, anim: 'idle' })
  const [cx, cz] = plan.copier
  S('copier', at('m', cx), [[cx, cz - 4.8]], 0, { item: 'paper', label: 'Printing at the copier', wait: 3.2, anim: 'work' })
  S('shelf', 'mX', [[35, 9]], PI / 2, { item: 'book', label: 'Browsing the bookshelf', wait: 3, anim: 'think' })

  // The corridors: each row of nodes in order of x, and the two ends joined.
  const chain = (keys) => { const s = [...keys].sort((a, b) => NODES[a][0] - NODES[b][0]); return s.slice(1).map((k, i) => [s[i], k]) }
  const back = Object.keys(NODES).filter((k) => NODES[k][1] === ZC)
  const aisle = Object.keys(NODES).filter((k) => NODES[k][1] === Z)
  const EDGES = [...chain(back), ...chain(aisle), ['cL', 'mL'], ['cR', 'mR']]

  // What to walk around: desks, tables, partitions, glass walls (doors left open), the copier.
  const obstacles = [
    ...plan.desks.filter((d) => d.kind === 'desk').map(rectOf),
    ...(plan.tables ?? []).map(([x, z]) => [x - 4.2, z - 4.2, x + 4.2, z + 4.2]),
    ...(plan.bench ? [plan.bench] : []),
    ...(plan.partitions ?? []).map(([x0, z0, x1, z1]) => wall(x0, z0, x1, z1)),
    ...(plan.glass ?? []).flatMap(([x0, z0, x1, z1, gaps]) => {
      if (!gaps) return [wall(x0, z0, x1, z1)]
      // A wall along x with a door: the parts before and after the gap.
      return gaps.flatMap(([a, b]) => [wall(x0, z0, x0 + a, z1), wall(x0 + b, z0, x1, z1)])
    }),
    [cx - 3.2, cz - 2.1, cx + 3.2, cz + 2.1],
  ]

  return {
    layout: layoutById(layoutId).id, plan, rooms, DESKS, NODES, EDGES, SPOTS, obstacles,
    ERRANDS: [['cooler', 3], ['coffee', 3], ['fridge', 1], ['vending', 1], ['sofaL', 1], ['sofaR', 1], ['copier', 1.2], ['shelf', 1]],
  }
}

export const ITEM_NAMES = { water: 'a glass of water', coffee: 'a coffee', can: 'a soda', snack: 'a snack', paper: 'printouts', book: 'a book' }

// The open plan, as the module's defaults (the character sheet and older callers use these).
const OPEN = officeMap('open')
export const { DESKS, NODES, EDGES, SPOTS, ERRANDS } = OPEN
export const ZA = -3.5, ZB = 10.5, ZM = 6.6
