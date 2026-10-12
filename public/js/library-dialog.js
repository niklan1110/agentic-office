// "Add skills": find skills in a GitHub link or a zip, pick them, and add them to the
// personal library (~/.agent-office/skills), which every project's skill list includes.
// A native <dialog>, so focus, Escape and the backdrop behave as people expect.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// onAdded(names, giveToAgent) runs after the skills are in the library.
export function openLibraryDialog({ groups, known, agentName, onAdded }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'libdlg';
  dlg.setAttribute('aria-labelledby', 'libTitle');
  dlg.innerHTML = `
    <form method="dialog" class="libhead"><h2 id="libTitle">Add skills to your library</h2><button class="x" aria-label="Close">×</button></form>
    <p class="sub">Skills you add here are available in all your projects. A skill is a folder with a <code>SKILL.md</code>; a link or zip can hold one or many.</p>
    <div class="seg tabs" role="tablist">
      <button type="button" role="tab" aria-selected="true" data-tab="gh">From GitHub</button>
      <button type="button" role="tab" aria-selected="false" data-tab="zip">From a zip file</button>
    </div>
    <form class="pane" data-pane="gh" id="ghForm">
      <label class="field"><span>GitHub link</span>
        <input id="ghUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" required placeholder="https://github.com/owner/repo, or a link to a skill's folder…"></label>
      <button class="primary" type="submit" id="ghFind">Find skills</button>
    </form>
    <div class="pane" data-pane="zip" hidden>
      <label class="drop" id="drop"><input type="file" id="zipFile" accept=".zip,application/zip" hidden>
        <b>Choose a .zip</b><span>or drop it here</span></label>
    </div>
    <p class="msg" id="libMsg" role="status" aria-live="polite"></p>
    <div id="found"></div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  const $ = (sel) => dlg.querySelector(sel);
  const msg = (html, kind = '') => { $('#libMsg').className = 'msg ' + kind; $('#libMsg').innerHTML = html; };
  const busy = (on, label) => { const b = $('#ghFind'); b.disabled = on; b.innerHTML = on ? `<span class="spin" aria-hidden="true"></span>${label}` : 'Find skills'; };

  dlg.querySelectorAll('[role=tab]').forEach((t) => {
    t.onclick = () => {
      dlg.querySelectorAll('[role=tab]').forEach((x) => { x.setAttribute('aria-selected', String(x === t)); x.classList.toggle('on', x === t); });
      dlg.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      msg('');
    };
  });
  dlg.querySelector('[role=tab]').classList.add('on');

  function show(result) {
    const label = (g) => groups.find((x) => x.id === g)?.label ?? g;
    msg(`Found ${result.skills.length} skill${result.skills.length === 1 ? '' : 's'} in <b>${esc(result.source)}</b>. Untick any you don't want.`, 'ok');
    $('#found').innerHTML = `
      <ul class="foundlist">${result.skills.map((s) => `<li><label><input type="checkbox" value="${esc(s.name)}" checked>
        <span><b translate="no">${esc(s.name)}</b>${known.has(s.name) ? '<span class="tagx">update</span>' : ''}<span class="tagx">${esc(label(s.group))}</span><small>${esc(s.summary)}</small></span></label></li>`).join('')}</ul>
      ${agentName ? `<label class="toggle"><input type="checkbox" id="giveTo" checked> Also give them to ${esc(agentName)}</label>` : ''}
      <div class="libactions"><button class="primary" type="button" id="addBtn"></button></div>`;
    const sync = () => {
      const n = dlg.querySelectorAll('.foundlist input:checked').length;
      $('#addBtn').disabled = !n;
      $('#addBtn').textContent = n ? `Add ${n} skill${n === 1 ? '' : 's'} to my library` : 'Pick at least one';
    };
    dlg.querySelectorAll('.foundlist input').forEach((c) => { c.onchange = sync; });
    sync();
    $('#addBtn').onclick = async () => {
      const names = [...dlg.querySelectorAll('.foundlist input:checked')].map((c) => c.value);
      $('#addBtn').disabled = true;
      $('#addBtn').innerHTML = '<span class="spin" aria-hidden="true"></span>Adding…';
      try {
        const res = await fetch('api/library/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: result.token, names }) });
        if (!res.ok) throw new Error(await res.text());
        const done = await res.json();
        await onAdded(done.added, Boolean($('#giveTo')?.checked));
        dlg.close();
      } catch (err) {
        msg(esc(err.message || err), 'err');
        sync();
      }
    };
  }

  $('#ghForm').onsubmit = async (e) => {
    e.preventDefault();
    const url = $('#ghUrl').value.trim();
    if (!url) return;
    busy(true, 'Looking…');
    msg('Downloading from GitHub…');
    $('#found').innerHTML = '';
    try {
      const res = await fetch('api/library/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await res.text());
      show(await res.json());
    } catch (err) {
      msg(esc(err.message || err), 'err');
      $('#ghUrl').focus();
    } finally {
      busy(false);
    }
  };

  async function upload(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return msg('Pick a .zip file.', 'err');
    msg(`Reading ${esc(file.name)}…`);
    $('#found').innerHTML = '';
    try {
      const res = await fetch('api/library/upload', { method: 'POST', headers: { 'content-type': 'application/zip', 'x-file-name': file.name.replace(/[^\w .-]/g, '_') }, body: file });
      if (!res.ok) throw new Error(await res.text());
      show(await res.json());
    } catch (err) {
      msg(esc(err.message || err), 'err');
    }
  }
  $('#zipFile').onchange = (e) => upload(e.target.files[0]);
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); });

  dlg.showModal();
  $('#ghUrl').focus();
}
