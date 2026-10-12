import * as THREE from 'three';
import { softBox } from './agents.js';
import { C, mat, GLOW, B, G, plant, floorTex, floor, glassWall, windowOn, picture, bookshelf, chair, mug, deskPlant } from './office-props.js';
import { PI, T, officeMap } from './office-map.js';
export { COLS, DESKS, NODES, EDGES, SPOTS, ERRANDS, ITEM_NAMES, LAYOUTS, officeMap } from './office-map.js';

// Colours a person can change per office (custom colours): the materials behind them.
export const PAINTABLE = { wall: C.wall, partition: '#8E949B', floor: '#C2B5A2' };


const MUGS = ['#F5F1E8', '#C9563F', '#4F7CAC', '#E0B04A', '#3E9C9C', '#E07A9A', '#8C6BB1'];
const glassMat = new THREE.MeshStandardMaterial({ color: '#DDEFF5', transparent: true, opacity: .4, roughness: .05 });
export function makeItem(type) {
  const g = new THREE.Group(); g.name = 'item_' + type;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (type === 'water') { const m = new THREE.Mesh(softBox(.75, 1.1, .75), glassMat); m.position.y = .55; g.add(m); B(g, .6, .75, .6, mat('#7FC0E8', { transparent: true, opacity: .85 }), 0, .06, 0, false); }
  if (type === 'coffee') { const c = pick(MUGS); B(g, .75, .85, .75, c, 0, 0, 0); B(g, .15, .45, .35, c, .45, .2, 0); B(g, .58, .05, .58, '#5A3622', 0, .82, 0, false); }
  if (type === 'can') { const c = pick(['#C9563F', '#3FAE6A', '#E0B04A']); B(g, .55, 1, .55, c, 0, 0, 0); B(g, .45, .06, .45, '#C8C4BC', 0, 1, 0, false); }
  if (type === 'snack') { B(g, 1, 1.2, .35, pick(['#8C6BB1', '#E07A9A', '#4F7CAC']), 0, 0, 0); B(g, 1.02, .3, .37, '#E0B04A', 0, .45, 0, false); }
  if (type === 'paper') { B(g, 1.5, .4, 1.1, C.paper, 0, 0, 0); B(g, 1.5, .05, 1.1, '#E6E0D2', 0, .2, 0, false); }
  if (type === 'book') { B(g, 1.6, .4, 1.15, pick(['#9C4A3A', '#3F5E73', '#5E7458', '#7B5E8C']), 0, 0, 0); B(g, 1.45, .3, 1.1, C.paper, .05, .05, 0, false); }
  return g;
}

function monitor(g, x, z, ry, w = 3.6, h = 2.3, o = {}) {
  const m = G(g, x, z, PI + ry, o.y ?? T);
  if (!o.noStand) { B(m, 1.3, .15, 1, C.dark, 0, 0, 0); B(m, .35, 1.1, .35, C.dark, 0, .1, 0); }
  const y0 = o.noStand ? 0 : 1;
  B(m, w, h, .3, C.dark, 0, y0, 0); B(m, w - .3, h - .3, .05, GLOW(o.glow || '#CFE0F0', .35), 0, y0 + .15, .17, false);
  (o.stickers || []).forEach((c, i) => B(m, .5, .5, .04, c, -w / 2 + .6 + i * .75, y0 + h - .9 - (i % 2) * .6, -.17, false));
  return m;
}
const keyboard = (g, x = -.4, z = -1.1, keys) => {
  B(g, 3.2, .18, 1.1, '#3A3836', x, T, z);
  if (keys) keys.forEach((c, i) => B(g, .3, .1, .3, c, x - 1.3 + i * .37, T + .17, z, false));
  B(g, .55, .14, .8, '#3A3836', x + 2.2, T, z);
};
const cup = (g, x, z, c) => { B(g, .7, .9, .7, c, x, T, z); ['#C9563F', '#4F7CAC', '#E0B04A'].forEach((pc, i) => { const p = B(g, .12, 1, .12, pc, x - .15 + i * .15, T + .5, z + (i - 1) * .1, false); p.rotation.z = (i - 1) * .2; }); };

// A local point of a group at (x, z) turned by ry, in world coordinates.
const toWorld = (x, z, ry, lx, lz) => new THREE.Vector3(x + lx * Math.cos(ry) + lz * Math.sin(ry), T, z - lx * Math.sin(ry) + lz * Math.cos(ry));

// A laptop on a shared table, for the round-table layout: it faces its chair.
function laptopFor(scene, d) {
  const ry = Math.atan2(d.seat[0] - d.x, d.seat[1] - d.z) + PI;
  const g = G(scene, d.x, d.z, ry, T);
  B(g, 2.4, .15, 1.7, '#3A3836', 0, 0, .2);
  const scr = G(g, 0, 1.05); scr.rotation.x = -.25;
  B(scr, 2.4, 1.6, .12, '#3A3836', 0, .1, 0); B(scr, 2.1, 1.3, .05, GLOW('#CFE0F0', .4), 0, .25, -.07, false);
  mug(g, 1.8, 0, .6, MUGS[(d.id.length * 3) % MUGS.length]);
  B(g, 1.2, .1, 1.5, C.paper, -2, 0, .5, false);
  const slots = [[-1.9, .2], [1.9, -.4]].map(([sx, sz]) => ({ pos: toWorld(d.x, d.z, ry, sx, sz), item: null }));
  return { group: g, slots, idx: 0 };
}

// A desk with its owner's things. kind 'bare': just the things, on a shared bench.
function deskFor(scene, d) {
  if (d.kind === 'laptop') return laptopFor(scene, d);
  const { id, x, z, ry = 0 } = d;
  const g = G(scene, x, z, ry);
  if (d.kind !== 'bare') {
    B(g, 9.5, .5, 4, C.woodL, 0, 2.3, 0);
    [[-4.4, -1.6], [-4.4, 1.6]].forEach(([lx, lz]) => B(g, .4, 2.3, .4, C.dark, lx, 0, lz));
    B(g, 2.6, 2.3, 3.6, '#9A948C', 3.25, 0, 0);
    [.75, 1.55].forEach(y => B(g, 2.2, .08, .1, '#6B665F', 3.25, y, 1.82, false));
  }
  const R = Math.random;
  if (id === 'developer') {
    monitor(g, 1.3, .3, .15, 3.8, 2.3, { stickers: ['#E0B04A', '#3FAE6A', '#E07A9A', '#4C8DF6'] });
    monitor(g, 3.9, .1, .5, 2, 3.1);
    keyboard(g, -.4, -1.1, ['#E0483E', '#E5A93B', '#E0B04A', '#3FAE6A', '#3E9C9C', '#4C8DF6', '#8C6BB1', '#E07A9A']);
    B(g, .9, .6, .75, '#F2C230', .8, T, 1.4); B(g, .55, .55, .55, '#F2C230', .65, T + .55, 1.35); B(g, .3, .12, .25, '#E8833A', .65, T + .75, 1.68, false);
    B(g, .2, .2, .05, C.dark, .5, T + .85, 1.63, false); B(g, .2, .2, .05, C.dark, .8, T + .85, 1.63, false);
    B(g, .5, 1, .5, '#3FAE6A', 4.3, T, 1.5);
  } else if (id === 'reviewer') {
    monitor(g, 1.8, .3, .2);
    keyboard(g);
    B(g, 1.6, 1, 1.2, C.paper, 3.9, T, 1.1); [.3, .65].forEach(y => B(g, 1.62, .08, 1.22, '#C9563F', 3.9, T + y, 1.1, false));
    B(g, 1.6, .5, 1.2, '#EDE6D6', 3.95, T + 1, 1.05).rotation.y = .15;
    B(g, .7, .25, .7, '#C9563F', .3, T, 1.3); B(g, .25, .55, .25, C.woodD, .3, T + .25, 1.3); B(g, .5, .35, .5, C.woodD, .3, T + .8, 1.3);
    B(g, 1.9, .15, 1.4, '#6B665F', 2.2, T, 1.3); B(g, 1.6, .2, 1.1, C.paper, 2.2, T + .15, 1.3, false);
    const pen = B(g, 1.3, .12, .12, '#C9563F', -1, T, 1.1, false); pen.rotation.y = .5;
  } else if (id === 'qa') {
    monitor(g, 1.6, .3, .15, 3.6, 2.3, { stickers: ['#E0483E', '#3FAE6A', '#E0483E'] });
    keyboard(g);
    [3.4, 3.95, 4.5].forEach((px, i) => { const ph = G(g, px, 1, 0, T); ph.rotation.x = -.2; B(ph, .45, 1.15 - i * .1, .12, C.dark, 0, 0, 0); B(ph, .35, 1 - i * .1, .04, GLOW(['#9CC8F0', '#BDE5C3', '#F5D79A'][i], .5), 0, .07, .08, false); });
    const jar = new THREE.Mesh(softBox(1, 1.2, 1), glassMat); jar.position.set(.6, T + .6, 1.3); g.add(jar);
    B(g, 1.05, .2, 1.05, '#C9A15A', .6, T + 1.2, 1.3); B(g, .4, .25, .5, C.dark, .6, T + .1, 1.3, false); B(g, .2, .2, .15, '#E0483E', .6, T + .3, 1.6, false);
    B(g, 1.2, .1, 1.6, C.woodD, 2.1, T, 1.3); B(g, 1, .05, 1.3, C.paper, 2.1, T + .1, 1.35, false);
    [0, 1, 2].forEach(i => B(g, .5, .04, .14, '#3FAE6A', 2.1, T + .15, .9 + i * .35, false));
  } else if (id === 'researcher') {
    monitor(g, 1.6, .3, .15);
    keyboard(g);
    [[3.5, 4], [4.3, 3], [3.9, 5]].forEach(([bx, n], k) => { for (let i = 0; i < n; i++) { const b = B(g, 1.5 + R() * .3, .3, 1.1, ['#9C4A3A', '#3F5E73', '#C9A15A', '#5E7458', '#7B5E8C'][(i + k) % 5], bx, T + i * .3, -.6 + k * .9); b.rotation.y = (R() - .5) * .3; } });
    B(g, 1.8, .1, 1.2, '#3F5E73', .6, T, 1.3); const p1 = B(g, .85, .08, 1.1, C.paper, .2, T + .12, 1.3, false); p1.rotation.z = .12; const p2 = B(g, .85, .08, 1.1, C.paper, 1, T + .12, 1.3, false); p2.rotation.z = -.12;
    B(g, .6, .2, .6, C.woodD, 2.3, T, 1.5); B(g, .15, .5, .15, C.woodD, 2.3, T + .2, 1.5); B(g, 1, 1, 1, '#4F7CAC', 2.3, T + .7, 1.5); B(g, .5, .35, .06, '#5E9A4E', 2.15, T + 1.1, 2.01, false); B(g, .3, .3, .06, '#5E9A4E', 2.5, T + .85, 2.01, false);
  } else if (id === 'designer') {
    monitor(g, 1.7, .3, .12, 4.4, 2.6, { glow: '#F2D6DE' });
    B(g, 2.8, .12, 1.9, C.dark, -.5, T, -1); B(g, 2.4, .03, 1.5, '#3A3836', -.5, T + .12, -1, false); const st = B(g, .12, .12, 1.5, '#E8E2D6', .9, T + .1, -.9, false); st.rotation.y = .3;
    ['#E0483E', '#E5A93B', '#E0B04A', '#3FAE6A', '#4C8DF6', '#8C6BB1'].forEach((c, i) => { const f = G(g, 3.9, 1.8, i * .2 - .5, T + i * .06); B(f, .45, .06, 1.6, c, 0, 0, -.8, false); });
    cup(g, 2.4, 1.4, '#E07A9A');
  } else if (id === 'devops') {
    monitor(g, 1.2, .3, .1, 3.6, 2.3, { glow: '#CFEDE0' });
    keyboard(g);
    B(g, 1.8, 3.2, 2, '#2E2C2B', 3.9, T, .2);
    for (let i = 0; i < 4; i++) { B(g, 1.6, .06, .05, '#4A4845', 3.9, T + .7 * i + .55, 1.22, false); [0, 1, 2].forEach(k => B(g, .14, .14, .05, GLOW(k === 2 && i === 1 ? '#E0B04A' : k ? '#4C8DF6' : '#3FAE6A', 1.2), 3.25 + k * .3, T + .7 * i + .25, 1.23, false)); }
    B(g, 1.3, .7, 1.2, '#E0B04A', .9, T + .1, 1.4); B(g, 1.7, .12, 1.6, '#E0B04A', .9, T, 1.4); B(g, .3, .25, 1.25, '#C99A35', .9, T + .8, 1.4);
    B(g, .12, .12, 2.2, '#4C8DF6', 4.6, T - .1, 1, false).rotation.x = .2;
  } else if (id === 'writer') {
    B(g, 3.2, .8, 1.8, '#8FB8A8', -.3, T, -.9);
    [0, 1, 2].forEach(i => B(g, 2.6, .12, .3, '#2E2C2B', -.3, T + .4 + i * .14, -.4 - i * .35, false));
    B(g, 3.4, .45, .45, '#2E2C2B', -.3, T + .8, -1.5); B(g, 2, 1.1, .06, C.paper, -.3, T + 1.1, -1.55, false);
    ['#9C4A3A', '#3F5E73', '#C9A15A', '#5E7458'].forEach((c, i) => { const nb = B(g, 1.6, .25, 1.2, c, 3.8, T + i * .25, .9); nb.rotation.y = (i % 2 ? .12 : -.1); });
    cup(g, 2.3, 1.3, '#E8E2D6');
    const lamp = G(g, 4.2, -1, 0, T); B(lamp, .9, .2, .9, C.dark, 0, 0, 0); B(lamp, .15, 1.8, .15, C.dark, 0, .2, 0); B(lamp, 1.4, .7, 1, GLOW('#FFD9A0', .7), -.3, 1.9, .2);
    [[1.4, 1.5], [.7, 1.7]].forEach(([px, pz]) => { const b = B(g, .45, .4, .45, C.paper, px, T, pz, false); b.rotation.set(.4, .7, .2); });
    [[5.6, 1.6], [6.1, .9], [5.4, -.5]].forEach(([px, pz]) => { const b = B(g, .5, .45, .5, C.paper, px, 0, pz, false); b.rotation.set(.3, R() * 2, .5); });
  } else if (id === 'analyst') {
    monitor(g, 1, .3, .08);
    monitor(g, 3.8, .2, .4, 2.6, 2);
    keyboard(g);
    B(g, 1, .2, 1.4, '#E8DCC0', .4, T, 1.3); B(g, .8, .05, .35, '#9CB07A', .4, T + .2, .85, false);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) B(g, .18, .05, .18, '#3A3836', .15 + k * .25, T + .2, 1.2 + i * .25, false);
    B(g, 1.6, .05, 1.2, C.paper, 2.4, T, 1.4);
    [[.8, '#4C8DF6'], [.5, '#3FAE6A'], [1, '#E5A93B'], [.65, '#E0483E']].forEach(([l, c], i) => B(g, .22, .05, l, c, 1.95 + i * .32, T + .05, 1.9 - l / 2, false));
  } else if (id === 'security') {
    monitor(g, 1.5, .25, .12, 2.2, 1.6, { glow: '#BDE5C3' });
    monitor(g, 3.7, .1, .35, 2.2, 1.6, { glow: '#BDE5C3' });
    monitor(g, 2.6, .15, .22, 2.2, 1.6, { glow: '#BDE5C3', y: T + 2.75, noStand: true });
    keyboard(g);
    B(g, .8, .7, .45, '#C9A15A', .4, T, 1.4); [-.25, .25].forEach(dx => B(g, .12, .45, .12, '#9C978F', .4 + dx, T + .7, 1.4)); B(g, .62, .12, .12, '#9C978F', .4, T + 1.12, 1.4); B(g, .12, .2, .05, C.dark, .4, T + .25, 1.64, false);
    B(g, .7, .05, 1, '#F5F1E8', 4.3, T, 1.4); B(g, .7, .06, .2, '#4F7CAC', 4.3, T, 1.1, false);
  }
  const slots = [[-4, 1.2], [-3.05, 1.4], [-2.1, 1.15]].map(([sx, sz]) => ({ pos: toWorld(x, z, ry, sx, sz), item: null }));
  return { group: g, slots, idx: 0 };
}

export function buildOffice3(scene, map = officeMap()) {
  const out = { desks: {}, layout: map.layout };
  const plan = map.plan;
  floor(scene, -400, 400, -400, 400, floorTex('#E4DBCD', '#E0D7C8', 4), 40, -.05);
  out.floor = floor(scene, -50.5, 40, -13, 24, floorTex('#C2B5A2', '#BBAD99', 8), 8);
  out.floor.material.userData.paint = 'floor';
  mat(C.wall).userData.paint = 'wall';
  floor(scene, -50.5, -30, -32.5, -13, floorTex('#B3A089', '#AC9982', 8), 8, .01);
  floor(scene, -30, 4, -32.5, -13, floorTex('#A9A898', '#A3A292', 8), 8, .01);
  floor(scene, 4, 26, -32.5, -13, floorTex('#E8DCC6', '#CDBDA1', 12), 8, .01);
  floor(scene, 26, 40, -32.5, -13, floorTex('#C49A6C', '#BB9163', 8, true), 10, .01);

  B(scene, 92.5, 13, 1, C.wall, -5.25, 0, -33); B(scene, 1, 13, 58, C.wall, -51, 0, -4.5);
  B(scene, 92.5, .9, .3, C.base, -5.25, 0, -32.4); B(scene, .3, .9, 57, C.base, -50.4, 0, -4.5);
  B(scene, 92.5, .5, 1.3, C.base, -5.25, 13, -33); B(scene, 1.3, .5, 58, C.base, -51, 13, -4.5);
  B(scene, 20, 4.6, .25, C.woodD, -40.25, 0, -32.4); B(scene, 20, .3, .4, '#6A4A2F', -40.25, 4.6, -32.35);
  B(scene, 34, 13, .15, '#D9C4A6', -13, 0, -32.42);
  windowOn(scene, -38.5, -32.5, 0, 7); windowOn(scene, -25.5, -32.5, 0, 6); windowOn(scene, -.5, -32.5, 0, 6); windowOn(scene, 33, -32.5, 0, 8);
  windowOn(scene, -50.5, -23, PI / 2, 8); windowOn(scene, -50.5, 2, PI / 2, 8);
  picture(scene, -50.3, 4.5, 12, PI / 2, 4.5, 4, mat('#8DA3A6')); picture(scene, -50.3, 5, 18.5, PI / 2, 4, 5, mat('#C99A6B'));
  const cork = G(scene, -50.3, -6.5, PI / 2, 4); B(cork, 6, 4, .3, C.frame, 0, 0, 0); B(cork, 5.5, 3.5, .1, mat('#C69C6D'), 0, .25, .18, false);
  ['#E0B04A', '#F5F1E8', '#4F7CAC', '#E07A9A', '#3FAE6A'].forEach((c, i) => B(cork, 1, 1, .06, mat(c), -1.8 + i * .9, 1.6 + (i % 2) * 1.1, .26, false));

  glassWall(scene, -50.5, -13, -30, -13, [[14.5, 18.5]]);
  glassWall(scene, -30, -13, 4, -13, [[15, 20]]);
  glassWall(scene, -30, -13, -30, -32.5);
  glassWall(scene, 4, -13, 4, -32.5);

  // Manager office
  B(scene, 14, .08, 9, '#93624A', -42, .03, -21.5, false); B(scene, 12.4, .1, 7.4, '#B88563', -42, .04, -21.5, false);
  const md = G(scene, -42, -21);
  B(md, 10, .6, 4.4, C.woodD, 0, 2.5, 0); B(md, 9.6, 2.5, .4, '#6A4A2F', 0, 0, 2); B(md, .5, 2.5, 4, '#6A4A2F', -4.75, 0, 0); B(md, .5, 2.5, 4, '#6A4A2F', 4.75, 0, 0);
  monitor(md, 2.5, -.4, -.25, 3.8, 2.4, { y: 3.1 });
  B(md, 2.6, .55, .6, '#C9A15A', 0, 3.1, 1.75); B(md, 2.2, .3, .05, C.dark, 0, 3.22, 2.06, false);
  B(md, 2, .25, 2.4, C.paper, -1.8, 3.1, -.2); mug(md, -.2, 3.1, -.9, '#F5F1E8');
  B(md, .9, .4, .9, C.dark, -3.6, 3.1, 1.2); B(md, .5, .5, .5, '#C9A15A', -3.6, 3.5, 1.2); B(md, .9, .7, .9, '#C9A15A', -3.6, 4, 1.2);
  B(md, .9, .2, .9, '#C9A15A', -4, 3.1, -1.3); B(md, .2, 2.2, .2, '#C9A15A', -4, 3.3, -1.3); B(md, 1.8, .9, 1.3, GLOW('#FFD9A0', .8), -3.8, 5.2, -1.1);
  chair(scene, -45, -16, PI + .15, '#7A5434'); chair(scene, -39, -16, PI - .15, '#7A5434');
  bookshelf(scene, -46.7, -31.3, 0, 6.5, 9.5);
  const fc = G(scene, -32.5, -30.6); B(fc, 3, 4.6, 3.4, '#9A948C', 0, 0, 0); [1.5, 3].forEach(y => B(fc, 2.6, .08, .1, '#6B665F', 0, y, 1.72, false)); deskPlant(fc, 0, 4.6, 0);
  plant(scene, -48.3, -15.5, 7.5, .9);
  const pl = new THREE.PointLight('#FFC27A', 45, 24, 2); pl.position.set(-41, 7, -21); scene.add(pl);

  // Conference room
  const scr = new THREE.MeshStandardMaterial({ color: '#2B3440', emissive: '#6E87A8', emissiveIntensity: .25, roughness: .4 });
  B(scene, 13.6, 7, .4, C.dark, -13, 3.6, -32.1); B(scene, 12.8, 6.2, .1, scr, -13, 4, -31.85, false);
  const slide = [[-3.5, 8.6, 5, .5, '#F5F1E8'], [-3.8, 7.6, 4.4, .25, '#C8C4BC'], [-3.6, 7, 4.8, .25, '#C8C4BC'], [-3.9, 6.4, 4.2, .25, '#C8C4BC']];
  const slideMats = [];
  slide.forEach(([sx, sy, w, h, c]) => { const m = mat(c, { emissive: c, emissiveIntensity: .2, transparent: true, opacity: 0 }); slideMats.push(m); B(scene, w, h, .05, m, -13 + sx, sy, -31.78, false); });
  [['#E0B04A', 1.8, 5.6], ['#4C8DF6', 2.6, 7.6], ['#3FAE6A', 3.4, 4.8], ['#E07A9A', 4.2, 6.8]].forEach(([c, x, top]) => { const m = mat(c, { emissive: c, emissiveIntensity: .4, transparent: true, opacity: 0 }); slideMats.push(m); B(scene, .6, top - 5, .05, m, -13 + x, 5, -31.78, false); });
  out.screen = scr; out.slideMats = slideMats;
  B(scene, 16, 2.6, 2, C.woodD, -13, 0, -31.3); B(scene, 16.3, .25, 2.3, C.wood, -13, 2.6, -31.3);
  const pitcher = new THREE.Mesh(softBox(.9, 1.6, .9), glassMat); pitcher.position.set(-19, 3.65, -31.2); scene.add(pitcher);
  [-17.8, -17, -16.2].forEach(gx => { const m = new THREE.Mesh(softBox(.55, .8, .55), glassMat); m.position.set(gx, 3.25, -31); scene.add(m); });
  B(scene, 2.4, .35, 2.4, '#3A3836', -6, 2.85, -31.2); B(scene, 1.6, .1, 1.6, '#5E5A55', -6, 3.2, -31.2, false);
  plant(scene, -28, -30.6, 8, .9); plant(scene, 2, -30.6, 7, .85);
  const cl = new THREE.PointLight('#FFD3A0', 30, 26, 2); cl.position.set(-13, 9, -21); scene.add(cl);

  // Kitchen
  const fr = G(scene, 6.8, -30.3); B(fr, 4.8, 11, 4.2, '#E9E6DF', 0, 0, 0); B(fr, 4.8, .12, .2, '#C9C4BA', 0, 7, 2.1, false);
  B(fr, .3, 2.6, .3, '#9C978F', -1.8, 7.7, 2.2); B(fr, .3, 2.6, .3, '#9C978F', -1.8, 3.6, 2.2);
  ['#E0B04A', '#C9563F', '#4F7CAC', '#3FAE6A'].forEach((c, i) => B(fr, .8, .8, .1, c, .2 + (i % 2) * 1.1, 8.8 - Math.floor(i / 2) * 1 - (i % 2) * .3, 2.15, false));
  B(fr, 1.4, 1.8, .06, C.paper, .9, 4.6, 2.12, false);
  const kc = G(scene, 16, -30.5);
  B(kc, 12, 4.2, 4, C.sage, 0, 0, 0); B(kc, 12.4, .45, 4.4, C.woodL, 0, 4.2, .1);
  for (let i = 0; i < 4; i++) { B(kc, .12, 3.6, .1, '#7C8D77', -6 + i * 3 + 3, .3, 2.02, false); B(kc, .9, .15, .15, '#5E5A55', -4.5 + i * 3, 3.3, 2.08, false); }
  const cm = G(kc, -4, .2, 0, 4.65); B(cm, 2.4, 3.4, 2.2, '#2F2D2B', 0, 0, 0); B(cm, 1.3, 1.3, 1, '#7A4B2E', 0, .4, .9); B(cm, .3, .2, .2, GLOW('#E5A93B', 1.2), .7, 2.8, 1.12, false);
  B(kc, 2.2, .7, 1.4, '#8C6B4A', -1.4, 4.65, .6); [['#E8833A', -1.9], ['#C9563F', -1.3], ['#8DB04A', -.8]].forEach(([c, fx]) => B(kc, .55, .55, .55, c, fx, 5.3, .6));
  B(kc, 2.8, .12, 2.2, '#9C9A94', 1.2, 4.6, .3, false); B(kc, .25, 1.6, .25, '#C8C4BC', 1.2, 4.65, -.9); B(kc, .25, .25, 1.1, '#C8C4BC', 1.2, 6.1, -.4);
  MUGS.slice(0, 4).forEach((c, i) => mug(kc, 3.6 + (i % 2) * .9, 4.65 + Math.floor(i / 2) * .85, .7 + (i % 2) * .1, c));
  B(scene, 12, 3.4, .12, '#E3D6BF', 16, 4.65, -32.4);
  [8.2, 10.8].forEach(y => B(scene, 12, .3, 1.6, C.woodD, 16, y, -31.7));
  [[11.5, 8.5, 'jar'], [12.6, 8.5, 'jar'], [14.5, 8.5, 'mug'], [15.4, 8.5, 'mug'], [16.3, 8.5, 'mug'], [19.5, 8.5, 'plant'], [11.8, 11.1, 'book'], [14, 11.1, 'jar'], [17.5, 11.1, 'plant'], [20.5, 11.1, 'jar']].forEach(([sx, sy, k], i) => {
    if (k === 'jar') { const j = new THREE.Mesh(softBox(.9, 1.3, .9), glassMat); j.position.set(sx, sy + .65, -31.6); scene.add(j); B(scene, .7, .6, .7, ['#C9A15A', '#7A4B2E', '#E8E2D6'][i % 3], sx, sy, -31.6, false); B(scene, .95, .2, .95, C.woodD, sx, sy + 1.3, -31.6); }
    if (k === 'mug') mug(scene, sx, sy, -31.5, MUGS[i % MUGS.length]);
    if (k === 'plant') deskPlant(scene, sx, sy, -31.6);
    if (k === 'book') ['#9C4A3A', '#3F5E73', '#C9A15A'].forEach((c, b) => B(scene, .4, 1.6, 1.2, c, sx + b * .45, sy, -31.6, false));
  });
  const wc = G(scene, 24.3, -30.2);
  B(wc, 2.6, 5.2, 2.6, '#EFEDE8', 0, 0, 0);
  const jug = new THREE.Mesh(softBox(2.1, 3.2, 2.1), new THREE.MeshStandardMaterial({ color: '#86BFEA', transparent: true, opacity: .7, roughness: .1 })); jug.position.set(0, 6.8, 0); jug.castShadow = true; wc.add(jug);
  B(wc, .9, .5, .9, '#86BFEA', 0, 8.4, 0); B(wc, .35, .4, .3, '#4C8DF6', -.5, 3.6, 1.4); B(wc, .35, .4, .3, '#E0483E', .5, 3.6, 1.4);
  B(wc, .7, 2.6, .7, mat('#F5F1E8'), 1.7, 2, .4);
  const ct = G(scene, 9, -17); B(ct, 4.4, .35, 4.4, C.wood, 0, 3.4, 0); B(ct, .5, 3.4, .5, C.dark, 0, 0, 0); B(ct, 2, .2, 2, C.dark, 0, 0, 0);
  B(ct, 1.6, .1, 2, C.paper, -.8, 3.75, .3, false); B(ct, .6, 1, .6, mat('#DDEFF5', { transparent: true, opacity: .5 }), .9, 3.75, -.6); B(ct, .5, .5, .5, '#E07A9A', .9, 4.9, -.6);
  [-3, 3].forEach(sx => { B(scene, 1.6, .35, 1.6, C.woodD, 9 + sx, 2.6, -17); B(scene, .35, 2.6, .35, C.dark, 9 + sx, 0, -17); });
  B(scene, 1.8, 2.6, 1.8, '#4F7CAC', 21.6, 0, -15); B(scene, 1.8, 2.6, 1.8, '#5E7458', 23.6, 0, -15);

  // Lounge
  B(scene, 13, .06, 9, C.rug, 33, .02, -22.5, false); B(scene, 11.4, .07, 7.4, C.rug2, 33, .03, -22.5, false); B(scene, 9.8, .08, 5.8, C.rug, 33, .04, -22.5, false);
  const sf = G(scene, 33, -29.6);
  B(sf, 11, 2, 5, C.sofaD, 0, .4, 0); [-2.6, 2.6].forEach(x => B(sf, 5.1, 1.1, 4.6, C.sofa, x, 2.4, .4));
  B(sf, 11, 4.2, 1.6, C.sofa, 0, 2.2, -1.8); [-5.2, 5.2].forEach(x => B(sf, 1.4, 3.8, 5.2, C.sofaD, x, .4, 0));
  const p1 = B(sf, 2.4, 2.2, .9, '#E0B04A', -3.4, 3.4, -.7); p1.rotation.z = .12; const p2 = B(sf, 2.2, 2, .9, C.cream, 3.4, 3.4, -.7); p2.rotation.z = -.12;
  B(sf, 3.2, .25, 4.6, '#C9563F', 2.6, 3.5, .5, false);
  const tbl = G(scene, 33, -20.5); B(tbl, 6, .45, 3, C.wood, 0, 2, 0); [[-2.6, -1.1], [2.6, -1.1], [-2.6, 1.1], [2.6, 1.1]].forEach(([x, z]) => B(tbl, .45, 2, .45, C.woodD, x, 0, z));
  B(tbl, 2, .2, 1.5, '#4F7CAC', -1.4, 2.45, 0); B(tbl, 2, .2, 1.5, '#E8E2D6', -1.2, 2.65, .1).rotation.y = .3; mug(tbl, 1.2, 2.45, .2, '#E0B04A'); deskPlant(tbl, 2.3, 2.45, -.4);
  const fl = G(scene, 26.9, -30.8); B(fl, 1.6, .3, 1.6, C.dark, 0, 0, 0); B(fl, .3, 9, .3, C.dark, 0, .3, 0); B(fl, 2.4, 2, 2.4, GLOW('#FFD9A0', .9), 0, 9, 0);
  const flL = new THREE.PointLight('#FFB868', 110, 34, 2); flL.position.set(28, 8.5, -28); scene.add(flL);
  const vm = G(scene, 38.3, -17, -PI / 2);
  B(vm, 5.2, 11, 4.4, '#A6463A', 0, 0, 0); B(vm, 3.6, 7.4, .2, GLOW('#FFF0D4', .55), -.5, 2.6, 2.15, false);
  const sn = ['#E0B04A', '#C9563F', '#4F7CAC', '#3FAE6A', '#8C6BB1', '#E07A9A'];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) B(vm, .6, .8, .3, sn[(r + c * 2) % 6], -1.8 + c * .85, 3.2 + r * 1.4, 2.3, false);
  B(vm, 1, 4, .2, '#2F2D2B', 1.9, 4.5, 2.2, false); B(vm, 3.4, 1, .2, '#2F2D2B', -.5, .8, 2.2, false);
  plant(scene, 38.8, -24.5, 6.5, .8);

  // Bullpen
  for (const d of Object.values(map.DESKS)) out.desks[d.id] = deskFor(scene, d);
  buildLayout(scene, plan);
  const cp = G(scene, plan.copier[0], plan.copier[1], PI);
  B(cp, 6.4, 4.8, 4.2, '#DCD8D0', 0, 0, 0); B(cp, 6.4, .6, 4.2, '#4A4845', 0, 4.8, 0);
  B(cp, 6, .1, .1, '#9C978F', 0, 1.6, 2.12, false); B(cp, 6, .1, .1, '#9C978F', 0, 3.1, 2.12, false);
  B(cp, 2.4, .3, 2, C.paper, -4, 3.4, .2); B(cp, 1.6, .35, 1.4, '#3A3836', 2.2, 5.4, 1.4); B(cp, .4, .2, .3, GLOW('#3FAE6A', 1.2), 2.6, 5.75, 1.7, false);
  B(cp, 2.4, .5, 2, C.paper, 1.8, 5.4, -.6);
  if (plan.boxes) {
    [[21.6, 11.6, 0], [21.6, 11.6, 2], [21.6, 15, 0]].forEach(([x, z, y]) => B(scene, 3, 2, 2.6, C.cardboard, x, y, z));
    B(scene, 3.2, .25, .6, '#8C6B4A', 21.6, 2, 11.6, false);
  }
  B(scene, 18, 3, 2.6, C.woodD, -36, 0, 21.2); B(scene, 18.3, .25, 2.9, C.wood, -36, 3, 21.2);
  ['#9C4A3A', '#3F5E73', '#C9A15A', '#5E7458', '#7B5E8C', '#3F5E73'].forEach((c, i) => B(scene, .5, 1.8, 1.6, c, -43.5 + i * .55, 3.25, 21.2, false));
  deskPlant(scene, -36, 3.25, 21.2); deskPlant(scene, -29, 3.25, 21.2);
  const tl = G(scene, -32.5, 21.2, 0, 3.25); B(tl, .8, .2, .8, C.dark, 0, 0, 0); B(tl, .15, 1.8, .15, C.dark, 0, .2, 0); B(tl, 1.6, .9, 1.2, GLOW('#FFD9A0', .8), 0, 2, 0);
  bookshelf(scene, -11, 21.6, 0, 14, 4.4, 2.4);
  const st = G(scene, 9, 21.2); B(st, 7, .4, 3, C.woodL, 0, 2.8, 0); [[-3.2, -1.2], [3.2, -1.2], [-3.2, 1.2], [3.2, 1.2]].forEach(([x, z]) => B(st, .4, 2.8, .4, C.dark, x, 0, z));
  B(st, 3, .5, 2, C.cardboard, -1.5, 3.2, 0); [['#E07A9A', -2.5], ['#7A4B2E', -1.5], ['#E0B04A', -.5]].forEach(([c, dx]) => B(st, .8, .3, .8, c, dx, 3.7, .2));
  B(st, 1.8, .6, 1.8, '#8C6B4A', 1.6, 3.2, 0); [['#E8833A', 1.3], ['#8DB04A', 1.9]].forEach(([c, fx]) => B(st, .6, .6, .6, c, fx, 3.8, 0));
  mug(st, 3, 3.2, .6, '#4F7CAC');
  plant(scene, -48, 21, 8); plant(scene, -1.2, 21.6, 6.5, .85); plant(scene, 19, 21.4, 7.5);
  const ac = G(scene, 34.5, -2, -.7); B(ac, 4.6, 1.6, 4.4, C.rug, 0, .4, 0); B(ac, 3.4, 1, 3.4, '#CD8A62', 0, 2, .4); B(ac, 4.6, 3.6, 1.2, C.rug, 0, 2, -1.6); [-2, 2].forEach(x => B(ac, .9, 2.4, 4.4, '#A9603F', x, .4, 0)); B(ac, 1.6, 1.4, .6, C.cream, 0, 3, -.8);
  const side = G(scene, 38.6, 1.5); B(side, 2, 3, 2, C.woodD, 0, 0, 0); B(side, .6, .2, .6, C.dark, 0, 3, 0); B(side, .12, 1.6, .12, C.dark, 0, 3.2, 0); B(side, 1.5, 1, 1.5, GLOW('#FFD9A0', .8), 0, 4.8, 0);
  const nl = new THREE.PointLight('#FFC27A', 40, 18, 2); nl.position.set(37, 6, 0); scene.add(nl);
  bookshelf(scene, 38.8, 9, -PI / 2, 8, 9);
  plant(scene, 37.5, 20.5, 9); plant(scene, 31, -5.5, 6, .8);
  [[33, 19.5, 0], [33, 19.5, 2], [30.4, 20, 0]].forEach(([x, z, y]) => B(scene, 2.6, 2, 2.4, C.cardboard, x, y, z));
  return out;
}

// What makes each layout: cubicle partitions, glass rooms with rugs, round tables, the bench.
function buildLayout(scene, plan) {
  const fabric = mat(PAINTABLE.partition, { roughness: .95 });
  fabric.userData.paint = 'partition';
  for (const [x0, z0, x1, z1] of plan.partitions ?? []) {
    const len = Math.hypot(x1 - x0, z1 - z0), along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B(scene, along ? len : .3, 4.6, along ? .3 : len, fabric, cx, 0, cz);
    B(scene, along ? len + .1 : .42, .18, along ? .42 : len + .1, '#5D6168', cx, 4.6, cz);
  }
  for (const [x0, z0, x1, z1, gaps] of plan.glass ?? []) glassWall(scene, x0, z0, x1, z1, gaps ?? [], 5.2);
  const rugs = ['#B9714F', '#7E8FA6', '#8FA08A', '#C9A15A', '#9C7BA8'];
  (plan.rugs ?? []).forEach(([x, z], i) => { B(scene, 9.6, .06, 7.4, rugs[i % rugs.length], x, .02, z, false); B(scene, 8.4, .07, 6.2, C.cream, x, .03, z, false); });
  for (const [x, z] of plan.tables ?? []) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, .45, 40), mat(C.woodL));
    top.position.set(x, T - .22, z); top.castShadow = top.receiveShadow = true; scene.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, T - .45, 16), mat(C.dark));
    leg.position.set(x, (T - .45) / 2, z); leg.castShadow = true; scene.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, .25, 24), mat(C.dark));
    foot.position.set(x, .12, z); scene.add(foot);
    deskPlant(scene, x, T, z);
  }
  if (plan.bench) {
    const [x0, z0, x1, z1] = plan.bench, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B(scene, x1 - x0, .5, z1 - z0, C.woodL, cx, 2.3, cz);
    for (let x = x0 + 1; x <= x1 - 1; x += (x1 - x0 - 2) / 4) [z0 + .8, z1 - .8].forEach((lz) => B(scene, .5, 2.3, .5, C.dark, x, 0, lz));
    B(scene, x1 - x0 - 4, .9, .25, '#9A948C', cx, T, cz, false);
  }
}
