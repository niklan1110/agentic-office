import * as THREE from 'three';

export const STATUS = {
  working:  { label: 'Working',  color: '#4C8DF6' },
  thinking: { label: 'Thinking', color: '#E5A93B' },
  idle:     { label: 'Idle',     color: '#9C9A94' },
  error:    { label: 'Error',    color: '#E0483E' },
  done:     { label: 'Done',     color: '#3FAE6A' },
};
export const STATUS_ORDER = ['working', 'thinking', 'idle', 'error', 'done'];

const E2 = { w: .55, h: 1.1, gap: 3, y: .6 };

// Units: 1u = 1cm. Body blocks sit on top of the legs; extras are offset from the body top.
export const ROLES = [
  { id: 'manager', name: 'Manager', role: 'Orchestrator', color: '#5B5BD6',
    W: 6, H: 5.6, D: 3, legH: 1.3, legs: 'quad', eyes: { ...E2, y: .6 },
    arm: { type: 'step', y: 1.6, len: 1.2, h: 1 },
    extras: [{ n: 'crest', x: 0, y: 0, w: 2, h: .9, d: 2 }],
    work: 'point', feature: 'Tallest classic body with a crest block on top', motion: 'Raises an arm to point and direct' },
  { id: 'developer', name: 'Developer', role: 'Software developer', color: '#4F7CAC',
    W: 6, H: 4.5, D: 3, legH: 1.3, legs: 'quad', eyes: E2,
    arm: { type: 'step', y: 1.2, len: 1.2, h: 1 },
    work: 'type', feature: 'The base silhouette, unchanged from the reference', motion: 'Types fast at the desk' },
  { id: 'reviewer', name: 'Reviewer', role: 'Code reviewer', color: '#B5483B',
    W: 7.2, H: 3.6, D: 3, legH: 1.2, legs: 'quad', eyes: { w: 1.1, h: .42, gap: 3.3, y: .6 },
    arm: { type: 'step', y: .9, len: 1.1, h: .9 },
    work: 'scan', feature: 'Wide and low, with squinting slit eyes', motion: 'Scans side to side across the diff' },
  { id: 'qa', name: 'QA', role: 'QA / tester', color: '#E0B04A',
    W: 5, H: 5, D: 4.2, legH: 1, legs: 'quad', eyes: { w: .7, h: .7, gap: 2.4, y: .62 },
    arm: { type: 'step', y: 1.4, len: 1.1, h: 1 },
    work: 'type', feature: 'Deep cube body, short legs, square eyes', motion: 'Types test runs' },
  { id: 'researcher', name: 'Researcher', role: 'Researcher', color: '#8C6BB1',
    W: 4.4, H: 6.2, D: 3, legH: 1.4, legs: 'quad', eyes: { w: .5, h: 1.2, gap: 2, y: .66 },
    arm: { type: 'step', y: 2, len: 1.1, h: .9 },
    extras: [{ n: 'antenna_stem', x: .9, y: 0, w: .4, h: 1.4, d: .4 }, { n: 'antenna_tip', x: .9, y: 1.4, w: 1, h: 1, d: 1 }],
    work: 'scan', feature: 'Tall, narrow body with an antenna', motion: 'Looks around, gathering sources' },
  { id: 'designer', name: 'Designer', role: 'Designer', color: '#E07A9A',
    W: 6.4, H: 3.8, D: 3.2, legH: 1.3, legs: 'quad', eyes: { ...E2, gap: 3.2, y: .55 },
    arm: { type: 'step', y: 1, len: 1.2, h: 1 },
    extras: [{ n: 'tier_1', x: 0, y: 0, w: 4.6, h: 1, d: 2.6 }, { n: 'tier_2', x: 0, y: 1, w: 2.8, h: .8, d: 2 }],
    work: 'type', feature: 'Stepped ziggurat top', motion: 'Sketches at the desk' },
  { id: 'devops', name: 'DevOps', role: 'DevOps / deploy', color: '#3E9C9C',
    W: 6.6, H: 4, D: 3.2, legH: 1.4, legs: 'duo', eyes: { w: .55, h: 1, gap: 3.2, y: .6 },
    arm: { type: 'hand', y: 1.1, len: 1.8, h: .8 },
    work: 'type', feature: 'Long arms with raised hands, two chunky legs', motion: 'Works the pipeline' },
  { id: 'writer', name: 'Writer', role: 'Writer / docs', color: '#D8C8A8',
    W: 5.4, H: 5.4, D: 2.4, legH: 1.3, legs: 'quad', notch: 1.3, eyes: { w: .5, h: 1, gap: 2.6, y: .55 },
    arm: { type: 'step', y: 1.4, len: 1.1, h: .9 },
    work: 'type', feature: 'Thin page-like body with a dog-eared corner', motion: 'Types drafts' },
  { id: 'analyst', name: 'Analyst', role: 'Data analyst', color: '#8DB04A',
    W: 6, H: 4.2, D: 3, legH: 1.3, legs: 'quad', eyes: E2,
    arm: { type: 'step', y: 1.1, len: 1.2, h: 1 },
    extras: [{ n: 'bar_1', x: -1.7, y: 0, w: 1.2, h: .6, d: 1.6 }, { n: 'bar_2', x: 0, y: 0, w: 1.2, h: 1.2, d: 1.6 }, { n: 'bar_3', x: 1.7, y: 0, w: 1.2, h: 1.9, d: 1.6 }],
    work: 'type', feature: 'Bar-chart blocks rising off the top', motion: 'Crunches numbers' },
  { id: 'security', name: 'Security', role: 'Security auditor', color: '#6E7B8C',
    W: 6, H: 5, D: 3.6, legH: 1.2, legs: 'quad', eyes: { w: 4, h: .6, gap: 0, y: .62 },
    arm: { type: 'stub', y: 1.2, len: .8, h: 1.5 },
    extras: [{ n: 'brim', x: 0, y: -.45, w: 6.4, h: .45, d: .8, z: 1.6 }],
    work: 'scan', feature: 'Single visor slit under a helmet brim, stubby arms', motion: 'Sweeps the room' },
];

export function roleDims(r) {
  const reach = r.arm.len;
  const top = Math.max(0, ...(r.extras || []).map(e => e.y + e.h));
  return { w: r.W + reach * 2, h: r.legH + r.H + top, d: r.D };
}

const geoCache = new Map();
export function softBox(w, h, d) {
  const key = [w, h, d].map(v => v.toFixed(3)).join('x');
  if (geoCache.has(key)) return geoCache.get(key);
  const b = Math.min(.09, Math.min(w, h, d) * .14);
  const sw = w - 2 * b, sh = h - 2 * b, sd = Math.max(d - 2 * b, .001);
  const r = Math.min(b, sw / 2, sh / 2);
  const x0 = -sw / 2, y0 = -sh / 2, x1 = sw / 2, y1 = sh / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: sd, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -sd / 2);
  geoCache.set(key, g);
  return g;
}
const plainCache = new Map();
function plainBox(w, h, d) {
  const key = [w, h, d].join('x');
  if (!plainCache.has(key)) plainCache.set(key, new THREE.BoxGeometry(w, h, d));
  return plainCache.get(key);
}
function block(name, mat, w, h, d, x, y, z, soft = true) {
  const m = new THREE.Mesh(soft ? softBox(w, h, d) : plainBox(w, h, d), mat);
  m.name = name; m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Two character styles. Classic: one blocky body with flat black eyes and little legs
// (the original design). Bots: a head with a screen face on a torso. Both build the
// same parts, so the animation and the office treat them alike.
export const CHARACTER_STYLES = Object.freeze([
  { id: 'classic', name: 'Classic', blurb: 'Blocky bodies with flat black eyes.' },
  { id: 'bots', name: 'Bots', blurb: 'Screen faces with glowing eyes.' },
]);
export function buildAgent(r, style = 'classic') {
  return style === 'bots' ? buildBot(r) : buildClassic(r);
}

const inkMat = new THREE.MeshStandardMaterial({ name: 'eye_black', color: '#161616', roughness: .4, metalness: 0 });

function buildClassic(r) {
  const paint = new THREE.MeshStandardMaterial({ name: `${r.id}_paint`, color: r.color, roughness: .62, metalness: 0 });
  const root = new THREE.Group(); root.name = `agent_${r.id}`;
  const upper = new THREE.Group(); upper.name = 'upper'; upper.position.y = r.legH; root.add(upper);

  const bodies = r.notch
    ? [{ x: 0, y: 0, w: r.W, h: r.H - r.notch, d: r.D }, { x: -r.notch / 2, y: r.H - r.notch - .01, w: r.W - r.notch, h: r.notch + .01, d: r.D }]
    : [{ x: 0, y: 0, w: r.W, h: r.H, d: r.D }];
  bodies.forEach((b, i) => upper.add(block(i ? `body_${i}` : 'body', paint, b.w, b.h, b.d, b.x, b.y + b.h / 2, 0)));
  (r.extras || []).forEach(e => upper.add(block(e.n, paint, e.w, e.h + .02, e.d, e.x, r.H + e.y + e.h / 2 - .02, e.z || 0)));

  const eyeY = r.H * r.eyes.y;
  const eyes = new THREE.Group(); eyes.name = 'eyes'; eyes.position.set(0, eyeY, r.D / 2 + .02); upper.add(eyes);
  if (r.eyes.gap) {
    eyes.add(block('eye_L', inkMat, r.eyes.w, r.eyes.h, .06, -r.eyes.gap / 2, 0, 0, false));
    eyes.add(block('eye_R', inkMat, r.eyes.w, r.eyes.h, .06, r.eyes.gap / 2, 0, 0, false));
  } else {
    eyes.add(block('visor', inkMat, r.eyes.w, r.eyes.h, .06, 0, 0, 0, false));
  }

  const A = r.arm, ad = Math.min(r.D * .6, 1.8);
  const arms = [-1, 1].map(side => {
    const g = new THREE.Group(); g.name = side < 0 ? 'arm_L' : 'arm_R';
    g.position.set(side * r.W / 2, A.y + A.h / 2, 0); upper.add(g);
    const tag = side < 0 ? 'L' : 'R';
    g.add(block(`arm_${tag}`, paint, A.len + .15, A.h, ad, side * (A.len - .15) / 2, 0, 0));
    if (A.type === 'step') {
      const sw = A.len * .55 + .15, sh = A.h * .55;
      g.add(block(`arm_${tag}_step`, paint, sw, sh + .02, ad * .9, side * (sw / 2 - .15), -A.h / 2 - sh / 2 + .01, 0));
    } else if (A.type === 'hand') {
      g.add(block(`hand_${tag}`, paint, .7, 1.3, ad * .9, side * (A.len - .35), A.h / 2 + .6, 0));
    }
    return g;
  });

  const legs = [];
  const legDefs = r.legs === 'duo'
    ? [{ x: -(r.W / 2 - 1.2), w: 1.5, d: r.D * .7 }, { x: r.W / 2 - 1.2, w: 1.5, d: r.D * .7 }]
    : (() => { const o = r.W / 2 - .55, i = o - .8, d = Math.min(r.D * .55, 2); return [-o, -i, i, o].map(x => ({ x, w: .62, d })); })();
  legDefs.forEach((L, i) => {
    const g = new THREE.Group(); g.name = `leg_${i + 1}`; g.position.set(L.x, r.legH, 0); root.add(g);
    g.add(block(`leg_${i + 1}`, paint, L.w, r.legH + .1, L.d, 0, -(r.legH + .1) / 2 + .1, 0));
    legs.push(g);
  });

  const top = r.legH + r.H + Math.max(0, ...(r.extras || []).map(e => e.y + e.h));
  return { role: r, root, upper, eyes, eyeY, arms, legs, top, paint,
    phase: Math.random() * 10, nextBlink: 1 + Math.random() * 4, blinkEnd: 0 };
}

// The Agent Office bots: a torso, a head with a dark screen for a face, and pixel
// eyes and a mouth that glow on it. Each role keeps its colour, proportions, eye
// shape and top piece (crest, antenna, chart bars…), so the team reads at a glance.
const screenMat = new THREE.MeshStandardMaterial({ name: 'face_screen', color: '#1A1D2B', roughness: .35, metalness: .1 });
const glowMat = new THREE.MeshStandardMaterial({ name: 'face_glow', color: '#BFF4FF', emissive: '#7FE7FF', emissiveIntensity: 1.1, roughness: .3 });

function buildBot(r) {
  const paint = new THREE.MeshStandardMaterial({ name: `${r.id}_paint`, color: r.color, roughness: .62, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ name: `${r.id}_trim`, color: new THREE.Color(r.color).multiplyScalar(.72), roughness: .7, metalness: 0 });
  const root = new THREE.Group(); root.name = `agent_${r.id}`;
  const upper = new THREE.Group(); upper.name = 'upper'; upper.position.y = r.legH; root.add(upper);

  // Torso and head: the head is the wider, taller part, set back a little on the torso.
  const torsoH = r.H * .42, headH = r.H - torsoH - .15, headY = torsoH + .15;
  upper.add(block('torso', trim, r.W * .74, torsoH, r.D * .82, 0, torsoH / 2, 0));
  upper.add(block('collar', paint, r.W * .5, .2, r.D * .6, 0, torsoH + .06, 0));
  upper.add(block('head', paint, r.W, headH, r.D, 0, headY + headH / 2, 0));
  (r.extras || []).forEach(e => upper.add(block(e.n, paint, e.w, e.h + .02, e.d, e.x, r.H + e.y + e.h / 2 - .02, e.z || 0)));

  // The face: a screen across the head, with glowing eyes and a small mouth.
  const sw = Math.min(r.W - .9, Math.max(r.eyes.gap + r.eyes.w + 1.2, r.eyes.w + 1.6)), sh = headH * .72;
  upper.add(block('screen', screenMat, sw, sh, .1, 0, headY + headH / 2, r.D / 2 + .01, false));
  const eyeY = headY + headH * .58;
  const eyes = new THREE.Group(); eyes.name = 'eyes'; eyes.position.set(0, eyeY, r.D / 2 + .02); upper.add(eyes);
  const ew = Math.min(r.eyes.w, sw - .6), eh = Math.min(r.eyes.h, sh * .45);
  if (r.eyes.gap) {
    eyes.add(block('eye_L', glowMat, ew, eh, .08, -r.eyes.gap / 2, 0, .03, false));
    eyes.add(block('eye_R', glowMat, ew, eh, .08, r.eyes.gap / 2, 0, .03, false));
  } else {
    eyes.add(block('visor', glowMat, ew, eh, .08, 0, 0, .03, false));
  }
  upper.add(block('mouth', glowMat, Math.min(1.1, sw * .3), .16, .08, 0, headY + headH * .28, r.D / 2 + .05, false));

  // Arms hang from the torso.
  const A = r.arm, ad = Math.min(r.D * .55, 1.6), tw = r.W * .74;
  const arms = [-1, 1].map(side => {
    const g = new THREE.Group(); g.name = side < 0 ? 'arm_L' : 'arm_R';
    g.position.set(side * tw / 2, Math.min(A.y, torsoH - A.h / 2) + A.h / 2, 0); upper.add(g);
    const tag = side < 0 ? 'L' : 'R';
    g.add(block(`arm_${tag}`, paint, A.len + .15, A.h, ad, side * (A.len - .15) / 2, 0, 0));
    if (A.type === 'step') {
      const w = A.len * .55 + .15, h = A.h * .55;
      g.add(block(`arm_${tag}_step`, trim, w, h + .02, ad * .9, side * (w / 2 - .15), -A.h / 2 - h / 2 + .01, 0));
    } else if (A.type === 'hand') {
      g.add(block(`hand_${tag}`, trim, .7, 1.3, ad * .9, side * (A.len - .35), A.h / 2 + .6, 0));
    }
    return g;
  });

  // Two sturdy legs with feet.
  const legs = [];
  [-1, 1].forEach((side, i) => {
    const g = new THREE.Group(); g.name = `leg_${i + 1}`; g.position.set(side * tw * .26, r.legH, 0); root.add(g);
    g.add(block(`leg_${i + 1}`, trim, Math.max(.9, tw * .24), r.legH + .1, Math.min(r.D * .5, 1.6), 0, -(r.legH + .1) / 2 + .1, 0));
    g.add(block(`foot_${i + 1}`, paint, Math.max(1, tw * .28), .35, Math.min(r.D * .5, 1.6) + .6, 0, -r.legH + .18, .3));
    legs.push(g);
  });

  const top = r.legH + r.H + Math.max(0, ...(r.extras || []).map(e => e.y + e.h));
  return { role: r, root, upper, eyes, eyeY, arms, legs, top, paint,
    phase: Math.random() * 10, nextBlink: 1 + Math.random() * 4, blinkEnd: 0 };
}

export function animateAgent(a, t, motion) {
  const r = a.role, u = a.upper, [L, R] = a.arms;
  u.position.set(0, r.legH, 0); u.rotation.set(0, 0, 0); u.scale.set(1, 1, 1);
  a.eyes.position.set(0, a.eyeY, r.D / 2 + .02); a.eyes.scale.set(1, 1, 1);
  L.rotation.set(0, 0, 0); R.rotation.set(0, 0, 0);
  a.legs.forEach(l => l.rotation.set(0, 0, 0));
  a.root.position.y = 0;
  if (motion === 'static') return;
  const p = t + a.phase;
  const breathe = () => { u.position.y += Math.sin(p * 2) * .06; u.scale.y = 1 + Math.sin(p * 2) * .012; };

  if (motion === 'idle') {
    breathe();
    const s = Math.sin(p * .45);
    a.eyes.position.x = s > .85 ? .22 : s < -.85 ? -.22 : 0;
  } else if (motion === 'work') {
    if (r.work === 'point') {
      R.rotation.z = .95 + Math.sin(p * 3) * .12;
      L.rotation.z = Math.sin(p * 2) * .05;
      u.rotation.y = -.12;
      u.position.y += Math.abs(Math.sin(p * 3)) * .08;
    } else if (r.work === 'scan') {
      u.rotation.y = Math.sin(p * 1.4) * .32;
      a.eyes.position.x = Math.sin(p * 1.4) * .22;
      u.position.y += Math.sin(p * 2.8) * .04;
    } else {
      const k = Math.sin(p * 16);
      L.rotation.z = .1 + Math.max(0, k) * .22;
      R.rotation.z = -(.1 + Math.max(0, -k) * .22);
      u.rotation.x = .07;
      a.eyes.position.y -= .15;
      u.position.y += Math.abs(Math.sin(p * 8)) * .03;
    }
  } else if (motion === 'walk') {
    const w = p * 7, s = Math.sin(w) * .45;
    a.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? -s : s); });
    u.position.y += Math.abs(Math.sin(w)) * .18;
    u.rotation.z = Math.sin(w) * .03;
    L.rotation.z = Math.sin(w) * .15; R.rotation.z = Math.sin(w) * .15;
  } else if (motion === 'think') {
    breathe();
    u.rotation.z = Math.sin(p * 1.1) * .07;
    a.eyes.position.y += .28;
    a.eyes.position.x = Math.sin(p * .7) * .22;
  } else if (motion === 'error') {
    const q = p % 2.4;
    if (q < .45) u.position.x = Math.sin(q * 70) * .14;
    a.eyes.scale.y = .45;
    L.rotation.z = .28; R.rotation.z = -.28;
    u.position.y -= .06;
  } else if (motion === 'done') {
    const q = p % 2.6;
    if (q < .6) {
      const s = Math.sin(q / .6 * Math.PI);
      a.root.position.y = s * 1.1;
      L.rotation.z = -.6 * s; R.rotation.z = .6 * s;
    } else if (q < .75) {
      const s = Math.sin((q - .6) / .15 * Math.PI);
      u.scale.y = 1 - s * .06; u.scale.x = u.scale.z = 1 + s * .03;
    } else breathe();
  }
  if (t > a.nextBlink) { a.blinkEnd = t + .13; a.nextBlink = t + 2.5 + Math.random() * 3.5; }
  if (t < a.blinkEnd) a.eyes.scale.y = .1;
}

// Floating status glyph (scene-only, not part of exported character)
export function buildStatusIndicator() {
  const g = new THREE.Group(); g.name = 'status';
  const mats = {};
  for (const k of STATUS_ORDER) mats[k] = new THREE.MeshStandardMaterial({ color: STATUS[k].color, emissive: STATUS[k].color, emissiveIntensity: .3, roughness: .5 });
  const c = (k, w, h, d, x, y) => { const m = new THREE.Mesh(softBox(w, h, d), mats[k]); m.position.set(x, y, 0); return m; };
  const parts = {};
  parts.working = new THREE.Group(); parts.working.add(c('working', .95, .95, .95, 0, 0));
  parts.thinking = new THREE.Group(); [-.8, 0, .8].forEach(x => parts.thinking.add(c('thinking', .5, .5, .5, x, 0)));
  parts.idle = new THREE.Group(); [-.4, .4].forEach(x => parts.idle.add(c('idle', .42, 1.2, .42, x, 0)));
  parts.error = new THREE.Group(); parts.error.add(c('error', .5, 1.2, .5, 0, .35)); parts.error.add(c('error', .5, .5, .5, 0, -.75));
  parts.done = new THREE.Group(); [[-2, 0], [-1, -1], [0, 0], [1, 1], [2, 2]].forEach(([x, y]) => parts.done.add(c('done', .5, .5, .5, x * .42, y * .42 - .2)));
  for (const k in parts) g.add(parts[k]);
  let cur = 'working';
  return {
    group: g,
    set(s) { cur = s; for (const k in parts) parts[k].visible = k === s; },
    update(t) {
      const p = parts[cur];
      p.position.y = Math.sin(t * 2) * .15;
      if (cur === 'working') { p.children[0].rotation.y = t * 2.2; p.children[0].rotation.x = t * 1.3; }
      if (cur === 'thinking') p.children.forEach((m, i) => { m.position.y = Math.max(0, Math.sin(t * 5 - i * .9)) * .45; });
      if (cur === 'error') { const s = 1 + Math.max(0, Math.sin(t * 6)) * .12; p.scale.setScalar(s); }
      if (cur === 'done') p.rotation.y = Math.sin(t * 1.5) * .3;
    },
  };
}
