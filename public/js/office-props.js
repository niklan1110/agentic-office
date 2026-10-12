import * as THREE from 'three';
import { softBox } from './agents.js';

export const C = {
  wall: '#EBDFCB', base: '#7E6A55', wood: '#B48A60', woodD: '#7A5434', woodL: '#CFA87C',
  metal: '#8E8A84', dark: '#2E2C2B', fabric: '#A39787', paper: '#F5F1E8', cream: '#F2EADB',
  leaf: '#5F8A4E', leaf2: '#4C7A43', leaf3: '#78A05A', pot: '#C27A4E', sofa: '#4D6B73', sofaD: '#43606A',
  sage: '#8FA08A', rug: '#B9714F', rug2: '#DDB38B', cardboard: '#C69C6D', frame: '#5E4A3A',
};
const BOOKS = ['#9C4A3A', '#3F5E73', '#C9A15A', '#5E7458', '#7B5E8C', '#D8CBB2', '#2F3B48', '#B86B45', '#E0B04A'];

const mats = new Map();
export function mat(c, o = {}) {
  const k = c + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: .78, ...o }));
  return mats.get(k);
}
export const GLOW = (c, i = .9) => mat(c, { emissive: c, emissiveIntensity: i, roughness: .5 });
const GLASS = new THREE.MeshStandardMaterial({ color: '#D6E6E8', transparent: true, opacity: .18, roughness: .08, depthWrite: false });

// Box with bottom at y
export function B(p, w, h, d, c, x, y, z, shadow = true) {
  const m = new THREE.Mesh(softBox(w, h, d), typeof c === 'string' ? mat(c) : c);
  m.position.set(x, y + h / 2, z); m.castShadow = shadow; m.receiveShadow = true; p.add(m); return m;
}
export function G(p, x, z, ry = 0, y = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g); return g; }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function floorTex(a, b, n, planks) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const s = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = planks ? (j % 2 ? a : b) : ((i + j) % 2 ? a : b);
    if (planks) { const off = (j % 2) * s * 1.5; x.fillRect(0, j * s, 256, s); x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect((i * s * 3 + off) % 256, j * s, 1.5, s); }
    else x.fillRect(i * s, j * s, s, s);
  }
  if (planks) { x.fillStyle = 'rgba(0,0,0,.07)'; for (let j = 0; j < n; j++) x.fillRect(0, j * s, 256, 1); }
  for (let k = 0; k < 2200; k++) { x.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '0,0,0'},.035)`; x.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function floor(p, x0, x1, z0, z1, tex, rep, y = 0) {
  const w = x1 - x0, d = z1 - z0; const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / rep, d / rep);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; p.add(m);
}

export function plant(p, x, z, h = 7, s = 1) {
  const g = G(p, x, z); g.scale.setScalar(s);
  B(g, 2.6, 2.4, 2.6, C.pot, 0, 0, 0); B(g, 2.8, .4, 2.8, '#B06C43', 0, 2.2, 0); B(g, 2.3, .1, 2.3, '#4A3A2E', 0, 2.45, 0, false);
  B(g, .35, h - 3, .35, '#6B5A3A', 0, 2.4, 0);
  const cols = [C.leaf, C.leaf2, C.leaf3];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, y = 3 + t * (h - 3.5), r = 1.6 * (1 - t * .5), a = i * 2.4;
    const sz = 1.5 - t * .5;
    B(g, sz, sz * .8, sz, cols[i % 3], Math.cos(a) * r, y, Math.sin(a) * r);
  }
  B(g, 1.2, 1.2, 1.2, C.leaf3, 0, h - .6, 0);
  return g;
}
export function deskPlant(p, x, y, z) { B(p, .9, .8, .9, C.pot, x, y, z); B(p, .7, .7, .7, C.leaf, x - .1, y + .8, z); B(p, .5, .5, .5, C.leaf3, x + .25, y + 1.2, z + .1); }
export function mug(p, x, y, z, c) { B(p, .6, .7, .6, c, x, y, z); B(p, .15, .35, .3, c, x + .38, y + .18, z); }

export function bookshelf(p, x, z, ry, w = 8, h = 9, d = 2.4) {
  const g = G(p, x, z, ry);
  B(g, w, .4, d, C.woodD, 0, 0, 0); B(g, w, .3, d, C.woodD, 0, h - .3, 0);
  B(g, .35, h, d, C.woodD, -w / 2 + .17, 0, 0); B(g, .35, h, d, C.woodD, w / 2 - .17, 0, 0);
  B(g, w, h, .2, '#6A4A2F', 0, 0, -d / 2 + .1);
  const shelves = 4, sh = (h - .7) / shelves;
  for (let i = 0; i < shelves; i++) {
    const y = .4 + i * sh; if (i) B(g, w - .5, .22, d - .2, C.woodD, 0, y - .2, 0);
    let bx = -w / 2 + .5;
    while (bx < w / 2 - .9) {
      const bw = .35 + rnd() * .35, bh = sh * (.55 + rnd() * .35);
      if (rnd() > .88) { bx += .6; continue; }
      B(g, bw, bh, d * .7, BOOKS[Math.floor(rnd() * BOOKS.length)], bx + bw / 2, y, .05, false); bx += bw + .03;
    }
  }
  return g;
}

function desk(p, x, z, v) {
  const g = G(p, x, z);
  B(g, 10, .5, 4, C.woodL, 0, 2.3, 0);
  [[-4.6, -1.6], [-4.6, 1.6]].forEach(([lx, lz]) => B(g, .4, 2.3, .4, C.dark, lx, 0, lz));
  B(g, 2.8, 2.3, 3.6, '#9A948C', 3.3, 0, 0);
  B(g, 2.4, .08, .2, '#6B665F', 3.3, 1.6, -1.85, false); B(g, 2.4, .08, .2, '#6B665F', 3.3, .8, -1.85, false);
  const mon = G(g, 1.8, .4, Math.PI + .25, 2.8);
  B(mon, 1.4, .15, 1, C.dark, 0, 0, 0); B(mon, .35, 1.1, .35, C.dark, 0, .1, 0);
  B(mon, 3.6, 2.3, .3, C.dark, 0, 1, 0); B(mon, 3.3, 2, .05, GLOW('#CFE0F0', .35), 0, 1.15, .17, false);
  B(g, 3.2, .18, 1.1, '#3A3836', -.6, 2.8, -1.1);
  B(g, .6, .12, .9, '#3A3836', 1.6, 2.8, -1.1);
  mug(g, -3.8, 2.8, -.4, ['#E8E2D6', '#C9563F', '#4F7CAC', '#E0B04A'][v % 4]);
  B(g, 1.8, .3, 2.2, C.paper, -2.9, 2.8, .6);
  if (v % 3 === 0) { B(g, .9, .2, .9, C.dark, -3.9, 2.8, 1.1); B(g, .2, 2, .2, C.dark, -3.9, 3, 1.1); B(g, 1.6, .8, 1.2, GLOW('#FFD9A0', .7), -3.6, 4.6, .9); }
  if (v % 3 === 1) deskPlant(g, -3.9, 2.8, 1.2);
  if (v % 3 === 2) { const f = G(g, -3.9, 1.2, Math.PI + .4, 2.8); B(f, 1.2, 1.4, .15, C.frame, 0, 0, 0); B(f, .9, 1.1, .05, GLOW('#E9C9A2', .15), 0, .15, .08, false); }
  return g;
}

export function chair(p, x, z, ry, c = '#4B4F55') {
  const g = G(p, x, z, ry);
  B(g, 2.4, .2, 2.4, C.dark, 0, .2, 0); B(g, .4, 1.6, .4, C.metal, 0, .3, 0);
  B(g, 2.8, .6, 2.8, c, 0, 1.8, 0); B(g, 2.8, 2.8, .5, c, 0, 2.3, -1.2);
  return g;
}

export function glassWall(p, x0, z0, x1, z1, gaps = []) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  const g = G(p, x0, z0, ry);
  const segs = []; let a = 0;
  gaps.forEach(([s, e]) => { segs.push([a, s]); a = e; }); segs.push([a, len]);
  const H = 10;
  segs.forEach(([s, e]) => {
    if (e - s < .1) return;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(e - s, H - 1, .15), GLASS); glass.position.set((s + e) / 2, H / 2, 0); g.add(glass);
    B(g, e - s, .5, .4, C.frame, (s + e) / 2, 0, 0); B(g, e - s, .4, .4, C.frame, (s + e) / 2, H - .4, 0);
    for (let t = s; t <= e + .01; t += Math.max((e - s) / Math.ceil((e - s) / 6), .1)) B(g, .35, H, .45, C.frame, Math.min(t, e - .17), 0, 0);
    B(g, e - s, .18, .2, '#E8E0D0', (s + e) / 2, 4.2, .1, false);
  });
  return g;
}

export function windowOn(p, x, z, ry, w = 10) {
  const g = G(p, x, z, ry);
  B(g, w + .8, 7.4, .4, C.frame, 0, 3.6, 0);
  B(g, w, 6.6, .1, GLOW('#FFF0D4', .95), 0, 4, .22, false);
  B(g, .25, 6.6, .25, C.frame, 0, 4, .25);
  for (let i = 0; i < 9; i++) B(g, w, .2, .18, '#F4EEE3', 0, 10.4 - i * .42, .34, false);
  B(g, w + 1.4, .35, 1, C.cream, 0, 3.3, .5);
  return g;
}
export function picture(p, x, y, z, ry, w, h, c) {
  const g = G(p, x, z, ry, y);
  B(g, w, h, .3, C.frame, 0, 0, 0); B(g, w - .5, h - .5, .1, mat(C.paper), 0, .25, .18, false);
  B(g, w - 1.2, h - 1.2, .06, c, 0, .6, .25, false);
}

export function buildOffice(scene) {
  const lights = [];
  const carpet = floorTex('#C2B5A2', '#BBAD99', 8), vinyl = floorTex('#DCCBAE', '#D3C09F', 10, true), exec = floorTex('#B3A089', '#AC9982', 8);
  floor(scene, -400, 400, -400, 400, floorTex('#E4DBCD', '#E0D7C8', 4), 40, -.05);
  floor(scene, -57, 36, -35, 31, carpet, 8);
  floor(scene, 36, 67, -35, 31, vinyl, 10, .01);
  floor(scene, -57, -30, -35, -12, exec, 8, .02);

  // Walls (back + left, cutaway diorama)
  B(scene, 125, 13, 1, C.wall, 5, 0, -35.5); B(scene, 1, 13, 67, C.wall, -57.5, 0, -2);
  B(scene, 125, .9, .3, C.base, 5, 0, -34.9); B(scene, .3, .9, 66, C.base, -56.9, 0, -2);
  B(scene, 125, .5, 1.3, C.base, 5, 13, -35.5); B(scene, 1.3, .5, 67, C.base, -57.5, 13, -2);
  [-12, 6, 24].forEach(x => windowOn(scene, x, -35, 0));
  windowOn(scene, -57, -24, Math.PI / 2, 9);
  // Wall clock
  const clk = G(scene, -21, -34.8, 0, 9); B(clk, 2.6, 2.6, .3, C.dark, 0, 0, 0); B(clk, 2.2, 2.2, .1, mat(C.paper), 0, .2, .2, false);
  B(clk, .18, .9, .1, C.dark, 0, 1.3, .27, false); const mh = B(clk, .14, 1, .1, '#C9563F', .3, 1.1, .27, false); mh.rotation.z = -1.1;
  picture(scene, -56.8, 4.5, 4, Math.PI / 2, 5, 4, mat('#8DA3A6'));
  picture(scene, -56.8, 4.5, 12, Math.PI / 2, 4, 5, mat('#C99A6B'));
  picture(scene, -56.8, 5, 20, Math.PI / 2, 6, 4, mat('#9A8FB0'));

  // Manager office
  glassWall(scene, -57, -12, -30, -12, [[20, 25]]);
  glassWall(scene, -30, -12, -30, -35);
  B(scene, 18, .08, 12, '#93624A', -43, .03, -22, false); B(scene, 16, .1, 10, '#B88563', -43, .04, -22, false);
  const md = G(scene, -43, -21.5);
  B(md, 13, .6, 5, C.woodD, 0, 2.5, 0); B(md, 12.6, 2.5, .4, '#6A4A2F', 0, 0, 2.2); B(md, .5, 2.5, 4.6, '#6A4A2F', -6.2, 0, 0); B(md, .5, 2.5, 4.6, '#6A4A2F', 6.2, 0, 0);
  const mm = G(md, -2.5, -.5, Math.PI - .2, 3.1); B(mm, .4, 1, .4, C.dark, 0, 0, 0); B(mm, 3.8, 2.4, .3, C.dark, 0, .9, 0); B(mm, 3.5, 2.1, .05, GLOW('#CFE0F0', .35), 0, 1.05, .17, false);
  B(md, 2.4, .5, .6, '#C9A15A', 2, 3.1, 1.8); B(md, 2, .25, 2.6, C.paper, 3.6, 3.1, -.2);
  mug(md, 1, 3.1, -.6, '#F5F1E8');
  B(md, .9, .2, .9, '#C9A15A', 5.2, 3.1, -1.2); B(md, .2, 2.2, .2, '#C9A15A', 5.2, 3.3, -1.2); B(md, 1.8, .9, 1.3, GLOW('#FFD9A0', .8), 5, 5.2, -1);
  chair(scene, -46.5, -15.5, Math.PI + .2, '#7A5434'); chair(scene, -39.5, -15.5, Math.PI - .2, '#7A5434');
  bookshelf(scene, -55.6, -30, Math.PI / 2, 7, 9.5);
  const wb = G(scene, -42, -34.8, 0, 3.6); B(wb, 11, 6.2, .3, '#CFC9BE', 0, 0, 0); B(wb, 10.4, 5.6, .1, mat('#FBFAF7'), 0, .3, .18, false);
  ['#4F7CAC', '#B5483B', '#E0B04A', '#3E9C9C', '#8C6BB1'].forEach((c, i) => B(wb, 1.4, 1.4, .1, mat(c), -3.8 + i * 1.9, 3.6, .25, false));
  [[-1, 2.2, 6], [-1.6, 1.4, 4.6], [-.8, .7, 6.2]].forEach(([x, y, w]) => B(wb, w, .2, .1, mat(C.dark), x, y, .25, false));
  plant(scene, -33.5, -32, 8);
  const pl = new THREE.PointLight('#FFC27A', 55, 26, 2); pl.position.set(-38, 6.5, -22.5); scene.add(pl); lights.push(pl);

  // Bullpen
  B(scene, 62, 4.4, .6, C.fabric, 2.5, 0, -26.5); B(scene, 62.4, .3, .9, C.woodL, 2.5, 4.4, -26.5);
  for (let i = 0; i < 4; i++) B(scene, 3.8, 4.6, 3, '#9A948C', -24 + i * 4, 0, -33);
  for (let i = 0; i < 4; i++) for (let r = 0; r < 3; r++) B(scene, 2.8, .1, .2, '#6B665F', -24 + i * 4, .9 + r * 1.4, -31.45, false);
  B(scene, 3, 1.4, 2, C.cardboard, -20, 4.6, -33); B(scene, 2, .6, 1.6, C.paper, -24, 4.6, -33);
  bookshelf(scene, 10, -33.2, 0, 9, 5.5);
  plant(scene, 31, -32, 8.5); plant(scene, -1, -32, 6, .9);
  const desks = [];
  [-23.5, -6.5, 10.5, 27.5].forEach((x, i) => { desks.push(desk(scene, x, -17.7, i)); desks.push(desk(scene, x, 1.3, i + 5)); });

  // Reception
  const rc = G(scene, -10, 23.3);
  B(rc, 12, 3.6, .8, C.woodD, 0, 0, 2); B(rc, 12.6, .35, 1.6, C.woodL, 0, 3.6, 2);
  B(rc, 12, .45, 4, C.woodL, 0, 2.4, 0); B(rc, .8, 3.6, 4.6, C.woodD, -6, 0, .2); B(rc, .8, 3.6, 4.6, C.woodD, 6, 0, .2);
  const rmon = G(rc, 3, -.3, Math.PI - .3, 2.85); B(rmon, .35, 1, .35, C.dark, 0, 0, 0); B(rmon, 3.4, 2.2, .3, C.dark, 0, .9, 0); B(rmon, 3.1, 1.9, .05, GLOW('#CFE0F0', .35), 0, 1.05, .17, false);
  const jar = new THREE.Mesh(softBox(1.3, 1.5, 1.3), GLASS); jar.position.set(-3.2, 4.7, 2); rc.add(jar);
  ['#C9563F', '#E0B04A', '#4F7CAC', '#3FAE6A'].forEach((c, i) => B(rc, .4, .4, .4, c, -3.5 + (i % 2) * .55, 3.95 + Math.floor(i / 2) * .4, 1.8 + (i % 2) * .3, false));
  B(rc, .9, .3, .9, '#C9A15A', 1, 3.95, 2.2); B(rc, .5, .3, .5, '#C9A15A', 1, 4.25, 2.2);
  B(rc, 2.2, .25, 1.6, C.paper, -1.2, 2.85, -.4); mug(rc, -4.3, 2.85, -.8, '#E07A9A');
  deskPlant(rc, 4.8, 2.85, .9);
  chair(scene, -32, 23, Math.PI / 2, C.sofa); chair(scene, -32, 17.5, Math.PI / 2, C.sofa);
  B(scene, 2.6, 2.6, 2.6, C.woodD, -32, 0, 20.25); B(scene, 2, .2, 1.6, '#C9563F', -32, 2.6, 20.25);
  plant(scene, -54, 27, 9); plant(scene, -54, -9, 7.5, .9);

  // Copier corner
  const cp = G(scene, 22, 20);
  B(cp, 6.4, 4.8, 4.2, '#DCD8D0', 0, 0, 0); B(cp, 6.4, .6, 4.2, '#4A4845', 0, 4.8, 0);
  B(cp, 6, .1, .1, '#9C978F', 0, 1.6, 2.12, false); B(cp, 6, .1, .1, '#9C978F', 0, 3.1, 2.12, false);
  B(cp, 2.4, .3, 2, C.paper, -4, 3.4, .2); B(cp, 1.6, .35, 1.4, '#3A3836', 2.2, 5.4, 1.4); B(cp, .4, .2, .3, GLOW('#3FAE6A', 1.2), 2.6, 5.75, 1.7, false);
  B(cp, 2.4, .5, 2, C.paper, 1.8, 5.4, -.6);
  [[29, 18, 0], [29, 18, 2], [29, 21.6, 0], [32, 18.5, 0]].forEach(([x, z, y]) => B(scene, 3.2, 2, 2.4, C.cardboard, x, y, z));
  B(scene, 3.4, .25, .6, '#8C6B4A', 29, 2, 18, false);
  B(scene, 1.8, 2.4, 1.8, '#4F7CAC', 16.5, 0, 19.5);

  // Break room
  const fr = G(scene, 39.5, -31.8); B(fr, 5, 11, 4.2, '#E9E6DF', 0, 0, 0); B(fr, 5, .12, .2, '#C9C4BA', 0, 7, 2.1, false);
  B(fr, .3, 2.6, .3, '#9C978F', -1.9, 7.7, 2.2); B(fr, .3, 2.6, .3, '#9C978F', -1.9, 3.6, 2.2);
  ['#E0B04A', '#C9563F', '#4F7CAC'].forEach((c, i) => B(fr, .9, .9, .1, c, .4 + i * 1.1, 8.6 - (i % 2) * .8, 2.15, false));
  const kc = G(scene, 52.5, -32.7);
  B(kc, 18, 4.2, 4, C.sage, 0, 0, 0); B(kc, 18.4, .45, 4.4, C.woodL, 0, 4.2, .1);
  for (let i = 0; i < 6; i++) { B(kc, .12, 3.6, .1, '#7C8D77', -9 + i * 3 + 3, .3, 2.02, false); B(kc, .9, .15, .15, '#5E5A55', -7.5 + i * 3, 3.3, 2.08, false); }
  B(kc, 18, 3.4, 2.4, C.sage, 0, 8, -.8); for (let i = 0; i < 4; i++) B(kc, .9, .15, .15, '#5E5A55', -6.75 + i * 4.5, 8.5, .45, false);
  const cm = G(kc, -5.5, .2, 0, 4.65); B(cm, 2.4, 3.4, 2.2, '#2F2D2B', 0, 0, 0); B(cm, 1.3, 1.3, 1, '#7A4B2E', 0, .4, .9); B(cm, .3, .2, .2, GLOW('#E5A93B', 1.2), .7, 2.8, 1.12, false);
  mug(kc, -3.4, 4.65, 1.2, '#F5F1E8'); mug(kc, -2.4, 4.65, 1.4, '#C9563F');
  B(kc, 4, .2, 2.6, '#9C9A94', 1, 4.6, .3, false);
  const mw = G(kc, 5.8, -.2, 0, 4.65); B(mw, 4.2, 2.4, 2.6, '#D8D4CC', 0, 0, 0); B(mw, 2.6, 1.7, .1, '#2F2D2B', -.5, .35, 1.32, false); B(mw, .5, .2, .1, GLOW('#3FAE6A', 1), 1.4, 1.8, 1.32, false);
  B(kc, 1.4, 1.8, 1.4, '#C27A4E', 8.4, 4.65, .6);
  const wc = G(scene, 35.8, -28);
  B(wc, 2.6, 5.2, 2.6, '#EFEDE8', 0, 0, 0);
  const jug = new THREE.Mesh(softBox(2.1, 3.2, 2.1), new THREE.MeshStandardMaterial({ color: '#86BFEA', transparent: true, opacity: .7, roughness: .1 })); jug.position.set(0, 6.8, 0); jug.castShadow = true; wc.add(jug);
  B(wc, .9, .5, .9, '#86BFEA', 0, 8.4, 0); B(wc, .35, .4, .3, '#4C8DF6', -.5, 3.6, 1.4); B(wc, .35, .4, .3, '#E0483E', .5, 3.6, 1.4);
  B(wc, .7, 2.6, .7, mat('#F5F1E8'), 1.7, 2, .4);
  const vm = G(scene, 63.5, -16, -Math.PI / 2);
  B(vm, 5.2, 11, 4.4, '#A6463A', 0, 0, 0); B(vm, 3.6, 7.4, .2, GLOW('#FFF0D4', .55), -.5, 2.6, 2.15, false);
  const sn = ['#E0B04A', '#C9563F', '#4F7CAC', '#3FAE6A', '#8C6BB1', '#E07A9A'];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) B(vm, .6, .8, .3, sn[(r + c * 2) % 6], -1.8 + c * .85, 3.2 + r * 1.4, 2.3, false);
  B(vm, 1, 4, .2, '#2F2D2B', 1.9, 4.5, 2.2, false); B(vm, 3.4, 1, .2, '#2F2D2B', -.5, .8, 2.2, false);
  B(scene, 22, .06, 16, C.rug, 51, .02, 2, false); B(scene, 19.6, .07, 13.6, C.rug2, 51, .03, 2, false); B(scene, 17, .08, 11, C.rug, 51, .04, 2, false); B(scene, 15.6, .09, 9.6, C.rug2, 51, .05, 2, false);
  const sf = G(scene, 51, -4.2);
  B(sf, 17, 2, 6, C.sofaD, 0, .4, 0); [-5.8, -2.9, 0, 2.9, 5.8].forEach(() => {});
  [-5.2, 0, 5.2].forEach(x => B(sf, 5.1, 1.1, 4.8, C.sofa, x, 2.4, .5));
  B(sf, 17, 4.2, 1.8, C.sofa, 0, 2.2, -2.2);
  [-7.9, 7.9].forEach(x => B(sf, 1.6, 3.8, 6.2, C.sofaD, x, .4, 0));
  [-.4, .6].forEach((y, i) => {});
  for (let i = 0; i < 4; i++) B(sf, .5, .4, .5, C.woodD, (i % 2 ? 7.9 : -7.9), 0, (i < 2 ? 2.5 : -2.5));
  const p1 = B(sf, 2.6, 2.4, .9, '#E0B04A', -5.6, 3.4, -.9); p1.rotation.z = .12;
  const p2 = B(sf, 2.4, 2.2, .9, C.cream, 5.6, 3.4, -.9); p2.rotation.z = -.12;
  B(sf, 3.4, .25, 4.9, '#C9563F', 4.6, 3.5, .7, false);
  const ct = G(scene, 51, 5.5);
  B(ct, 9, .5, 4, C.wood, 0, 2, 0); [[-4, -1.6], [4, -1.6], [-4, 1.6], [4, 1.6]].forEach(([x, z]) => B(ct, .5, 2, .5, C.woodD, x, 0, z));
  B(ct, 8.2, .25, 3.2, C.woodD, 0, .6, 0);
  B(ct, 2.6, .2, 1.9, '#4F7CAC', -2.4, 2.5, -.2); B(ct, 2.6, .2, 1.9, '#E8E2D6', -2.1, 2.7, .1).rotation.y = .3;
  mug(ct, 1.4, 2.5, .3, '#E0B04A'); deskPlant(ct, 3.4, 2.5, -.5);
  const fl = G(scene, 63, -6); B(fl, 1.8, .3, 1.8, C.dark, 0, 0, 0); B(fl, .3, 9, .3, C.dark, 0, .3, 0); B(fl, 2.6, 2, 2.6, GLOW('#FFD9A0', .9), 0, 9, 0);
  const flL = new THREE.PointLight('#FFB868', 160, 42, 2); flL.position.set(63, 8.5, -4); scene.add(flL); lights.push(flL);
  plant(scene, 64, 28, 10); plant(scene, 39, 26, 7); plant(scene, 59.5, -31.5, 6, .8);
  B(scene, 2.2, 3.2, 2.2, '#5E7458', 33.6, 0, -18.5); B(scene, 2.4, .2, 2.4, '#4C5F47', 33.6, 3.2, -18.5);
  const rl = new THREE.PointLight('#FFC27A', 60, 30, 2); rl.position.set(-10, 8, 20); scene.add(rl); lights.push(rl);
  return { lights, desks };
}
