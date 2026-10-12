// The Offices page: every office running on this computer, from GET /api/offices,
// refreshed every few seconds.
import { themeById } from './themes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const el = document.getElementById('offices');

function card(o, here) {
  const t = themeById(o.theme);
  const busy = o.busy + (o.managerBusy ? 1 : 0);
  return `<a class="office${o.url === here ? ' here' : ''}" href="${esc(o.open ?? o.url)}">
    <div class="row1"><span class="sw3" aria-hidden="true">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <div><h2>${esc(o.name)}</h2><p class="path">${esc(o.project)}</p></div></div>
    <div class="stats">
      <span class="stat">${o.agents} agent${o.agents === 1 ? '' : 's'}</span>
      <span class="stat ${busy ? 'busy' : ''}">${busy ? `${busy} working` : 'all idle'}</span>
      <span class="stat ${o.connected ? 'ok' : 'wait'}">${o.connected ? 'session connected' : 'no session'}</span>
      <span class="stat">${esc(t.name)}</span>
    </div>
    <span class="open">${o.url === here ? 'You are here' : 'Open office →'}</span></a>`;
}

async function refresh() {
  try {
    const { here, offices } = await (await fetch('api/offices', { cache: 'no-store' })).json();
    el.innerHTML = offices.map((o) => card(o, here)).join('')
      + (offices.length < 2 ? `<p class="empty-state" style="grid-column:1/-1">${offices.length ? 'This is the only office running.' : 'No office is running.'} Start one for another project with <code>npx github:niklan1110/agentic-office</code> in that project's folder, and it shows up here.</p>` : '');
  } catch {
    el.innerHTML = '<p class="empty-state" style="grid-column:1/-1">This office stopped. Start it again with <code>npx github:niklan1110/agentic-office</code>.</p>';
  }
}

refresh();
setInterval(refresh, 3000);
