// The setup app: welcome, build the team of agents, launch it into Claude Code.
// The server lists the skills by area (GET /skills), returns the launched team and
// the recommended one (GET /team), and deploys a team (POST /launch): skills into
// the project's .claude/skills/, one subagent per agent into .claude/agents/.
// Until it is launched, the team being edited is a draft kept in this browser.
import { ROLE_INFO } from './roles.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const main = $('main');
const PAGE = 150; // skill rows drawn before "Show more"
const MODEL_LABEL = { inherit: 'Same as the session', sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };

let server = null; // GET /team: project, team, recommended, characters, models, limits, sessionSeenAt
let groups = [];
let skills = [];
let byName = new Map();
let draft = null; // { manager: { name, skills }, agents: [ { id, name, character, description, model, skills } ] }
let selected = 'manager'; // an agent id, or 'manager'
let browse = { group: 'suggested', query: '', mine: false, limit: PAGE };
let lastLaunch = null;

// ---- Draft: kept in this browser until launched -----------------------------------------------
const draftKey = () => 'agent-office-draft:' + server.project;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(draftKey(), JSON.stringify(v)); } catch { /* the draft lives in memory only */ } },
  clear() { try { localStorage.removeItem(draftKey()); } catch { /* nothing kept */ } },
};
const copy = (t) => JSON.parse(JSON.stringify(t));
const comparable = (t) => (t ? JSON.stringify({ manager: t.manager, agents: t.agents }) : '');
const isDirty = () => draft && comparable(draft) !== comparable(server.team);
function changed() { store.set(draft); renderSteps(); }

function slug(name) {
  const s = String(name).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^[^a-z]+|-+$/g, '');
  return s.slice(0, 40).replace(/-+$/, '') || 'agent';
}
// A unique id for an agent from its name, not clashing with the other agents.
function idFor(name, self) {
  const base = slug(name);
  const taken = new Set(draft.agents.filter((a) => a !== self).map((a) => a.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
  return id;
}
// The agent's name in Claude Code, and why it differs when another agent already has that name.
const idNote = (a) => `In Claude Code: <code translate="no">${esc(a.id)}</code>${a.id !== slug(a.name) ? ` (another agent is already ${esc(slug(a.name))})` : ''}`;
const agentById = (id) => draft.agents.find((a) => a.id === id);
const current = () => (selected === 'manager' ? null : agentById(selected));
const skillsOf = () => (selected === 'manager' ? draft.manager.skills : current().skills);
const sessionLive = () => (server.connected ?? 0) > 0;

function setStatus(html, kind = '') {
  const el = $('status');
  el.className = 'status ' + kind;
  el.innerHTML = html;
}

// ---- Routing ------------------------------------------------------------------------------------
const VIEWS = ['welcome', 'agents', 'launch', 'live'];
function view() { const v = location.hash.slice(1).split('/')[0]; return VIEWS.includes(v) ? v : 'welcome'; }
function go(v) { if (location.hash !== '#' + v) location.hash = v; else render(); }
addEventListener('hashchange', () => { render(); main.focus({ preventScroll: true }); scrollTo(0, 0); });

function renderSteps() {
  const v = view() === 'live' ? 'launch' : view();
  document.querySelectorAll('.steps a').forEach((a) => {
    const on = a.dataset.step === v;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    a.classList.toggle('locked', !draft && a.dataset.step !== 'welcome');
  });
}

function render() {
  if (!server) return;
  if (!draft && view() !== 'welcome') { history.replaceState(null, '', '#welcome'); }
  setStatus('');
  renderSteps();
  ({ welcome: renderWelcome, agents: renderAgents, launch: renderLaunch, live: renderLive })[view()]();
  document.title = ({ welcome: 'Welcome', agents: 'Your agents', launch: 'Launch', live: 'Workspace live' })[view()] + ' · Agent Office';
}

// ---- 1. Welcome ---------------------------------------------------------------------------------
function renderWelcome() {
  const launched = server.team;
  const n = launched?.agents.length ?? 0;
  const groupCount = groups.filter((g) => skills.some((s) => s.group === g.id)).length;
  main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Welcome</p>
      <h1>Build your team of Claude Code agents</h1>
      <p class="lead">Create the agents your project needs, give each one skills from this collection, and launch them into Claude Code. Then give them work, here in the 3D office or in any Claude Code session, and watch them get to it.</p>
      <div class="project"><span>Project</span><code translate="no">${esc(server.project)}</code></div>
      <p class="fine">Launching writes into this folder’s <code>.claude/</code>. Wrong folder? Stop the server and start it in your project, or pass <code>--project &lt;folder&gt;</code>.</p>
    </section>

    <ol class="how">
      <li><span class="n">1</span><h2>Create your agents</h2><p>As many as you need. Give each a name, a character for the office, and a line on what it is for.</p></li>
      <li><span class="n">2</span><h2>Assign skills</h2><p>${skills.length} skills in ${groupCount} areas, from planning and web development to design, testing and security. Each comes with a short description.</p></li>
      <li><span class="n">3</span><h2>Launch the workspace</h2><p>Each agent becomes a Claude Code subagent in <code>.claude/agents/</code>, with its skills copied to <code>.claude/skills/</code>.</p></li>
      <li><span class="n">4</span><h2>Give them work</h2><p>Type a task in the office, or ask Claude in VS Code or the terminal: “Have <b>ada</b> build the login page.”</p></li>
    </ol>

    <div class="cta">
      ${launched
        ? `<button class="primary big" id="edit" type="button">Edit your team (${n} agent${n === 1 ? '' : 's'})</button>
           <a class="btn" href="./?from=setup">Open the office</a>`
        : `<button class="primary big" id="recommended" type="button">Start with the recommended team</button>
           <button class="btn big" id="scratch" type="button">Start from scratch</button>`}
    </div>
    ${launched ? '' : `<p class="fine center">The recommended team has nine agents: developer, reviewer, QA, researcher, designer, DevOps, writer, analyst and security, each with three skills. You can change everything before you launch.</p>`}
    ${isDirty() && launched ? `<p class="fine center">You have changes that are not launched yet. <a href="#agents">Continue editing</a></p>` : ''}

    <aside class="bridge ${sessionLive() ? 'ok' : ''}">
      <h2>${sessionLive() ? 'A Claude Code session is connected' : 'Optional: connect a Claude Code session'}</h2>
      <p>${sessionLive()
        ? 'The agent-office plugin is running in a Claude Code session of this project. It adds your agents to that session the moment you launch, runs tasks typed in the office, and shows the work live.'
        : 'Agents you launch are in every Claude Code session you start in the project, with nothing else to install. For the live 3D view, tasks typed in the office, and agents added to a session that is already open, install the agent-office plugin once, in a terminal (this also covers VS Code):'}</p>
      ${sessionLive() ? '' : '<pre><code>claude plugin marketplace add niklan1110/agent-office\nclaude plugin install agent-office@agent-office</code></pre><p class="fine">Then open Claude Code in this project. <code>npx agent-office doctor</code> checks the whole setup.</p>'}
    </aside>`;
  const start = (team) => { draft = team; selected = draft.agents[0]?.id ?? 'manager'; changed(); go('agents'); };
  $('edit')?.addEventListener('click', () => start(store.get() ?? copy(server.team)));
  $('recommended')?.addEventListener('click', () => start({ manager: { name: 'Manager', skills: [] }, agents: copy(server.recommended) }));
  $('scratch')?.addEventListener('click', () => start({ manager: { name: 'Manager', skills: [] }, agents: [] }));
}

// ---- 2. Agents ----------------------------------------------------------------------------------
function renderAgents() {
  if (location.hash === '#agents/new') picking = true;
  if (!current() && selected !== 'manager') selected = draft.agents[0]?.id ?? 'manager';
  const total = new Set([...draft.manager.skills, ...draft.agents.flatMap((a) => a.skills)]).size;
  main.innerHTML = `
    <div class="agents-layout">
      <nav class="roster" aria-label="Your team">
        <div class="roster-head"><h2>Your team</h2><span class="count">${draft.agents.length} agent${draft.agents.length === 1 ? '' : 's'}</span></div>
        <ul id="roster"></ul>
        <button class="add" id="add" type="button" ${draft.agents.length >= server.limits.agents ? 'disabled' : ''}>＋ New agent</button>
      </nav>
      <section class="editor" id="editor" aria-live="off"></section>
    </div>
    <div class="dock">
      <span>${draft.agents.length} agent${draft.agents.length === 1 ? '' : 's'} · ${total} skill${total === 1 ? '' : 's'}${isDirty() ? ' · <b>not launched yet</b>' : ''}</span>
      <a class="primary" href="#launch">Review and launch →</a>
    </div>`;
  $('add').onclick = addAgent;
  renderRoster();
  renderEditor();
}

function renderRoster() {
  const row = (id, color, name, sub, n) => `<li><button type="button" class="member" data-id="${id}" aria-current="${id === selected}">
      <span class="chip" style="background:${color}" aria-hidden="true"></span>
      <span class="nm"><b>${esc(name)}</b><span>${sub}</span></span><span class="n" title="Skills">${n}</span></button></li>`;
  $('roster').innerHTML = row('manager', ROLE_INFO.manager.color, draft.manager.name, 'You · the main session', draft.manager.skills.length)
    + draft.agents.map((a) => row(a.id, ROLE_INFO[a.character].color, a.name, `<code translate="no">${esc(a.id)}</code> · ${esc(ROLE_INFO[a.character].title)}`, a.skills.length)).join('')
    + (draft.agents.length ? '' : '<li class="empty-roster">No agents yet. Add your first one.</li>');
  $('roster').querySelectorAll('.member').forEach((b) => { b.onclick = () => { selected = b.dataset.id; picking = false; browse = { ...browse, limit: PAGE, mine: false, group: b.dataset.id === 'manager' ? 'all' : 'suggested' }; renderRoster(); renderEditor(); if (matchMedia('(max-width: 860px)').matches) $('editor').scrollIntoView({ block: 'start' }); }; });
}

// "New agent" first asks where to start: a role with its usual skills, or blank.
let picking = false;
function addAgent() {
  picking = true;
  history.replaceState(null, '', '#agents/new');
  renderRoster();
  renderEditor();
  $('editor').querySelector('.preset')?.focus();
}

function createAgent(preset) {
  picking = false;
  history.replaceState(null, '', '#agents');
  const used = new Set(draft.agents.map((a) => a.character));
  const character = preset?.character ?? server.characters.find((c) => !used.has(c)) ?? 'developer';
  const name = preset && !draft.agents.some((a) => a.name === preset.name) ? preset.name : `Agent ${draft.agents.length + 1}`;
  const agent = { id: '', name, character, description: preset?.description ?? '', model: 'inherit', skills: [...(preset?.skills ?? [])] };
  browse = { ...browse, group: 'suggested', query: '', mine: false, limit: PAGE };
  agent.id = idFor(name, agent);
  draft.agents.push(agent);
  selected = agent.id;
  changed();
  renderAgents();
  const input = $('name');
  input.focus();
  input.select();
}

function renderPicker() {
  $('editor').innerHTML = `
    <div class="who"><div><h2>New agent: where to start?</h2>
      <p class="sub">Pick a role to start with its usual skills and description. You can change everything afterwards.</p></div>
      <button class="link" id="cancelPick" type="button">Cancel</button></div>
    <div class="presets">
      ${server.recommended.map((p, i) => `<button type="button" class="preset" data-i="${i}">
        <span class="chip" style="background:${ROLE_INFO[p.character].color}" aria-hidden="true"></span>
        <b>${esc(ROLE_INFO[p.character].title)}</b><span class="d">${esc(p.description)}</span>
        <span class="sk-list">${p.skills.map((x) => `<code translate="no">${esc(x)}</code>`).join(' ')}</span></button>`).join('')}
      <button type="button" class="preset blank" data-i="-1"><span class="chip plus" aria-hidden="true">＋</span><b>Blank agent</b><span class="d">No skills yet: pick them yourself from all ${skills.length}.</span></button>
    </div>`;
  $('cancelPick').onclick = () => { picking = false; history.replaceState(null, '', '#agents'); renderRoster(); renderEditor(); };
  $('editor').querySelectorAll('.preset').forEach((b) => { b.onclick = () => createAgent(server.recommended[Number(b.dataset.i)]); });
}

// What Claude reads when it decides whether to hand this agent a task (as in its agent file).
function preview(a) {
  const title = ROLE_INFO[a.character].title;
  return `${a.name} (${title}). ${a.description || `Works as the team's ${title}.`}${a.skills.length ? ` Skills: ${a.skills.join(', ')}.` : ''}`;
}

function renderEditor() {
  if (picking) return renderPicker();
  if (selected === 'manager' && browse.group === 'suggested') browse.group = 'all';
  const a = current();
  const isMgr = !a;
  const sharing = a ? draft.agents.filter((x) => x !== a && x.character === a.character).map((x) => x.name) : [];
  $('editor').innerHTML = `
    <div class="who">
      <span class="chip big" style="background:${ROLE_INFO[isMgr ? 'manager' : a.character].color}" aria-hidden="true"></span>
      <div><h2 id="editorTitle">${esc(isMgr ? draft.manager.name : a.name)}</h2>
      <p class="sub">${isMgr ? 'The manager is you: your own Claude Code session. Its skills are copied into the project for the main session.' : idNote(a)}</p></div>
      ${isMgr ? '' : '<button class="link danger" id="remove" type="button">Remove agent…</button>'}
    </div>
    <div class="grid2">
      <label class="field"><span>Name</span>
        <input id="name" name="agent-name" autocomplete="off" spellcheck="false" maxlength="${server.limits.name}" value="${esc(isMgr ? draft.manager.name : a.name)}" placeholder="e.g. Ada…"></label>
      ${isMgr ? '' : `<label class="field"><span>Model</span>
        <select id="model">${server.models.map((m) => `<option value="${m}" ${m === a.model ? 'selected' : ''}>${MODEL_LABEL[m]}</option>`).join('')}</select></label>`}
    </div>
    ${isMgr ? '' : `
    <fieldset class="field"><legend>Character in the office</legend>
      <div class="characters">${server.characters.map((c) => `<label class="character"><input type="radio" name="character" value="${c}" ${c === a.character ? 'checked' : ''}>
        <span class="chip" style="background:${ROLE_INFO[c].color}" aria-hidden="true"></span><span>${esc(ROLE_INFO[c].title)}</span></label>`).join('')}</div>
      <p class="hint">${sharing.length ? `Shares this character and its desk with ${esc(sharing.join(', '))}.` : 'Its look and desk in the 3D office. Agents can share a character.'}</p>
    </fieldset>
    <label class="field"><span>What is it for? <i>optional</i></span>
      <textarea id="description" rows="2" maxlength="${server.limits.description}" placeholder="e.g. Builds the React front end and keeps it accessible…">${esc(a.description)}</textarea>
      <span class="hint">Claude reads this to decide when to hand work to this agent. Left empty, its skills say it.</span></label>
    <div class="preview"><span>What Claude sees</span><p id="preview">${esc(preview(a))}</p></div>`}
    <div class="block">
      <div class="block-head"><h3>Skills <span class="count" id="assignedCount"></span></h3>
        ${!isMgr && server.recommended.some((r) => r.character === a.character) ? '<button class="link" id="suggest" type="button">Use the suggested skills</button>' : ''}</div>
      <ul class="assigned" id="assigned"></ul>
    </div>
    <div class="block">
      <div class="block-head"><h3>Add skills</h3></div>
      <div class="finder">
        <label class="search"><span class="sr">Search skills</span>
          <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Search names and descriptions, e.g. react…" value="${esc(browse.query)}"></label>
        <label class="toggle"><input type="checkbox" id="mine" ${browse.mine ? 'checked' : ''}> Only ${isMgr ? 'the manager’s' : 'this agent’s'}</label>
      </div>
      <div class="groups" role="group" aria-label="Skill areas" id="groups"></div>
      <p class="group-blurb" id="groupBlurb"></p>
      <div id="catalog"></div>
      <button class="more" id="more" type="button" hidden>Show more</button>
    </div>`;

  $('name').oninput = (e) => {
    const value = e.target.value.replace(/\s+/g, ' ');
    if (isMgr) draft.manager.name = value.trim() || 'Manager';
    else { a.name = value.trim() || 'Agent'; a.id = idFor(a.name, a); selected = a.id; }
    $('editorTitle').textContent = isMgr ? draft.manager.name : a.name;
    if (!isMgr) { $('editor').querySelector('.sub').innerHTML = idNote(a); $('preview').textContent = preview(a); }
    changed();
    renderRoster();
  };
  $('name').onblur = (e) => { e.target.value = isMgr ? draft.manager.name : a.name; };
  if (!isMgr) {
    $('model').onchange = (e) => { a.model = e.target.value; changed(); };
    $('description').oninput = (e) => { a.description = e.target.value.replace(/\s+/g, ' ').trimStart(); $('preview').textContent = preview(a); changed(); };
    $('editor').querySelectorAll('input[name=character]').forEach((r) => { r.onchange = () => { a.character = r.value; changed(); renderRoster(); renderEditor(); }; });
    $('remove').onclick = () => {
      if (!confirm(`Remove ${a.name} from the team? Its agent file is deleted when you next launch.`)) return;
      draft.agents = draft.agents.filter((x) => x !== a);
      selected = draft.agents[0]?.id ?? 'manager';
      changed();
      renderAgents();
      setStatus(`${esc(a.name)} was removed. <button class="link" id="undo" type="button">Undo</button>`);
      $('undo').onclick = () => { draft.agents.push(a); selected = a.id; changed(); renderAgents(); setStatus(''); };
    };
    $('suggest')?.addEventListener('click', () => {
      const rec = server.recommended.find((r) => r.character === a.character);
      a.skills = [...new Set([...a.skills, ...rec.skills])];
      if (!a.description) a.description = rec.description;
      changed();
      renderRoster();
      renderEditor();
    });
  }
  let typing;
  $('search').oninput = (e) => { clearTimeout(typing); typing = setTimeout(() => { browse.query = e.target.value.trim(); browse.limit = PAGE; renderCatalog(); }, 80); };
  $('mine').onchange = (e) => { browse.mine = e.target.checked; browse.limit = PAGE; renderCatalog(); };
  $('more').onclick = () => { browse.limit += PAGE; renderCatalog(); };
  renderAssigned();
  renderCatalog();
}

function renderAssigned() {
  const list = skillsOf();
  $('assignedCount').textContent = `(${list.length} of ${server.limits.skills})`;
  $('assigned').innerHTML = list.length
    ? list.map((s) => {
      const k = byName.get(s);
      return `<li class="${k ? '' : 'missing'}"><div><b translate="no">${esc(s)}</b><span>${esc(k ? k.summary : 'Not in any skill source any more; still in the project')}</span></div><button type="button" data-s="${esc(s)}" aria-label="Remove ${esc(s)}">Remove</button></li>`;
    }).join('')
    : '<li class="none">No skills yet. Add some from the list below: start with Suggested.</li>';
  $('assigned').querySelectorAll('button[data-s]').forEach((b) => { b.onclick = () => toggleSkill(b.dataset.s, false); });
}

function toggleSkill(name, on) {
  const list = skillsOf();
  const has = list.includes(name);
  if (on && !has && list.length >= server.limits.skills) {
    setStatus(`An agent can have at most ${server.limits.skills} skills. Remove one first.`, 'err');
    return;
  }
  const next = on ? (has ? list : [...list, name]) : list.filter((s) => s !== name);
  if (selected === 'manager') draft.manager.skills = next; else current().skills = next;
  changed();
  renderRoster();
  renderAssigned();
  const btn = $('catalog').querySelector(`.addbtn[data-s="${CSS.escape(name)}"]`);
  if (btn && !browse.mine) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${name}`);
    btn.textContent = on ? 'Added ✓' : 'Add';
  } else renderCatalog();
  if (current()) $('preview').textContent = preview(current());
  renderGroups();
}

// The areas each character usually works in, for the Suggested tab.
const CHARACTER_AREAS = {
  developer: ['planning', 'quality', 'testing', 'frontend', 'backend', 'languages'],
  reviewer: ['quality', 'security'],
  qa: ['testing', 'quality'],
  researcher: ['research', 'planning', 'docs'],
  designer: ['design', 'frontend'],
  devops: ['devops', 'security'],
  writer: ['docs', 'planning'],
  analyst: ['data', 'quality'],
  security: ['security', 'quality'],
};
const presetSkills = () => server.recommended.find((x) => x.character === current()?.character)?.skills ?? [];
const isSuggested = (s) => presetSkills().includes(s.name) || (CHARACTER_AREAS[current()?.character] ?? []).includes(s.group);
const suggestRank = (s) => (presetSkills().includes(s.name) ? 0 : 1 + (CHARACTER_AREAS[current()?.character] ?? []).indexOf(s.group));

// Which other team members have a skill.
function holders(name) {
  const out = draft.agents.filter((a) => a.id !== selected && a.skills.includes(name)).map((a) => a.name);
  if (selected !== 'manager' && draft.manager.skills.includes(name)) out.unshift(draft.manager.name);
  return out;
}

function filtered(ignoreGroup) {
  const words = browse.query.toLowerCase().split(/\s+/).filter(Boolean);
  const mine = new Set(skillsOf());
  let list = skills.filter((s) => (ignoreGroup || browse.group === 'all' || (browse.group === 'suggested' ? isSuggested(s) : s.group === browse.group))
    && (!browse.mine || mine.has(s.name))
    && words.every((w) => (s.name + ' ' + s.description).toLowerCase().includes(w)));
  if (!words.length && browse.group === 'suggested') list = list.map((s, i) => [s, suggestRank(s), i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(([s]) => s);
  if (words.length) {
    const score = (s) => words.filter((w) => s.name.includes(w)).length;
    list = list.map((s, i) => [s, score(s), i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]).map(([s]) => s);
  }
  return list;
}

function renderGroups() {
  const pool = filtered(true);
  const mine = new Set(skillsOf());
  const inArea = (s, id) => id === 'all' || (id === 'suggested' ? isSuggested(s) : s.group === id);
  const count = (id) => pool.filter((s) => inArea(s, id)).length;
  const picked = (id) => skills.filter((s) => inArea(s, id) && mine.has(s.name)).length;
  const chip = (id, label) => {
    const n = count(id), p = picked(id);
    return `<button type="button" data-g="${id}" class="${browse.group === id ? 'on' : ''}" aria-pressed="${browse.group === id}" ${n === 0 && browse.group !== id ? 'disabled' : ''}>${esc(label)} <span class="c">${n}</span>${p ? `<span class="p" title="${p} picked">${p}</span>` : ''}</button>`;
  };
  const sug = selected === 'manager' ? '' : chip('suggested', `Suggested for ${ROLE_INFO[current().character].title}`);
  $('groups').innerHTML = sug + chip('all', 'All areas') + groups.filter((g) => skills.some((x) => x.group === g.id)).map((g) => chip(g.id, g.label)).join('');
  $('groups').querySelectorAll('button').forEach((b) => { b.onclick = () => { browse.group = b.dataset.g; browse.limit = PAGE; renderCatalog(); }; });
  const g = groups.find((x) => x.id === browse.group);
  $('groupBlurb').textContent = browse.group === 'suggested' ? `This role's usual skills first, then the areas it works in: ${(CHARACTER_AREAS[current()?.character] ?? []).map((id) => groups.find((x) => x.id === id)?.label).filter(Boolean).join(', ')}.` : g ? g.blurb : '';
}

function highlight(text) {
  const words = browse.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = esc(text);
  if (!words.length) return out;
  const re = new RegExp('(' + words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return out.replace(re, '<mark>$1</mark>');
}

function renderCatalog() {
  renderGroups();
  const list = filtered(false);
  const mine = new Set(skillsOf());
  const el = $('catalog');
  if (!list.length) {
    el.innerHTML = `<p class="none pad">${browse.mine ? 'No skills assigned here yet.' : 'No skill matches. Try another word or another area.'}</p>`;
    $('more').hidden = true;
    return;
  }
  // Grouped by area when showing all of them in their usual order. That view draws
  // every skill, so each area's count matches the skills under it; a flat list pages.
  const grouped = browse.group === 'all' && !browse.query;
  const shown = grouped ? list : list.slice(0, browse.limit);
  const row = (s) => {
    const also = holders(s.name);
    const long = s.description && s.description !== s.summary;
    const on = mine.has(s.name);
    return `<li class="skill"><div class="info">
      <span class="line"><b translate="no">${highlight(s.name)}</b>${s.source === 'personal' ? '<span class="tagx">personal</span>' : s.installed ? '<span class="tagx inst">in project</span>' : ''}${also.length ? `<span class="tagx">also: ${esc(also.join(', '))}</span>` : ''}</span>
      <p>${highlight(s.summary)}</p>
      ${long ? `<details><summary>Full description</summary><p>${highlight(s.description)}</p></details>` : ''}</div>
      <button type="button" class="addbtn${on ? ' on' : ''}" data-s="${esc(s.name)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(s.name)}">${on ? 'Added ✓' : 'Add'}</button></li>`;
  };
  if (grouped) {
    el.innerHTML = groups.map((g) => {
      const items = shown.filter((s) => s.group === g.id);
      return items.length ? `<section class="area"><h4>${esc(g.label)} <span class="count">${items.length}</span></h4><ul class="catalog">${items.map(row).join('')}</ul></section>` : '';
    }).join('');
  } else {
    el.innerHTML = `<ul class="catalog">${shown.map(row).join('')}</ul>`;
  }
  el.querySelectorAll('.addbtn').forEach((b) => { b.onclick = () => toggleSkill(b.dataset.s, b.getAttribute('aria-pressed') !== 'true'); });
  const left = list.length - shown.length;
  $('more').hidden = left <= 0;
  $('more').textContent = `Show ${Math.min(left, PAGE)} more (${left} left)`;
}

// ---- 3. Launch ----------------------------------------------------------------------------------
function plan() {
  const wanted = [...new Set([...draft.manager.skills, ...draft.agents.flatMap((a) => a.skills)])];
  const toCopy = wanted.filter((s) => byName.get(s) && !byName.get(s).installed);
  const before = new Set((server.team?.agents ?? []).map((a) => a.id));
  const removed = [...before].filter((id) => !draft.agents.some((a) => a.id === id));
  return { wanted, toCopy, removed };
}

function renderLaunch() {
  const p = plan();
  const problems = [];
  if (!draft.agents.length) problems.push('The team has no agents yet. <a href="#agents">Add one</a>.');
  const noSkills = draft.agents.filter((a) => !a.skills.length);
  main.innerHTML = `
    <section class="hero small">
      <p class="eyebrow">Review and launch</p>
      <h1>Ready to deploy ${draft.agents.length} agent${draft.agents.length === 1 ? '' : 's'}</h1>
      <p class="lead">Check the team, then launch. You can come back and change it any time; launching again updates the agents.</p>
    </section>
    <div class="review">
      <table>
        <thead><tr><th scope="col">Agent</th><th scope="col">Claude Code agent</th><th scope="col">Model</th><th scope="col">Skills</th></tr></thead>
        <tbody>
          <tr><td><span class="chip" style="background:${ROLE_INFO.manager.color}" aria-hidden="true"></span><b>${esc(draft.manager.name)}</b><span class="sub">Manager (you)</span></td><td>main session</td><td>—</td><td>${skillCell(draft.manager.skills)}</td></tr>
          ${draft.agents.map((a) => `<tr><td><span class="chip" style="background:${ROLE_INFO[a.character].color}" aria-hidden="true"></span><b>${esc(a.name)}</b><span class="sub">${esc(ROLE_INFO[a.character].title)}</span></td>
            <td><code translate="no">${esc(a.id)}</code></td><td>${MODEL_LABEL[a.model]}</td><td>${skillCell(a.skills)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="what">
        <h2>Launching will</h2>
        <ul>
          <li>Copy <b>${p.toCopy.length}</b> skill${p.toCopy.length === 1 ? '' : 's'} into <code>.claude/skills/</code>${p.wanted.length - p.toCopy.length ? ` (${p.wanted.length - p.toCopy.length} already there)` : ''}.</li>
          <li>Write <b>${draft.agents.length}</b> agent file${draft.agents.length === 1 ? '' : 's'} to <code>.claude/agents/</code>.</li>
          ${p.removed.length ? `<li>Delete the agent file${p.removed.length === 1 ? '' : 's'} of ${p.removed.map((id) => `<code>${esc(id)}</code>`).join(', ')}, no longer on the team.</li>` : ''}
          <li>${sessionLive() ? 'Add the agents to your connected Claude Code session right away.' : 'Make the agents available in every Claude Code session you start in the project.'}</li>
        </ul>
        ${noSkills.length ? `<p class="warn">${esc(noSkills.map((a) => a.name).join(', '))} ${noSkills.length === 1 ? 'has' : 'have'} no skills. ${noSkills.length === 1 ? 'It' : 'They'} will still work, as general agents.</p>` : ''}
        ${problems.map((x) => `<p class="warn">${x}</p>`).join('')}
        <div class="cta left">
          <button class="primary big" id="launchBtn" type="button" ${problems.length ? 'disabled' : ''}>Launch workspace</button>
          <a class="btn" href="#agents">← Back to the agents</a>
        </div>
      </div>
    </div>`;
  $('launchBtn').onclick = launch;
}
const skillCell = (list) => (list.length ? list.map((s) => `<code class="sk" translate="no">${esc(s)}</code>`).join(' ') : '<span class="sub">none</span>');

async function launch() {
  const btn = $('launchBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Launching…';
  setStatus('Deploying your agents…');
  try {
    const res = await fetch('api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manager: draft.manager, agents: draft.agents }) });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    lastLaunch = await res.json();
    server.team = lastLaunch.team;
    server.connected = lastLaunch.connected;
    draft = copy(server.team);
    store.clear();
    for (const n of lastLaunch.added) { const s = byName.get(n); if (s) s.installed = true; }
    go('live');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Launch workspace';
    setStatus(`Not launched: ${esc(err.message || err)}`, 'err');
  }
}

// ---- 4. Live ------------------------------------------------------------------------------------
function renderLive() {
  const team = server.team;
  if (!team) { go('welcome'); return; }
  const r = lastLaunch;
  const ids = team.agents.map((a) => a.id);
  const first = team.agents[0];
  main.innerHTML = `
    <section class="hero small">
      <p class="eyebrow ok">Workspace live</p>
      <h1>Your ${team.agents.length} agent${team.agents.length === 1 ? ' is' : 's are'} ready to work</h1>
      ${r ? `<p class="lead">Wrote ${r.written.length} agent file${r.written.length === 1 ? '' : 's'} to <code>.claude/agents/</code>${r.added.length ? ` and copied ${r.added.length} skill${r.added.length === 1 ? '' : 's'} into <code>.claude/skills/</code>` : ''}${r.removed.length ? `, and removed ${r.removed.map((x) => `<code>${esc(x)}</code>`).join(', ')}` : ''}.</p>` : ''}
    </section>
    <div class="cards">
      <article class="card ok"><h2>New Claude Code sessions</h2>
        <p>Every session you start in the project has the agents: in VS Code, the terminal or the desktop app. Agent files are read when a session starts.</p>
        <p class="ids">${ids.map((id) => `<code>${esc(id)}</code>`).join(' ')}</p></article>
      <article class="card ${sessionLive() ? 'ok' : ''}"><h2>Sessions already open</h2>
        <p>${sessionLive()
          ? 'Your connected session added the agents just now, as <code>agent-office:&lt;name&gt;</code>. Skills reach open sessions on their own.'
          : 'An open session picks up the skills, but not the agents. Start a new session, or install the agent-office plugin so launches reach open sessions too. If the session started before the project had a <code>.claude/skills</code> folder, run <code>/reload-skills</code>.'}</p></article>
    </div>
    <h2 class="section">Give them work</h2>
    <div class="cards">
      <article class="card"><h3>In the office</h3>
        <p>Type a task at the top of the office and press <b>Call meeting</b>. The manager briefs the team and your Claude Code session starts on it${sessionLive() ? '' : ' (needs the agent-office plugin)'}. You can watch each agent work at its desk.</p>
        <a class="primary" href="./?from=setup">Open the office →</a></article>
      <article class="card"><h3>In VS Code or the terminal</h3>
        <p>Ask Claude as usual and name the agents you want:</p>
        ${first ? `<div class="prompt"><code id="example">Have ${esc(first.id)} ${esc(examplePrompt(first))}</code><button class="btn small" type="button" id="copyEx">Copy</button></div>` : ''}
        <p class="fine">Claude also hands work to an agent on its own when a task matches the agent’s description.</p></article>
    </div>
    <div class="cta left"><a class="btn" href="#agents">Edit the team</a></div>`;
  $('copyEx')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('example').textContent); setStatus('Copied.', 'ok'); } catch { setStatus('Select the text and copy it.', ''); }
  });
}
const EXAMPLES = { developer: 'build the sign-up form, with tests', reviewer: 'review my last change', qa: 'test the checkout flow and report bugs', researcher: 'find the best library for PDF export', designer: 'design the settings page', devops: 'set up CI for this repo', writer: 'write a spec for the search feature', analyst: 'find why the dashboard is slow', security: 'audit the login code' };
const examplePrompt = (a) => EXAMPLES[a.character] ?? 'take the first task';

// ---- Start --------------------------------------------------------------------------------------
addEventListener('beforeunload', (e) => { if (isDirty() && view() !== 'welcome') { e.preventDefault(); e.returnValue = ''; } });
setInterval(async () => {
  try { const s = await (await fetch('api/status', { cache: 'no-store' })).json(); const was = sessionLive(); server.connected = s.connected; if (was !== sessionLive() && (view() === 'welcome' || view() === 'live')) render(); } catch { /* the server is away */ }
}, 4000);

async function load() {
  setStatus('Loading…');
  try {
    const [sRes, tRes] = await Promise.all([fetch('api/skills', { cache: 'no-store' }), fetch('api/team', { cache: 'no-store' })]);
    if (!sRes.ok || !tRes.ok) throw new Error('the server answered ' + (sRes.ok ? tRes.status : sRes.status));
    const s = await sRes.json();
    server = await tRes.json();
    groups = s.groups;
    skills = s.skills;
    byName = new Map(skills.map((x) => [x.name, x]));
    draft = store.get() ?? (server.team ? copy(server.team) : null);
    selected = draft?.agents[0]?.id ?? 'manager';
    if (draft && server.team && isDirty()) setTimeout(() => setStatus('Your changes from last time are restored; they are not launched yet. <button class="link" id="discard" type="button">Discard them</button>'), 0);
    render();
    document.addEventListener('click', (e) => {
      if (e.target.id !== 'discard') return;
      draft = copy(server.team);
      store.clear();
      render();
    });
  } catch (err) {
    setStatus(`Could not load: ${esc(err.message || err)}. Is the office server running? Start it in your project with <code>node office/server.mjs</code>, then reload.`, 'err');
  }
}
load();
