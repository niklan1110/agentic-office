// Where things are in the office and how agents walk between them: the corridor graph,
// the spots (desks, seats, kitchen, lounge) and the errands. Pure data, no three.js.
// Split out of office-v3.js, otherwise unchanged.

export const PI = Math.PI, T = 2.8;
export const COLS = [-36, -23, -10, 3, 16];
export const ZA = -3.5, ZB = 10.5, ZC = -9.5, ZM = 6.6;
export const DESKS = { developer: [0, 'A'], reviewer: [1, 'A'], qa: [2, 'A'], researcher: [3, 'A'], designer: [4, 'A'], devops: [0, 'B'], writer: [1, 'B'], analyst: [2, 'B'], security: [3, 'B'] };

export const NODES = {
  cL: [-46, ZC], c1: [-36, ZC], cMgr: [-34, ZC], c2: [-23, ZC], cConf: [-12.5, ZC], c3: [-10, ZC], c4: [3, ZC], cKit: [15, ZC], c5: [16, ZC], cR: [25.5, ZC], cLounge: [33, ZC],
  mL: [-46, ZM], m1: [-36, ZM], m2: [-23, ZM], m3: [-10, ZM], m4: [3, ZM], m5: [16, ZM], mR: [25.5, ZM], mX: [35, ZM],
};
const chain = ks => ks.slice(1).map((k, i) => [ks[i], k]);
export const EDGES = [...chain(['cL', 'c1', 'cMgr', 'c2', 'cConf', 'c3', 'c4', 'cKit', 'c5', 'cR', 'cLounge']), ...chain(['mL', 'm1', 'm2', 'm3', 'm4', 'm5', 'mR', 'mX']), ['cL', 'mL'], ['cR', 'mR']];

export const SPOTS = {};
const S = (id, node, path, rot, extra = {}) => (SPOTS[id] = { node, path, p: path[path.length - 1], rot, ...extra });
Object.entries(DESKS).forEach(([id, [c, row]]) => { const x = COLS[c]; row === 'A' ? S('home_' + id, 'c' + (c + 1), [[x, ZA]], 0) : S('home_' + id, 'm' + (c + 1), [[x, ZB]], 0); });
S('home_manager', 'cMgr', [[-34, -25.5], [-42, -25.5]], 0);
const MGR = [-13, -27];
S('stage', 'cConf', [[-12.5, -14.5], MGR], 0);
const seat = (id, x, z) => S('seat_' + id, 'cConf', [[-12.5, -14.5], [x, z]], Math.atan2(MGR[0] - x, MGR[1] - z));
[-26, -19.5, -13, -6.5, 0].forEach((x, i) => seat(['developer', 'reviewer', 'qa', 'researcher', 'designer'][i], x, -21));
[-22.75, -16.25, -9.75, -3.25].forEach((x, i) => seat(['devops', 'writer', 'analyst', 'security'][i], x, -16.5));
S('coffee', 'cKit', [[15, -15], [12, -24.8]], PI, { item: 'coffee', label: 'Making coffee', wait: 3.2, anim: 'work' });
S('fridge', 'cKit', [[15, -15], [6.8, -24.8]], PI, { item: 'can', label: 'Raiding the fridge', wait: 2.4, anim: 'idle' });
S('cooler', 'cKit', [[15, -15], [24.3, -25.3]], PI, { item: 'water', label: 'Getting a glass of water', wait: 2.6, anim: 'idle' });
S('vending', 'cLounge', [[33, -15], [33.5, -17]], PI / 2, { item: 'snack', label: 'At the vending machine', wait: 2.6, anim: 'work' });
S('sofaL', 'cLounge', [[33, -15], [27.8, -15], [27.8, -25], [30, -25]], 0, { label: 'Resting on the sofa', wait: 7, anim: 'idle' });
S('sofaR', 'cLounge', [[33, -15], [27.8, -15], [27.8, -25], [36, -25]], 0, { label: 'Resting on the sofa', wait: 7, anim: 'idle' });
S('copier', 'm5', [[16, 8.6]], 0, { item: 'paper', label: 'Printing at the copier', wait: 3.2, anim: 'work' });
S('shelf', 'mX', [[35, 9]], PI / 2, { item: 'book', label: 'Browsing the bookshelf', wait: 3, anim: 'think' });
export const ERRANDS = [['cooler', 3], ['coffee', 3], ['fridge', 1], ['vending', 1], ['sofaL', 1], ['sofaR', 1], ['copier', 1.2], ['shelf', 1]];
export const ITEM_NAMES = { water: 'a glass of water', coffee: 'a coffee', can: 'a soda', snack: 'a snack', paper: 'printouts', book: 'a book' };
