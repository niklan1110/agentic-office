// The Agent Office screen: the 3D office, its UI overlay, the errand AI and the meeting
// flow, ported from the design handoff. Statuses come from the events the agent-office
// plugin sends; tasks typed here go to the office server, which hands them to a session.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROLES, STATUS, STATUS_ORDER, CHARACTER_STYLES, buildAgent, animateAgent, buildStatusIndicator } from './agents.js';
import { apply, createState, findRole, roleOfAgent, roleStats, roleStatuses, tokens } from './model.js';
import { buildGraph, routeAt, routeBetween } from './nav.js';
import { buildOffice3, officeMap, LAYOUTS, PAINTABLE, ITEM_NAMES, makeItem } from './office-v3.js';
import { validate } from './protocol.js';
import { ROLE_IDS, setTeamCharacters } from './roles.js';
import { THEMES, applyTheme, themeById } from './themes.js';

if (ROLES.map((r) => r.id).join() !== ROLE_IDS.join()) throw new Error('roles.js and agents.js disagree about the roles');

const params = new URLSearchParams(location.search);
// ?speed=N runs the office N times faster (1 to 50): for testing on slow machines.
const SPEED_UP = Math.min(50, Math.max(1, Number(params.get('speed')) || 1));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BG = '#EFE6DA';
const host = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
const SMALL = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, SMALL ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 200, 380);
const camera = new THREE.PerspectiveCamera(30, 1, 1, 1200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-5, 0, -4);
controls.enableDamping = true;
controls.maxPolarAngle = 1.3;
controls.minDistance = 25;
controls.maxDistance = 300;

const hemi = new THREE.HemisphereLight(0xfff1dd, 0xb49a80, 1.0);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe2bf, 1.9);
key.position.set(55, 95, 70);
key.castShadow = true;
key.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 320 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
key.shadow.radius = 4;
scene.add(key);
const win = new THREE.DirectionalLight(0xfff4e2, 0.45);
win.position.set(-10, 40, -90);
scene.add(win);

// The office's look (theme, layout, colours) is read before the office is built:
// the layout decides where the desks and walls go.
const look = await fetch('api/office', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const MAP = officeMap(look.layout);
const { NODES, EDGES, SPOTS, ERRANDS } = MAP;
const office = buildOffice3(scene, MAP);

// Navigation
const adj = buildGraph(NODES, EDGES);
const route = (from, to) => routeBetween(SPOTS, NODES, adj, from, to);

const AUTO = { working: 'work', thinking: 'think', idle: 'idle', error: 'error', done: 'done' };
const home = (a) => 'home_' + a.role.id;

// The launched team (GET /team, and a `team` event on each launch): the agents at each
// character's desk. Characters no agent uses stay out of sight unless something runs as them.
let crew = null;
let onDesk = {}; // character → its agents
const nameOf = (a) => {
  if (a.role.id === 'manager') return crew?.manager.name || a.role.name;
  const names = (onDesk[a.role.id] ?? []).map((x) => x.name);
  if (!names.length) return a.role.name;
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}` : names.join(' · ');
};
const onTeam = (a) => !crew || a.role.id === 'manager' || Boolean(onDesk[a.role.id]?.length);

let viewOnly = false; // opened from a phone: watch only
let state = createState();
let autoMeeting = true;
let paused = false;
let selected = -1;
let latest = roleStatuses(state, Date.now());
let lastLive = {};

const agents = ROLES.map((r, i) => {
  const a = buildAgent(r, look.characters);
  a.idx = i;
  a.at = 'home_' + r.id;
  const sp = SPOTS[a.at];
  a.root.position.set(sp.p[0], 0, sp.p[1]);
  a.root.rotation.y = sp.rot;
  a.root.traverse((o) => { if (o.isMesh) o.userData.agent = i; });
  scene.add(a.root);
  a.queue = [];
  a.cur = null;
  a.idleT = 1 + Math.random() * 4;
  a.activity = 'At desk';
  a.carry = null;
  a.status = 'idle';
  a.ind = buildStatusIndicator();
  a.ind.group.userData.keepColor = true;
  a.ind.set(a.status);
  scene.add(a.ind.group);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = a.tagText = r.name;
  $('tags').appendChild(tag);
  a.tag = tag;

  return a;
});
const mgr = agents.find((a) => a.role.id === 'manager');
const reserved = {};
const act = (a, t) => { if (a.activity !== t) { a.activity = t; renderList(); } };

function begin(a, st) {
  a.cur = { ...st };
  if (st.go) {
    if (st.go === a.at) { a.cur = null; return; }
    a.route = route(a.at, st.go);
    a.s = 0;
  } else if (st.pick) {
    const it = makeItem(st.pick);
    const A = a.role.arm;
    it.position.set(A.len - 0.35, A.h / 2 + (A.type === 'hand' ? 1.25 : 0), 0);
    a.arms[1].add(it);
    a.carry = it;
    a.cur = null;
  } else if (st.drop) {
    if (a.carry) {
      const d = office.desks[a.role.id];
      a.carry.parent.remove(a.carry);
      if (d) {
        const slot = d.slots[d.idx++ % d.slots.length];
        if (slot.item) scene.remove(slot.item);
        a.carry.position.copy(slot.pos);
        a.carry.rotation.set(0, Math.random() * 0.8 - 0.4, 0);
        scene.add(a.carry);
        slot.item = a.carry;
      }
      a.carry = null;
    }
    a.cur = null;
  } else if (st.fn) {
    st.fn();
    a.cur = null;
  }
}
function release(a) { for (const k in reserved) if (reserved[k] === a.idx) delete reserved[k]; }
function interrupt(a, plan) {
  release(a);
  if (a.cur && a.cur.go) a.queue = plan;
  else { a.cur = null; a.queue = plan; }
}
function planErrand(a) {
  const opts = ERRANDS.filter(([s]) => reserved[s] === undefined);
  if (!opts.length) return;
  let r = Math.random() * opts.reduce((n, [, w]) => n + w, 0);
  let spot = opts[0][0];
  for (const [s, w] of opts) { if ((r -= w) <= 0) { spot = s; break; } }
  const S = SPOTS[spot];
  reserved[spot] = a.idx;
  const plan = [{ fn: () => act(a, S.label) }, { go: spot }, { wait: S.wait, anim: S.anim }];
  if (S.item) plan.push({ pick: S.item });
  plan.push({ fn: () => { release(a); act(a, S.item ? 'Bringing ' + ITEM_NAMES[S.item] + ' back' : 'Heading back to desk'); } }, { go: home(a) });
  if (S.item) plan.push({ drop: true });
  plan.push({ fn: () => act(a, 'At desk') });
  a.queue = plan;
}

// ---- Live statuses: what each role is doing, from the events -------------------------------------
const liveActivity = (d) => ({
  working: d.tool ? `Using ${d.tool}` : 'Working',
  thinking: 'Thinking it through',
  error: 'Blocked',
  done: 'Finished its task',
  idle: 'At desk',
})[d.status];
const settledStatus = (a) => latest[a.role.id].status;
const settledActivity = (a) => liveActivity(latest[a.role.id]);

// Back to the desk when the role has work to do.
function sendHome(a) {
  if (phase !== 'none') return;
  if (a.at === home(a) && !a.cur?.go && !a.queue.length) return;
  const plan = [{ go: home(a) }];
  if (a.carry) plan.push({ drop: true });
  plan.push({ fn: () => act(a, settledActivity(a)) });
  interrupt(a, plan);
}
function syncLive() {
  latest = roleStatuses(state, Date.now());
  for (const a of agents) {
    const d = latest[a.role.id];
    const label = nameOf(a) + (d.running > 1 ? ` ×${d.running}` : '');
    if (a.tagText !== label) { a.tagText = label; a.tag.textContent = label; }
    const hidden = !onTeam(a) && d.status === 'idle' && !d.running;
    if (a.hidden !== hidden) { a.hidden = hidden; a.root.visible = !hidden; a.ind.group.visible = !hidden; if (hidden && selected === a.idx) select(-1); }
    if (phase !== 'none') continue;
    const sig = `${d.status}|${d.tool}`;
    if (lastLive[a.role.id] === sig) continue;
    lastLive[a.role.id] = sig;
    if (a.status !== d.status) {
      setStatus(a.idx, d.status, true);
      if (d.status !== 'idle') sendHome(a);
    }
    if (d.status !== 'idle' || a.at === home(a)) act(a, liveActivity(d));
  }
  renderList();
}
setInterval(syncLive, 400);

// ---- Meeting flow --------------------------------------------------------------------------------
let phase = 'none', task = '', phaseT = 0;
function callMeeting(text) {
  if (phase !== 'none') return;
  task = text;
  phase = 'gather';
  phaseT = 0;
  agents.forEach((a) => {
    a.arrived = false;
    const isM = a === mgr;
    const tgt = isM ? 'stage' : 'seat_' + a.role.id;
    interrupt(a, [{ wait: isM ? 0 : 1.6 + Math.random() * 1.6 }, { fn: () => act(a, isM ? 'Calling everyone in' : 'Heading to the meeting') }, { go: tgt }, { fn: () => { a.arrived = true; act(a, isM ? 'Waiting for the team' : 'In the meeting'); } }]);
  });
  renderTask();
}
function tickMeeting(dt) {
  phaseT += dt;
  if (phase === 'gather' && (agents.every((a) => a.arrived) || phaseT > 45)) {
    phase = 'brief';
    phaseT = 0;
    agents.forEach((a) => { setStatus(a.idx, a === mgr ? 'working' : 'thinking', true); act(a, a === mgr ? 'Briefing the team' : 'Listening'); });
    renderTask();
    renderList();
  } else if (phase === 'brief' && phaseT > 9) {
    phase = 'disperse';
    phaseT = 0;
    agents.forEach((a, i) => {
      a.arrived = false;
      const plan = [{ wait: a === mgr ? 2 : 0.2 + i * 0.3 }, { fn: () => act(a, 'Heading back to desk') }, { go: home(a) }];
      if (a.carry) plan.push({ drop: true });
      plan.push({ fn: () => { a.arrived = true; latest = roleStatuses(state, Date.now()); setStatus(a.idx, settledStatus(a)); act(a, settledActivity(a)); } });
      interrupt(a, plan);
    });
    renderTask();
  } else if (phase === 'disperse' && agents.every((a) => a.arrived)) {
    phase = 'none';
    lastLive = {};
    renderTask();
  }
}

// ---- UI ------------------------------------------------------------------------------------------
const listEl = $('list');
function renderList() {
  const stats = roleStats(state);
  listEl.innerHTML = '';
  agents.forEach((a, i) => {
    if (a.hidden) return;
    const r = a.role, s = STATUS[a.status], st = stats[r.id];
    const desk = a.role.id === 'manager' ? (crew ? [{ id: 'manager', name: crew.manager.name, skills: crew.manager.skills }] : []) : (onDesk[r.id] ?? []);
    const skillsHtml = desk.length
      ? desk.map((x) => `<div class="meta"><b>${esc(x.name)}</b>${x.id !== 'manager' ? ` (<code>${esc(x.id)}</code>)` : ''}: ${x.skills.length ? x.skills.map(esc).join(', ') : 'no skills'}</div>`).join('')
      : '<div class="meta">No agent on the team uses this character.</div>';
    const live = st.tools || st.input || st.output
      ? `<div class="meta">This session: ${st.agents ? st.agents + (st.agents > 1 ? ' agents' : ' agent') + ', ' : ''}${st.tools} tool calls, ${tokens(st.input)} in / ${tokens(st.output)} out.</div>` : '';
    const row = document.createElement('div');
    row.className = 'row' + (i === selected ? ' sel' : '');
    row.innerHTML = `<div class="row-main"><div class="chip" style="background:${r.color}"></div><div class="nm"><b>${esc(nameOf(a))}</b><span>${esc(a.activity)}</span></div><div class="st"><span class="dot" style="background:${s.color}"></span>${s.label}</div></div>
      <div class="detail"><div class="pick">${STATUS_ORDER.map((k) => `<button data-s="${k}" class="${k === a.status ? 'on' : ''}"><span class="dot" style="background:${STATUS[k].color}"></span>${STATUS[k].label}</button>`).join('')}</div>
      <div class="meta">${esc(r.role)}. ${esc(r.feature)}. Set to Idle and it wanders off for water, coffee or a break.</div>${live}
      ${skillsHtml}<a href="setup.html#agents">Edit the team →</a><a href="characters.html#${r.id}">Open in character sheet →</a></div>`;
    row.querySelector('.row-main').onclick = () => select(i === selected ? -1 : i);
    row.querySelectorAll('.pick button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); setStatus(i, b.dataset.s); }; });
    listEl.appendChild(row);
  });
  const c = {};
  const shown = agents.filter((a) => !a.hidden);
  shown.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1; });
  const people = crew ? crew.agents.length + 1 : shown.length;
  $('summary').textContent = `${people} on the team · ${c.working || 0} working` + (c.idle ? ` · ${c.idle} on break` : '') + (c.error ? ` · ${c.error} blocked` : '');
  $('count').textContent = people;
}
const PHASE = { gather: ['#E5A93B', 'Gathering in the conference room'], brief: ['#E5A93B', 'Manager is briefing the team'], disperse: ['#4C8DF6', 'Heading back to desks'], none: ['#4C8DF6', 'In progress'] };
function renderTask() {
  const el = $('taskcard');
  const note = taskNote();
  const noteHtml = note ? `<div class="note">${esc(note)}</div>` : '';
  if (!task) el.innerHTML = '<div class="lbl">Current task</div><div class="txt empty">None yet. Type a task above: the manager calls the team into the conference room, and Claude starts on it.</div>' + noteHtml;
  else {
    let [c, l] = PHASE[phase];
    if (phase === 'none' && !state.agents.main.running && state.task) [c, l] = ['#3FAE6A', 'Finished'];
    el.innerHTML = `<div class="lbl"><span class="dot" style="background:${c}"></span>${l}</div><div class="txt">${esc(task)}</div>` + noteHtml;
  }
  $('taskBtn').disabled = phase !== 'none';
}
function setStatus(i, s, quiet) { agents[i].status = s; agents[i].ind.set(s); if (!quiet) renderList(); }
function select(i) { selected = i; agents.forEach((a, j) => a.tag.classList.toggle('sel', j === i)); ring.visible = i >= 0; renderList(); }

// A task typed here calls the meeting and goes to the office server, which holds it until a
// Claude Code session of the project (with the agent-office plugin) takes it and starts working on it.
$('taskForm').onsubmit = (e) => {
  e.preventDefault();
  const inp = $('taskInput');
  const text = inp.value.trim();
  if (!text || phase !== 'none') return;
  inp.value = '';
  callMeeting(text);
  sendToSession(text);
};

// What the server says about sessions and tasks (the `status` event): the source of
// truth for "connected" and for where a task typed here stands.
let link = { sessions: [], tasks: [], connected: 0, project: '', version: '' };
let sentId = ''; // the last task sent from this page
let sendNote = '';
let serverUp = false;

async function sendToSession(text) {
  sendNote = 'Sending…';
  renderTask();
  try {
    const res = await fetch('api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    sendNote = res.ok ? '' : `Not sent: ${(await res.text()) || res.statusText}.`;
    if (res.ok) sentId = (await res.json()).id;
  } catch {
    sendNote = 'Not sent: the office server is not running. Start it in your project with npx github:niklan1110/agentic-office.';
  }
  renderTask();
}

function taskNote() {
  if (sendNote) return sendNote;
  const t = link.tasks.find((x) => x.id === sentId);
  if (!t) return '';
  if (t.state === 'delivered') return 'Your Claude Code session took it and is working on it.';
  if (t.state === 'failed') return `Not started: ${t.reason}.`;
  if (t.state === 'leased') return 'Handing it to your Claude Code session…';
  return link.connected ? 'Waiting for your session to pick it up…' : 'Waiting: no Claude Code session of this project is connected. Open one with the agent-office plugin and it starts this task.';
}
$('legend').innerHTML = STATUS_ORDER.map((k) => `<div><span class="dot" style="background:${STATUS[k].color}"></span>${STATUS[k].label}</div>`).join('');
document.querySelectorAll('#motion button').forEach((b) => { b.onclick = () => {
  paused = b.dataset.m === 'static';
  document.querySelectorAll('#motion button').forEach((x) => x.classList.toggle('on', x === b));
}; });
const simBtn = $('sim');
const meetBtn = $('meet');
meetBtn.onclick = () => { autoMeeting = !autoMeeting; meetBtn.classList.toggle('on', autoMeeting); };

const ringMat = new THREE.MeshBasicMaterial({ color: '#5B5BD6', transparent: true, opacity: 0.85 });
const ring = new THREE.Group();
[[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([sx, sz]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx ? 0.35 : 10, 0.06, sz ? 0.35 : 8), ringMat);
  m.position.set(sx * 5, 0.12, sz * 4);
  ring.add(m);
});
ring.visible = false;
ring.userData.keepColor = true;
scene.add(ring);

const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(agents.filter((a) => !a.hidden).map((a) => a.root), true).find((h) => h.object.userData.agent !== undefined);
  select(hit ? hit.object.userData.agent : -1);
});

const BASE_OFF = new THREE.Vector3(24, 70, 92);
const PORTRAIT_OFF = new THREE.Vector3(80, 100, -12);
function resize() {
  const w = innerWidth, h = innerHeight, p = w > 900 && !document.body.classList.contains('clean') ? 296 : 0;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = 30;
  if (p) camera.setViewOffset(w + p, h, p, 0, w, h); else camera.clearViewOffset();
  // A tall screen (a phone) looks along the office's long side, so the whole floor fits.
  const A = (w - p) / h, tall = A < 0.85;
  const off = tall ? PORTRAIT_OFF : BASE_OFF;
  const f = tall ? Math.max(0.75, Math.pow(1.02 / A, 0.9)) : Math.max(0.8, Math.pow(1.7 / A, 0.85));
  camera.position.copy(controls.target).addScaledVector(off, f);
  camera.updateProjectionMatrix();
  controls.update();
}
addEventListener('resize', resize);
resize();

// ---- Speech bubbles for messages between agents --------------------------------------------------
const chats = [];
const v = new THREE.Vector3();
const place = (el, x, y, z) => { v.set(x, y, z).project(camera); el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`; return v.z <= 1; };
function speak(ev) {
  const fromRole = roleOfAgent(state, ev.from);
  const toRole = findRole(state, ev.to);
  const from = agents.find((a) => a.role.id === fromRole);
  if (!from) return;
  const to = agents.find((a) => a.role.id === toRole);
  const el = document.createElement('div');
  el.className = 'bubble chat';
  el.style.display = 'block';
  el.innerHTML = `<small>${esc(nameOf(from))}${to && to !== from ? ' → ' + esc(nameOf(to)) : ''}</small><span>${esc(ev.text || 'sent a message')}</span>`;
  document.body.appendChild(el);
  chats.push({ el, a: from, until: performance.now() + 5500 });
  while (chats.length > 3) chats.shift().el.remove();
}

// ---- Events --------------------------------------------------------------------------------------
function receive(raw) {
  const checked = validate(raw);
  if (checked.error) return;
  const ev = checked.value;
  remember(ev);
  state = apply(state, ev);
  if (ev.type === 'task') {
    if (autoMeeting && phase === 'none') callMeeting(ev.text || 'A new task came in');
    else if (!task || phase === 'none') { task = ev.text || 'A new task came in'; }
    renderTask();
  }
  if (ev.type === 'message') speak(ev);
  if (ev.type === 'done' && ev.agent === 'main') renderTask();
  syncLive();
}

const connEl = $('conn');
const setConn = (text, cls) => { connEl.textContent = text; connEl.className = 'conn ' + (cls || ''); };
let source = null;
let stopDemo = null;

function connect() {
  const live = new EventSource('api/stream');
  source = live;
  live.addEventListener('backlog', (message) => {
    history = [];
    for (const raw of JSON.parse(message.data)) {
      const checked = validate(raw);
      if (!checked.error) remember(checked.value);
    }
    replay();
    if (state.task) task = state.task.text || task;
    lastLive = {};
    serverUp = true;
    updateConn();
    renderTask();
    syncLive();
  });
  live.addEventListener('status', (message) => {
    try { link = JSON.parse(message.data); } catch { return; }
    serverUp = true;
    updateConn();
    renderTask();
  });
  live.addEventListener('team', (message) => {
    try { setCrew(JSON.parse(message.data)); } catch { /* not a team */ }
  });
  live.onmessage = (message) => {
    try { receive(JSON.parse(message.data)); } catch { /* not an event */ }
  };
  live.onerror = () => {
    serverUp = false;
    updateConn();
  };
}

// The chip says whether a Claude Code session of this project is connected; a click
// opens the details: each session the server has heard from, and what to do.
const shortPath = (p) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
function updateConn() {
  if (!serverUp) setConn('server stopped · reconnecting…', 'off');
  else if (link.connected) setConn(`live · ${link.connected === 1 ? 'Claude session connected' : `${link.connected} Claude sessions connected`}`, 'ok');
  else setConn('live · no Claude session connected', 'wait');
  renderConnPanel();
}
function renderConnPanel() {
  const panel = $('connPanel');
  if (panel.hidden) return;
  const now = Date.now();
  const rows = link.sessions.map((s) => {
    const why = !s.connected ? `quiet for ${Math.round((now - s.seenAt) / 1000)} s` : !s.match ? `another project: ${shortPath(s.project)}` : s.version && s.version !== link.version ? `plugin ${s.version}, office ${link.version}: update one` : 'connected';
    const cls = s.connected && s.match ? 'ok' : s.connected ? 'warn' : '';
    return `<li class="${cls}"><b>${esc(shortPath(s.project) || 'unknown project')}</b><span>plugin ${esc(s.version || '?')} · ${esc(why)}</span></li>`;
  }).join('');
  const fix = !serverUp
    ? 'The office server stopped. Start it again in your project: <code>npx github:niklan1110/agentic-office</code>. This page reconnects by itself.'
    : link.connected
      ? 'Tasks you type above go to the connected session.'
      : `No Claude Code session of <code>${esc(shortPath(link.project))}</code> is connected. Open Claude Code in that folder with the agentic-office plugin installed, and it shows up here within seconds. In a session, <code>/office</code> says what it sees. In a terminal, <code>npx github:niklan1110/agentic-office doctor</code> checks everything.`;
  panel.innerHTML = `<h2>Connection</h2><p class="meta">Project <code>${esc(link.project)}</code> · office ${esc(link.version)}</p>
    ${rows ? `<ul>${rows}</ul>` : '<p class="meta">No session has checked in yet.</p>'}<p class="fix">${fix}</p>`;
}
connEl.onclick = () => {
  const panel = $('connPanel');
  panel.hidden = !panel.hidden;
  connEl.setAttribute('aria-expanded', String(!panel.hidden));
  renderConnPanel();
};
setInterval(renderConnPanel, 2000);

// The events seen so far, so the state can be worked out again when the team (and so
// which character each agent type has) changes.
let history = [];
function remember(ev) { history.push(ev); if (history.length > 500) history.shift(); }
function replay() { state = history.reduce(apply, createState()); }

function setCrew(team) {
  crew = team && Array.isArray(team.agents) ? team : null;
  onDesk = {};
  for (const x of crew?.agents ?? []) (onDesk[x.character] ??= []).push(x);
  setTeamCharacters(Object.fromEntries((crew?.agents ?? []).map((x) => [x.id, x.character])));
  replay();
  for (const a of agents) a.tagText = ''; // syncLive redraws each tag with the new name
  lastLive = {};
  syncLive();
}
fetch('api/team', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCrew(d.team)).catch(() => {});

// Test and debugging handle.
window.__agentOffice = { agents, receive, callMeeting, get state() { return state; }, get phase() { return phase; }, get task() { return task; }, get link() { return link; } };

renderList();
renderTask();
setConn('connecting…');
connect();

// ---- Look: layout, theme and custom colours ---------------------------------------------------------
let theme = 'studio';
let colors = { ...(look.colors ?? {}) };
const COLOR_LABELS = { wall: 'Walls', floor: 'Floor', partition: 'Partitions' };
function setTheme(id, newColors = colors) {
  theme = themeById(id).id;
  colors = { ...newColors };
  applyTheme(THREE, { scene, hemi, key, win }, theme, colors);
  renderThemes();
}
const saveLook = (change) => fetch('api/office', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(change) }).catch(() => {});
function renderThemes() {
  const el = $('themeList');
  if (!el) return;
  const pick = (kind, id, on, name, blurb, swatch) => `<button type="button" role="menuitemradio" aria-checked="${on}" data-${kind}="${id}">
    ${swatch}<span><b>${esc(name)}</b><small>${esc(blurb)}</small></span></button>`;
  el.innerHTML = `<h3>Characters</h3>${CHARACTER_STYLES.map((c) => pick('s', c.id, c.id === (look.characters ?? 'classic'), c.name, c.blurb, `<span class="sty sty-${c.id}" aria-hidden="true"></span>`)).join('')}
    <h3>Layout</h3>${LAYOUTS.map((l) => pick('l', l.id, l.id === MAP.layout, l.name, l.blurb, `<span class="lay lay-${l.id}" aria-hidden="true"></span>`)).join('')}
    <h3>Colours</h3>${THEMES.map((t) => pick('t', t.id, t.id === theme, t.name, t.blurb, `<span class="sw3" aria-hidden="true">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`)).join('')}
    <h3>Your own colours</h3><div class="custom">${Object.keys(PAINTABLE).map((k) => `<label><input type="color" data-c="${k}" value="${colors[k] ?? PAINTABLE[k]}"><span>${COLOR_LABELS[k]}</span></label>`).join('')}
    <button type="button" class="linkish" id="resetColors" ${Object.keys(colors).length ? '' : 'disabled'}>Use the theme's</button></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { setTheme(b.dataset.t); saveLook({ theme: b.dataset.t }); }; });
  el.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => chooseLayout(b.dataset.l); });
  el.querySelectorAll('[data-s]').forEach((b) => {
    b.onclick = async () => { if (b.dataset.s === (look.characters ?? 'classic')) return; await saveLook({ characters: b.dataset.s }); location.reload(); };
  });
  el.querySelectorAll('input[data-c]').forEach((inp) => {
    inp.oninput = () => { colors = { ...colors, [inp.dataset.c]: inp.value }; applyTheme(THREE, { scene, hemi, key, win }, theme, colors); };
    inp.onchange = () => { saveLook({ colors: { [inp.dataset.c]: inp.value } }); renderThemes(); };
  });
  $('resetColors').onclick = () => { setTheme(theme, {}); saveLook({ colors: { wall: null, floor: null, partition: null } }); };
}
// A new layout means a new floor plan: save it, and the page rebuilds (every open page does).
async function chooseLayout(id) {
  if (id === MAP.layout) return;
  await saveLook({ layout: id });
  location.reload();
}
$('themeBtn').onclick = () => {
  const menu = $('themeMenu');
  $('phoneMenu').hidden = true;
  menu.hidden = !menu.hidden;
  $('themeBtn').setAttribute('aria-expanded', String(!menu.hidden));
  if (!menu.hidden) menu.querySelector('[aria-checked="true"]')?.focus();
};
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('themeMenu').hidden) { $('themeMenu').hidden = true; $('themeBtn').focus(); } });
setTheme(look.theme ?? 'studio', look.colors ?? {});
source?.addEventListener('office', (m) => {
  let s;
  try { s = JSON.parse(m.data); } catch { return; }
  if ((s.layout && s.layout !== MAP.layout) || (s.characters && s.characters !== (look.characters ?? 'classic'))) return location.reload();
  setTheme(s.theme, s.colors ?? {});
});

// ---- View on phone: a watch-only link on the home network, by QR code ------------------------------
async function renderPhone(change) {
  const menu = $('phoneMenu');
  let s = { on: false };
  try {
    const res = change === undefined ? await fetch('api/phone', { cache: 'no-store' }) : await fetch('api/phone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: change }) });
    if (!res.ok) throw new Error(await res.text());
    s = await res.json();
  } catch (err) {
    menu.innerHTML = `<p class="phone-note err">Could not turn it on: ${esc(err.message || err)}</p>`;
    return;
  }
  menu.innerHTML = s.on
    ? `<h2>Watch from your phone</h2>
       <div class="qr">${s.qr}</div>
       <p class="phone-note">Scan with your phone's camera on the same Wi-Fi. It can watch the office, not change anything. Windows may ask once to allow Node on private networks: allow it.</p>
       <p class="phone-url"><code>${esc(s.url.replace(/\?k=.*/, '?k=…'))}</code></p>
       <button class="btn small" id="phoneOff" type="button">Turn off</button>`
    : `<h2>Watch from your phone</h2>
       <p class="phone-note">Opens a watch-only link on your home Wi-Fi, behind a secret QR code. Nothing on the phone can change your team or reach Claude Code. Off until you turn it on, and off again when the office stops.</p>
       <button class="btn small primary-ish" id="phoneOn" type="button">Turn on and show QR code</button>`;
  $('phoneOn')?.addEventListener('click', () => renderPhone(true));
  $('phoneOff')?.addEventListener('click', () => renderPhone(false));
}
$('phoneBtn').onclick = () => {
  const menu = $('phoneMenu');
  menu.hidden = !menu.hidden;
  $('phoneBtn').setAttribute('aria-expanded', String(!menu.hidden));
  $('themeMenu').hidden = true;
  if (!menu.hidden) renderPhone();
};
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('phoneMenu').hidden) { $('phoneMenu').hidden = true; $('phoneBtn').focus(); } });

// ---- View only (opened from a phone) -------------------------------------------------------------
// The phone link serves this same page; the server says so, and the controls that change things go.
fetch('api/hello', { cache: 'no-store' }).then((r) => r.json()).then((h) => {
  $('projectName').textContent = h.project ? h.project.split(/[\\/]/).filter(Boolean).pop() : '';
  document.title = `${$('projectName').textContent || 'Agent Office'} · Agent Office`;
  if (!h.viewOnly) return;
  viewOnly = true;
  document.body.classList.add('view-only');
  resize();
}).catch(() => {});

// ---- Clean view for screenshots: H hides the interface, ?clean starts that way ----------------------
const cleanHint = Object.assign(document.createElement('div'), { className: 'cleanhint', textContent: 'Press H to show the controls again' });
document.body.appendChild(cleanHint);
function setClean(on) {
  document.body.classList.toggle('clean', on);
  resize();
  cleanHint.classList.toggle('show', on);
  if (on) setTimeout(() => cleanHint.classList.remove('show'), 1800);
}
if (params.has('clean')) { setClean(true); cleanHint.classList.remove('show'); }
addEventListener('keydown', (e) => {
  if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, textarea, select')) setClean(!document.body.classList.contains('clean'));
});

// ---- Phone layout: the agent list as a sheet that slides up --------------------------------------
$('panelHead').onclick = (e) => {
  if (innerWidth > 900 || e.target.closest('a')) return;
  const panel = $('panel');
  panel.classList.toggle('open');
  $('panelHead').setAttribute('aria-expanded', String(panel.classList.contains('open')));
};

// Nothing to draw while the tab is hidden: saves the battery and the fan.
document.addEventListener('visibilitychange', () => { renderer.setAnimationLoop(document.hidden ? null : frame); if (!document.hidden) clock.getDelta(); });

// ---- Frame loop ----------------------------------------------------------------------------------
const clock = new THREE.Clock();
const lerpAngle = (a, b, k) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * k;
const SPEED = 7.5;
const bubble = $('bubble'), bubbleTxt = bubble.querySelector('span');

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * SPEED_UP, t = clock.elapsedTime;
  const k = 1 - Math.exp(-dt * 9);
  if (!paused && phase !== 'none') tickMeeting(dt);
  agents.forEach((a) => {
    if (!paused) {
      while (!a.cur && a.queue.length) begin(a, a.queue.shift());
      if (a.cur?.go) {
        a.s = Math.min(a.route.len, a.s + SPEED * dt);
        const p = routeAt(a.route, a.s);
        a.root.position.x = p.x;
        a.root.position.z = p.z;
        if (p.dx * p.dx + p.dz * p.dz > 0) a.root.rotation.y = lerpAngle(a.root.rotation.y, Math.atan2(p.dx, p.dz), k);
        if (a.s >= a.route.len) { a.at = a.cur.go; a.cur = null; }
      } else {
        if (a.cur?.wait !== undefined) { a.cur.wait -= dt; if (a.cur.wait <= 0) a.cur = null; }
        a.root.rotation.y = lerpAngle(a.root.rotation.y, SPOTS[a.at].rot, k);
      }
      if (phase === 'none' && !a.cur && !a.queue.length && a.at === home(a) && a.status === 'idle') {
        a.idleT -= dt;
        if (a.idleT <= 0) { planErrand(a); a.idleT = 5 + Math.random() * 6; }
      }
    }
    let m;
    if (paused) m = 'static';
    else if (a.cur?.go) m = 'walk';
    else if (a.cur?.wait !== undefined && a.cur.anim) m = a.cur.anim;
    else if (phase === 'gather' && a.arrived) m = 'idle';
    else m = AUTO[a.status];
    animateAgent(a, t, m);
    a.ind.group.position.set(a.root.position.x, a.top + 2.6 + a.root.position.y, a.root.position.z);
    a.ind.group.quaternion.copy(camera.quaternion);
    a.ind.update(paused ? 0 : t);
    const inMtg = (phase === 'gather' || phase === 'brief') && (a.at === 'stage' || a.at.startsWith('seat_')) && !a.cur?.go && a.idx !== selected;
    a.tag.style.display = place(a.tag, a.root.position.x, a.top + 5.2 + a.root.position.y, a.root.position.z) && !inMtg && !a.hidden ? '' : 'none';
  });
  const now = performance.now();
  for (let i = chats.length - 1; i >= 0; i--) {
    const c = chats[i];
    if (now > c.until) { c.el.remove(); chats.splice(i, 1); continue; }
    const p = c.a.root.position;
    c.el.style.display = place(c.el, p.x, c.a.top + 9 + p.y, p.z) ? 'block' : 'none';
  }
  const showB = (phase === 'gather' && mgr.arrived) || phase === 'brief';
  bubble.style.display = showB ? 'block' : 'none';
  if (showB) {
    bubbleTxt.textContent = phase === 'brief' ? task : 'Everyone, conference room please.';
    place(bubble, mgr.root.position.x, mgr.top + 8.5, mgr.root.position.z);
    mgr.tag.style.display = 'none';
  }
  const on = phase === 'brief' ? 1 : phase === 'gather' ? 0.35 : 0;
  office.screen.emissiveIntensity += ((0.25 + on * 0.5) - office.screen.emissiveIntensity) * k;
  office.slideMats.forEach((m) => { m.opacity += (on - m.opacity) * k; });
  if (selected >= 0) { const a = agents[selected]; ring.position.set(a.root.position.x, 0, a.root.position.z); ring.rotation.y = a.root.rotation.y; }
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
