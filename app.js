'use strict';

// ---------- Daten ----------
// types:     Scheibenarten (z. B. nach Lochdurchmesser)  {id, name}
// plates:    Scheiben im Inventar                       {id, typeId, weight, count}  count = Stück insgesamt, 0 = egal
// bars:      Hanteln/Stangen                            {id, name, weight, sides, typeIds}
// exercises: Übungen, jeweils fest einer Hantel zugeordnet {id, name, barId}
// logs:      Einträge                                   {id, exerciseId, date, perSide:{plateId:n}, sets, reps, note}

const KEY = 'weight-v1';
const uid = () => Math.random().toString(36).slice(2, 10);

function seed() {
  return {
    v: 1,
    types: [{ id: uid(), name: 'A' }, { id: uid(), name: 'B' }, { id: uid(), name: 'C' }],
    plates: [], bars: [], exercises: [], logs: []
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return s;
  } catch (e) {}
  return seed();
}
let S = load();
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

const byId = (list, id) => list.find(x => x.id === id);
const typeName = id => (byId(S.types, id) || { name: '?' }).name;

// ---------- Helfer ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtDate = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });

function sortedPlates(list) {
  const order = id => S.types.findIndex(t => t.id === id);
  return [...list].sort((a, b) => order(a.typeId) - order(b.typeId) || b.weight - a.weight);
}
function platesForBar(bar) {
  return sortedPlates(S.plates.filter(p => bar.typeIds.includes(p.typeId)));
}
function sideWeight(perSide) {
  let w = 0;
  for (const [pid, n] of Object.entries(perSide || {})) {
    const p = byId(S.plates, pid);
    if (p) w += p.weight * n;
  }
  return w;
}
function totalWeight(bar, perSide) {
  return (bar ? bar.weight + sideWeight(perSide) * bar.sides : sideWeight(perSide));
}
// "1× 5 kg B + 2× 1,25 kg C"
function describe(perSide) {
  const parts = sortedPlates(S.plates)
    .filter(p => (perSide || {})[p.id] > 0)
    .map(p => `${perSide[p.id]}× ${fmt(p.weight)} kg ${esc(typeName(p.typeId))}`);
  return parts.length ? parts.join(' + ') : 'nur Hantel';
}
function lastLog(exId) {
  return S.logs.filter(l => l.exerciseId === exId).sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ---------- Navigation ----------
const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('back');
let route = { tab: 'training' };

function go(r) { route = r; render(); window.scrollTo(0, 0); }
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => go({ tab: b.dataset.tab })));
$back.addEventListener('click', () => go({ tab: 'training' }));

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === route.tab));
  $back.hidden = !route.exercise;
  if (route.exercise && byId(S.exercises, route.exercise)) return renderExercise(byId(S.exercises, route.exercise));
  route.exercise = null;
  $back.hidden = true;
  if (route.tab === 'setup') return renderSetup();
  renderTraining();
}

// ---------- Training ----------
function renderTraining() {
  $title.textContent = 'Training';
  if (!S.exercises.length) {
    $view.innerHTML = `<div class="card"><div class="empty">Noch keine Übungen. Unter <b>Einrichten</b> zuerst Scheiben, Hanteln und Übungen anlegen.</div></div>`;
    return;
  }
  const rows = S.exercises.map(ex => {
    const bar = byId(S.bars, ex.barId);
    const l = lastLog(ex.id);
    const right = l ? `<b>${fmt(totalWeight(bar, l.perSide))} kg</b><br>${fmtDate(l.date)}` : '–';
    const sub = l ? `je Seite: ${describe(l.perSide)}` : esc(bar ? bar.name : 'keine Hantel');
    return `<button class="row" data-ex="${ex.id}">
      <div class="grow"><div>${esc(ex.name)}</div><div class="sub">${sub}</div></div>
      <div class="right">${right}</div><span class="chev"></span></button>`;
  }).join('');
  $view.innerHTML = `<div class="card">${rows}</div>`;
  $view.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => go({ tab: 'training', exercise: b.dataset.ex })));
}

// ---------- Übung: eintragen + Verlauf ----------
function renderExercise(ex) {
  $title.textContent = ex.name;
  const bar = byId(S.bars, ex.barId);
  if (!bar) {
    $view.innerHTML = `<div class="card"><div class="empty">Dieser Übung ist keine Hantel zugeordnet. Unter <b>Einrichten → Übungen</b> eine auswählen.</div></div>`;
    return;
  }
  const last = lastLog(ex.id);
  const draft = {
    perSide: { ...(last ? last.perSide : {}) },
    sets: last ? last.sets : '', reps: last ? last.reps : '', note: ''
  };
  const plates = platesForBar(bar);
  const maxFor = p => (p.count > 0 ? Math.floor(p.count / bar.sides) : Infinity);

  const plateRows = plates.length ? plates.map(p => `
    <div class="row">
      <div class="grow">${fmt(p.weight)} kg <span class="tag">${esc(typeName(p.typeId))}</span>
        ${p.count > 0 ? `<div class="sub">max. ${maxFor(p)} pro Seite</div>` : ''}</div>
      <div class="stepper">
        <button type="button" data-minus="${p.id}">−</button>
        <span class="n" data-n="${p.id}">0</span>
        <button type="button" data-plus="${p.id}">+</button>
      </div>
    </div>`).join('')
    : `<div class="empty">Keine passenden Scheiben für ${esc(bar.name)}. Unter <b>Einrichten</b> Scheiben anlegen oder bei der Hantel die passenden Arten anhaken.</div>`;

  const hist = S.logs.filter(l => l.exerciseId === ex.id).sort((a, b) => b.date.localeCompare(a.date));
  const histRows = hist.length ? hist.map(l => `
    <div class="row hist">
      <div class="grow">
        <div class="date">${fmtDate(l.date)}${l.sets || l.reps ? ` · ${esc(l.sets || '?')} × ${esc(l.reps || '?')}` : ''}</div>
        <div><b>${fmt(totalWeight(bar, l.perSide))} kg</b> <span class="sub">je Seite: ${describe(l.perSide)}</span></div>
        ${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}
      </div>
      <button class="del" data-del="${l.id}" aria-label="Löschen">×</button>
    </div>`).join('') : `<div class="empty">Noch keine Einträge.</div>`;

  $view.innerHTML = `
    <div class="card">
      <div class="total"><div class="big" id="tot"></div>
        <div class="sub">${esc(bar.name)} (${fmt(bar.weight)} kg)${bar.sides === 2 ? ' + 2 Seiten' : ' + 1 Seite'}</div>
        <div class="sub" id="desc"></div></div>
    </div>
    <h2>Scheiben pro Seite</h2>
    <div class="card">${plateRows}</div>
    <div class="card" style="margin-top:12px">
      <div class="fields">
        <label>Sätze<input type="text" inputmode="numeric" id="sets" value="${esc(draft.sets)}"></label>
        <label>Wiederholungen<input type="text" inputmode="numeric" id="reps" value="${esc(draft.reps)}"></label>
        <label class="full">Notiz<input type="text" id="note" placeholder="optional"></label>
      </div>
    </div>
    <button class="btn" id="save">Speichern</button>
    <h2>Verlauf</h2>
    <div class="card">${histRows}</div>`;

  const update = () => {
    for (const p of plates) {
      const n = draft.perSide[p.id] || 0;
      $view.querySelector(`[data-n="${p.id}"]`).textContent = n;
      $view.querySelector(`[data-minus="${p.id}"]`).disabled = n <= 0;
      $view.querySelector(`[data-plus="${p.id}"]`).disabled = n >= maxFor(p);
    }
    $view.querySelector('#tot').textContent = fmt(totalWeight(bar, draft.perSide)) + ' kg';
    $view.querySelector('#desc').innerHTML = 'je Seite: ' + describe(draft.perSide);
  };
  // Scheiben aus früheren Einträgen, die nicht mehr auf diese Hantel passen, fliegen raus
  for (const pid of Object.keys(draft.perSide)) if (!plates.some(p => p.id === pid)) delete draft.perSide[pid];
  update();

  $view.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.plus; draft.perSide[id] = (draft.perSide[id] || 0) + 1; update();
  }));
  $view.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.minus; draft.perSide[id] = Math.max(0, (draft.perSide[id] || 0) - 1);
    if (!draft.perSide[id]) delete draft.perSide[id];
    update();
  }));
  $view.querySelector('#save').addEventListener('click', () => {
    S.logs.push({
      id: uid(), exerciseId: ex.id, date: new Date().toISOString(), perSide: { ...draft.perSide },
      sets: $view.querySelector('#sets').value.trim(), reps: $view.querySelector('#reps').value.trim(),
      note: $view.querySelector('#note').value.trim()
    });
    save(); renderExercise(ex);
  });
  $view.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Eintrag löschen?')) return;
    S.logs = S.logs.filter(l => l.id !== b.dataset.del); save(); renderExercise(ex);
  }));
}

// ---------- Einrichten ----------
function renderSetup() {
  $title.textContent = 'Einrichten';
  const list = (items, add) => `<div class="card">${items}<button class="row add" data-add="${add}">+ Hinzufügen</button></div>`;

  const types = S.types.map(t => `<button class="row" data-type="${t.id}"><div class="grow">${esc(t.name)}</div>
    <div class="right">${(n => n + (n === 1 ? " Scheibe" : " Scheiben"))(S.plates.filter(p => p.typeId === t.id).length)}</div><span class="chev"></span></button>`).join('');

  const plates = sortedPlates(S.plates).map(p => `<button class="row" data-plate="${p.id}">
    <div class="grow">${fmt(p.weight)} kg <span class="tag">${esc(typeName(p.typeId))}</span></div>
    <div class="right">${p.count > 0 ? p.count + ' Stück' : ''}</div><span class="chev"></span></button>`).join('');

  const bars = S.bars.map(b => `<button class="row" data-bar="${b.id}">
    <div class="grow">${esc(b.name)}<div class="sub">${fmt(b.weight)} kg · passt: ${b.typeIds.map(id => esc(typeName(id))).join(', ') || 'nichts'}</div></div>
    <span class="chev"></span></button>`).join('');

  const exs = S.exercises.map(e => `<button class="row" data-exercise="${e.id}">
    <div class="grow">${esc(e.name)}<div class="sub">${esc((byId(S.bars, e.barId) || { name: 'keine Hantel' }).name)}</div></div>
    <span class="chev"></span></button>`).join('');

  $view.innerHTML = `
    <h2>Scheibenarten</h2>${list(types, 'type')}
    <div class="hint">Eine Art pro Lochdurchmesser. Name frei wählbar, z. B. „Dünn“ oder „30 mm“.</div>
    <h2>Scheiben</h2>${list(plates, 'plate')}
    <h2>Hanteln</h2>${list(bars, 'bar')}
    <div class="hint">Bei jeder Hantel anhaken, welche Scheibenarten draufpassen.</div>
    <h2>Übungen</h2>${list(exs, 'exercise')}
    <h2>Daten</h2>
    <div class="card">
      <button class="row" id="export"><div class="grow">Backup exportieren</div><span class="chev"></span></button>
      <label class="row" style="cursor:pointer"><div class="grow">Backup importieren</div>
        <input type="file" id="import" accept="application/json,.json" hidden><span class="chev"></span></label>
    </div>
    <div class="hint">Die Daten liegen nur auf diesem Gerät. Ab und zu ein Backup exportieren schadet nicht.</div>`;

  $view.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => editors[b.dataset.add]()));
  for (const k of ['type', 'plate', 'bar', 'exercise'])
    $view.querySelectorAll(`[data-${k}]`).forEach(b => b.addEventListener('click', () => editors[k](b.dataset[k])));
  $view.querySelector('#export').addEventListener('click', exportData);
  $view.querySelector('#import').addEventListener('change', importData);
}

// Generisches Formular im Dialog
const $modal = document.getElementById('modal');
const $form = document.getElementById('modal-form');
function openForm({ title, fields, values = {}, onSave, onDelete }) {
  const html = fields.map(f => {
    const v = values[f.key];
    if (f.type === 'select') return `<div class="field"><label>${f.label}<select name="${f.key}">
      ${f.options.map(o => `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label></div>`;
    if (f.type === 'checks') return `<div class="field"><label>${f.label}</label><div class="checks">
      ${f.options.map(o => `<label><input type="checkbox" name="${f.key}" value="${o.value}" ${(v || []).includes(o.value) ? 'checked' : ''}>${esc(o.label)}</label>`).join('')}</div></div>`;
    const mode = f.type === 'number' ? 'inputmode="decimal"' : '';
    const val = f.type === 'number' && v != null ? fmt(v) : (v ?? '');
    return `<div class="field"><label>${f.label}<input type="text" ${mode} name="${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}"></label></div>`;
  }).join('');
  $form.innerHTML = `<div class="form"><h3>${esc(title)}</h3>${html}
    <div class="actions"><button type="button" class="btn secondary" data-act="cancel">Abbrechen</button>
    <button type="submit" class="btn" data-act="ok">Speichern</button></div>
    ${onDelete ? '<button type="button" class="btn danger" data-act="delete">Löschen</button>' : ''}</div>`;
  $form.onsubmit = e => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      if (f.type === 'checks') out[f.key] = [...$form.querySelectorAll(`[name="${f.key}"]:checked`)].map(i => i.value);
      else if (f.type === 'number') out[f.key] = num($form.elements[f.key].value);
      else out[f.key] = $form.elements[f.key].value.trim();
    }
    const err = onSave(out);
    if (err) { alert(err); return; }
    save(); $modal.close(); render();
  };
  $form.querySelector('[data-act="cancel"]').onclick = () => $modal.close();
  const del = $form.querySelector('[data-act="delete"]');
  if (del) del.onclick = () => {
    const err = onDelete();
    if (err === false) return;
    if (err) { alert(err); return; }
    save(); $modal.close(); render();
  };
  $modal.showModal();
}

const typeOptions = () => S.types.map(t => ({ value: t.id, label: t.name }));
const editors = {
  type(id) {
    const t = id && byId(S.types, id);
    openForm({
      title: t ? 'Scheibenart' : 'Neue Scheibenart',
      fields: [{ key: 'name', label: 'Name', placeholder: 'z. B. 30 mm' }],
      values: t || {},
      onSave: v => {
        if (!v.name) return 'Bitte einen Namen eingeben.';
        if (t) t.name = v.name; else S.types.push({ id: uid(), name: v.name });
      },
      onDelete: t && (() => {
        if (S.plates.some(p => p.typeId === t.id)) return 'Es gibt noch Scheiben dieser Art. Erst die löschen.';
        if (!confirm(`„${t.name}“ löschen?`)) return false;
        S.types = S.types.filter(x => x !== t);
        S.bars.forEach(b => { b.typeIds = b.typeIds.filter(x => x !== t.id); });
      })
    });
  },
  plate(id) {
    const p = id && byId(S.plates, id);
    if (!S.types.length) return alert('Zuerst eine Scheibenart anlegen.');
    openForm({
      title: p ? 'Scheibe' : 'Neue Scheibe',
      fields: [
        { key: 'typeId', label: 'Art', type: 'select', options: typeOptions() },
        { key: 'weight', label: 'Gewicht (kg)', type: 'number', placeholder: 'z. B. 2,5' },
        { key: 'count', label: 'Anzahl insgesamt (optional)', type: 'number', placeholder: 'leer = egal' }
      ],
      values: p ? { ...p, count: p.count || null } : { typeId: S.types[0].id },
      onSave: v => {
        if (v.weight <= 0) return 'Bitte ein Gewicht eingeben.';
        const dup = S.plates.find(x => x !== p && x.typeId === v.typeId && x.weight === v.weight);
        if (dup) return 'Diese Scheibe gibt es schon.';
        const data = { typeId: v.typeId, weight: v.weight, count: Math.max(0, Math.round(v.count)) };
        if (p) Object.assign(p, data); else S.plates.push({ id: uid(), ...data });
      },
      onDelete: p && (() => {
        if (S.logs.some(l => l.perSide[p.id])) {
          if (!confirm('Diese Scheibe kommt in alten Einträgen vor. Dort fehlt sie dann bei der Berechnung. Trotzdem löschen?')) return false;
        } else if (!confirm('Scheibe löschen?')) return false;
        S.plates = S.plates.filter(x => x !== p);
      })
    });
  },
  bar(id) {
    const b = id && byId(S.bars, id);
    openForm({
      title: b ? 'Hantel' : 'Neue Hantel',
      fields: [
        { key: 'name', label: 'Name', placeholder: 'z. B. SZ-Stange' },
        { key: 'weight', label: 'Eigengewicht (kg)', type: 'number', placeholder: 'z. B. 7,5' },
        { key: 'sides', label: 'Seiten zum Beladen', type: 'select', options: [{ value: '2', label: '2 Seiten' }, { value: '1', label: '1 Seite' }] },
        { key: 'typeIds', label: 'Passende Scheibenarten', type: 'checks', options: typeOptions() }
      ],
      values: b ? { ...b, sides: String(b.sides) } : { sides: '2', typeIds: [] },
      onSave: v => {
        if (!v.name) return 'Bitte einen Namen eingeben.';
        const data = { name: v.name, weight: v.weight, sides: Number(v.sides), typeIds: v.typeIds };
        if (b) Object.assign(b, data); else S.bars.push({ id: uid(), ...data });
      },
      onDelete: b && (() => {
        if (S.exercises.some(e => e.barId === b.id)) return 'Diese Hantel wird noch von einer Übung benutzt.';
        if (!confirm(`„${b.name}“ löschen?`)) return false;
        S.bars = S.bars.filter(x => x !== b);
      })
    });
  },
  exercise(id) {
    const e = id && byId(S.exercises, id);
    if (!S.bars.length) return alert('Zuerst eine Hantel anlegen.');
    openForm({
      title: e ? 'Übung' : 'Neue Übung',
      fields: [
        { key: 'name', label: 'Name', placeholder: 'z. B. Bizepscurls' },
        { key: 'barId', label: 'Hantel', type: 'select', options: S.bars.map(b => ({ value: b.id, label: b.name })) }
      ],
      values: e || { barId: S.bars[0].id },
      onSave: v => {
        if (!v.name) return 'Bitte einen Namen eingeben.';
        if (e) Object.assign(e, v); else S.exercises.push({ id: uid(), ...v });
      },
      onDelete: e && (() => {
        const n = S.logs.filter(l => l.exerciseId === e.id).length;
        if (!confirm(`„${e.name}“${n ? ` und ${n} Einträge` : ''} löschen?`)) return false;
        S.exercises = S.exercises.filter(x => x !== e);
        S.logs = S.logs.filter(l => l.exerciseId !== e.id);
      })
    });
  }
};

// ---------- Backup ----------
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `weight-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt);
    if (!d || d.v !== 1 || !Array.isArray(d.logs)) throw new Error();
    if (!confirm('Backup laden? Die aktuellen Daten werden ersetzt.')) return;
    S = d; save(); render();
  }).catch(() => alert('Die Datei ist kein gültiges Backup.'));
  ev.target.value = '';
}

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
