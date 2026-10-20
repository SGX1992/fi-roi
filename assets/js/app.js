/* ROI Calculator – interface. All arithmetic lives in model.js; this file binds
   inputs to state, patches the outputs and draws the three charts. */
import {
  compute, defaultState, SCENARIOS, APPROACHES, ROUNDS, ROLE_NAMES, MODULES, ACTIVITIES,
  FACTOR_CONSERVATIVE, FACTOR_OPTIMISTIC, REDUCTION_CAP,
  fmtEur, fmtEur2, fmtInt, fmtPct, fmtHours, fmt1,
} from './model.js';

const STORAGE = 'fi-roi-v3';   // bumped with each change of the defaults, so saved states from before do not mask them
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => 1 - Math.pow(1 - t, 3);

/* ---------- state ---------- */
let state = loadState();
let model = compute(state);
let currentView = 'inputs';

function loadState() {
  const base = defaultState();
  try {
    const h = new URLSearchParams(location.hash.slice(1)).get('s');
    if (h) return merge(base, JSON.parse(decodeURIComponent(escape(atob(h.replace(/-/g, '+').replace(/_/g, '/'))))));
  } catch (e) { /* bad link – fall through */ }
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return merge(base, JSON.parse(saved));
  } catch (e) { /* storage unavailable */ }
  return base;
}
function merge(base, patch) {
  if (Array.isArray(base)) return base.map((v, i) => (patch && patch[i] !== undefined) ? merge(v, patch[i]) : v);
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(patch || {})) if (k in base) out[k] = merge(base[k], patch[k]);
    return out;
  }
  return patch === undefined ? base : patch;
}
function diff(base, cur) {   // only what differs from the defaults, so links stay short
  if (Array.isArray(base)) {
    const d = base.map((v, i) => diff(v, cur[i]));
    return d.some(x => x !== undefined) ? d.map(x => x === undefined ? null : x) : undefined;
  }
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) { const d = diff(base[k], cur[k]); if (d !== undefined) out[k] = d; }
    return Object.keys(out).length ? out : undefined;
  }
  return base === cur ? undefined : cur;
}
function get(path) { return path.split('.').reduce((o, k) => o[k], state); }
function set(path, value) {
  const keys = path.split('.'); const last = keys.pop();
  keys.reduce((o, k) => o[k], state)[last] = value;
}
let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) { /* ignore */ }
    const d = diff(defaultState(), state);
    history.replaceState(null, '', d ? '#s=' + encodeState(d) : location.pathname);
  }, 150);
}
function encodeState(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- small helpers ---------- */
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined) n.append(c);
  return n;
}
/* text that highlights briefly when it changes */
function setText(node, text) {
  if (node.textContent === text) return;
  const had = node.textContent !== '';
  node.textContent = text;
  if (had && !reduced) { node.classList.remove('tick'); void node.offsetWidth; node.classList.add('tick'); }
}
/* numbers that move to their new value */
const tweens = new WeakMap();
function setNum(node, value, fmt) {
  const prev = node._v;
  node._v = value;
  if (prev === undefined || reduced || document.hidden || typeof value !== 'number' || typeof prev !== 'number' || prev === value) {
    node.textContent = fmt(value);
    if (prev !== undefined && prev !== value && !reduced) flash(node);
    return;
  }
  cancelAnimationFrame(tweens.get(node)); clearTimeout(node._settle);
  const t0 = performance.now(), dur = 650;
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    node.textContent = fmt(prev + (value - prev) * ease(t));
    if (t < 1) tweens.set(node, requestAnimationFrame(step));
  };
  tweens.set(node, requestAnimationFrame(step));
  /* frames are throttled in background tabs – the final value lands regardless */
  node._settle = setTimeout(() => { cancelAnimationFrame(tweens.get(node)); node.textContent = fmt(value); }, dur + 80);
  flash(node);
}
function flash(node) {
  node.classList.remove('tick', 'bump'); void node.offsetWidth;
  node.classList.add(node.closest('.dock') ? 'bump' : 'tick');
  const kpi = node.closest('.kpi'); if (kpi) { kpi.classList.remove('glow'); void kpi.offsetWidth; kpi.classList.add('glow'); }
}
function signClass(v) { return v < 0 ? 'neg' : (v > 0 ? 'pos' : ''); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- inputs ---------- */
function numberControl(path, { pct = false, min = 0, max, step = 1, unit, prefix, placeholder } = {}) {
  const input = el('input', { type: 'number', min, max: max ?? null, step, inputmode: 'decimal', placeholder: placeholder ?? null });
  input.dataset.k = path; if (pct) input.dataset.pct = '';
  const wrap = el('div', { class: `control is-input${unit ? ' has-unit' : ''}${prefix ? ' has-prefix' : ''}` },
    [prefix ? el('span', { class: 'prefix', text: prefix }) : null, input, unit ? el('span', { class: 'unit', text: unit }) : null]);
  return wrap;
}
function readInput(input) {
  const raw = input.value.trim();
  if (raw === '') return input.dataset.nullable !== undefined ? null : 0;
  let v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return input.dataset.nullable !== undefined ? null : 0;
  if (input.dataset.pct !== undefined) v = v / 100;
  const min = input.min !== '' ? +input.min : -Infinity, max = input.max !== '' ? +input.max : Infinity;
  const lo = input.dataset.pct !== undefined ? min / 100 : min, hi = input.dataset.pct !== undefined ? max / 100 : max;
  return Math.min(hi, Math.max(lo, v));
}
function writeInput(input, v) {
  if (document.activeElement === input) return;
  if (v === null || v === undefined) { input.value = ''; return; }
  if (input.tagName === 'SELECT' || input.type === 'text') { input.value = String(v); return; }
  input.value = input.dataset.pct !== undefined ? String(Math.round(v * 10000) / 100) : String(v);
}
function bindInputs(root = document) {
  for (const input of $$('[data-k]', root)) {
    if (input._bound) continue; input._bound = true;
    const handler = () => {
      let v;
      if (input.tagName === 'SELECT') v = input.dataset.num !== undefined ? +input.value : input.value;
      else if (input.type === 'text') v = input.value;
      else if (input.type === 'radio') { if (!input.checked) return; v = input.value; }
      else v = readInput(input);
      set(input.dataset.k, v);
      update();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', () => { handler(); syncInputs(); });
  }
}
function syncInputs() {
  for (const input of $$('[data-k]')) {
    const v = get(input.dataset.k);
    if (input.type === 'radio') input.checked = input.value === v;
    else writeInput(input, v);
  }
}

/* ---------- build: step 1 ---------- */
function fillSelect(sel, options, numeric) {
  for (const o of options) sel.append(el('option', { value: o, text: String(o) }));
  if (numeric) sel.dataset.num = '';
}
fillSelect($('#approachSel'), APPROACHES);
fillSelect($('#roundsSel'), ROUNDS, true);
fillSelect($('#scenarioSel'), SCENARIOS);

/* modules as tiles that switch on and off; Core is shown too, locked on */
const MODULE_DESC = {
  Core: 'Data requesting, preparation, validation, coordination, reporting, dashboards, evidence, approvals, knowledge continuity',
  'Carbon accounting': 'Emission factor maintenance, calculations & consolidation across entities',
  'ESG reporting': 'Regulatory requirements & gap analysis, narrative drafting for CSRD / ESRS, VSME and others',
  PCF: 'Product carbon footprints – uses the products per year from section 2',
  'Supply chain': 'Customer & supplier questionnaires, supplier data requests',
  Decarbonization: 'Identification and prioritization of reduction measures',
};
const ICO = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MODULE_ICON = {
  Core: ICO('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  'Carbon accounting': ICO('<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A7 7 0 0 0 4.7 12.3 3.5 3.5 0 0 0 6 19z"/><path d="M9 15h2.5a1.5 1.5 0 0 1 0 3H9z" opacity=".0"/>'),
  'ESG reporting': ICO('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/>'),
  PCF: ICO('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  'Supply chain': ICO('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>'),
  Decarbonization: ICO('<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'),
};
const modulesBox = $('#modules');
const moduleTiles = {};
const modTile = (calcName, label, key) => {
  const count = ACTIVITIES.filter(a => a.module === calcName).length;
  const btn = el('button', { type: 'button', class: 'mod-tile' + (key ? '' : ' is-locked'), role: 'checkbox', title: MODULE_DESC[calcName], 'aria-checked': key ? 'false' : 'true', 'aria-disabled': key ? null : 'true',
    onclick: key ? () => { state.modules[key] = state.modules[key] === 'Yes' ? 'No' : 'Yes'; update(); } : null }, [
    el('span', { class: 'mt-head' }, [el('span', { class: 'mt-icon', html: MODULE_ICON[calcName] }), el('span', { class: 'mt-name', text: label }), el('span', { class: 'mt-check', 'aria-hidden': 'true' })]),
    el('span', { class: 'mt-foot' }, [el('span', { class: 'mt-count', text: `${count} ${count === 1 ? 'activity' : 'activities'}` }), el('span', { class: 'mt-state', text: key ? '' : 'Always included' })]),
  ]);
  if (key) moduleTiles[key] = btn;
  modulesBox.append(btn);
};
modTile('Core', 'Core Data Management', null);
for (const key of ['carbon', 'esg', 'pcf', 'decarb', 'supply']) { const m = MODULES.find(x => x.key === key); modTile(m.calcName, m.label, m.key); }
function syncModuleTiles() {
  for (const m of MODULES) {
    const on = state.modules[m.key] === 'Yes', t = moduleTiles[m.key];
    t.setAttribute('aria-checked', String(on));
    $('.mt-state', t).textContent = on ? 'In scope' : 'Not in scope';
  }
}

const roleCells = [];
const rolesBody = $('#rolesTable tbody');
ROLE_NAMES.forEach((name, i) => {
  const tasks = ['Coordination, data preparation, calculation, reporting', 'Providing energy, travel, waste, HR and other source data',
    'Consolidation, reconciliation with financial data', 'Supplier data requests and supplier engagement', 'Reviews, approvals and sign-off'][i];
  const cost = el('td', { class: 'r calc strong' });
  roleCells.push(cost);
  rolesBody.append(el('tr', {}, [
    el('td', {}, [el('span', { class: 'cell-main', text: name }), el('span', { class: 'cell-sub', text: tasks })]),
    el('td', { class: 'r' }, numberControl(`roles.${i}.people`, { step: 1 })),
    el('td', { class: 'r' }, numberControl(`roles.${i}.salary`, { step: 1000, prefix: '€' })),
    el('td', { class: 'r' }, numberControl(`roles.${i}.onCost`, { pct: true, max: 100, unit: '%' })),
    el('td', { class: 'r' }, numberControl(`roles.${i}.hours`, { min: 100, step: 10, unit: 'h' })),
    cost,
  ]));
});

const EXT = [
  ['Current sustainability / ESG software licence(s)', 'Licences FI would replace. 0 for Manual / Excel – compare with another tool in section 8.'],
  ['Emission factor databases & data subscriptions', 'Maintained factor databases are included in Footprint Intelligence'],
  ['External consultants (data, calculation, reporting)', 'Share of consulting still needed for strategy or special topics'],
  ['Other external services (report design, translation, etc.)', ''],
];
const extCells = [];
const extBody = $('#extTable tbody');
EXT.forEach(([name, note], i) => {
  const withFI = el('td', { class: 'r calc' }); extCells.push(withFI);
  extBody.append(el('tr', {}, [
    el('td', { class: 'cell-main', text: name }),
    el('td', { class: 'r' }, numberControl(`ext.${i}.today`, { step: 500, prefix: '€' })),
    el('td', { class: 'r' }, numberControl(`ext.${i}.still`, { pct: true, max: 100, unit: '%' })),
    withFI,
    el('td', { class: 'cell-sub', text: note }),
  ]));
});
const extFiCell = el('td', { class: 'r calc strong' });
extBody.append(el('tr', {}, [
  el('td', { class: 'cell-main', text: 'Footprint Intelligence annual subscription (as per your offer)' }),
  el('td', { class: 'r calc', text: '–' }),
  el('td', { class: 'r calc' }),
  el('td', { class: 'r' }, numberControl('fiSubscription', { step: 500, prefix: '€' })),
  el('td', { class: 'cell-sub', text: 'Price according to your individual offer' }),
]));
const extTodayTotal = el('td', { class: 'r' }), extWithFITotal = el('td', { class: 'r' });
extBody.append(el('tr', { class: 'total' }, [el('td', { text: 'Total annual external costs' }), extTodayTotal, el('td'), extWithFITotal, el('td')]));

const ONE = [
  ['FI implementation / onboarding fee (as per your offer)', 'oneTime.fee', { prefix: '€', step: 500 }, 'One-time fee, if part of your offer'],
  ['External data migration / integration costs', 'oneTime.migration', { prefix: '€', step: 500 }, 'e.g. ERP or API integration by your IT partner'],
  ['Months of parallel licence for current software', 'oneTime.parallelMonths', { step: 1, unit: 'months' }, 'Contract overlap while switching'],
  ['Internal onboarding & training effort', 'oneTime.trainingHours', { step: 10, unit: 'h' }, "Valued at the sustainability team's cost per hour"],
];
const oneCells = [];
const oneBody = $('#oneTimeTable tbody');
ONE.forEach(([name, path, opts, note]) => {
  const cost = el('td', { class: 'r calc' }); oneCells.push(cost);
  oneBody.append(el('tr', {}, [el('td', { class: 'cell-main', text: name }), el('td', { class: 'r' }, numberControl(path, opts)), cost, el('td', { class: 'cell-sub', text: note })]));
});
const oneTotal = el('td', { class: 'r' });
oneBody.append(el('tr', { class: 'total' }, [el('td', { text: 'Total one-time transition costs' }), el('td'), oneTotal, el('td')]));

/* ---------- build: step 2 ---------- */
$('#factorNote').textContent = `${fmtPct(FACTOR_CONSERVATIVE)} and ${fmtPct(FACTOR_OPTIMISTIC)} of the expected reduction`;
const actRows = [];
const actBody = $('#actTable tbody');
ACTIVITIES.forEach((a, i) => {
  const doneBy = el('select'); doneBy.dataset.k = `activities.${i}.doneBy`; fillSelect(doneBy, ROLE_NAMES);
  const estimate = numberControl(`activities.${i}.estimate`, { step: 10, unit: 'h' });
  const estInput = $('input', estimate); estInput.dataset.nullable = ''; estInput.title = 'Your estimate (hours / year, optional) – replaces the benchmark';
  const c = {
    scope: el('span', { class: 'pill' }),
    benchLine: el('span', { class: 'bench' }),
    mech: el('div', { class: 'mech-body' }),
    applied: el('td', { class: 'r calc' }), withFI: el('td', { class: 'r calc' }), saved: el('td', { class: 'r calc strong' }),
    rate: el('td', { class: 'r calc' }), value: el('td', { class: 'r calc strong' }),
    estInput,
  };
  /* the benchmark mechanics open as a row of their own, full width, under the activity */
  c.mechRow = el('tr', { class: 'mech-row', hidden: true }, el('td', { colspan: 11 }, c.mech));
  const toggle = el('button', { type: 'button', class: 'mech-toggle', 'aria-expanded': 'false', onclick: () => {
    const open = c.mechRow.hidden; c.mechRow.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); c.tr.classList.toggle('is-open', open);
  } }, [c.benchLine]);
  c.tr = el('tr', {}, [
    el('td', { class: 'calc', text: a.n }),
    el('td', {}, [el('span', { class: 'cell-main', text: a.name }), el('span', { class: 'cell-sub', text: a.how })]),
    el('td', {}, [el('span', { class: 'cell-sub', text: a.module, style: 'margin:0 0 4px' }), c.scope]),
    el('td', {}, el('div', { class: 'control is-input' }, doneBy)),
    el('td', { class: 'r' }, [estimate, el('div', { style: 'margin-top:6px;text-align:right' }, toggle)]),
    el('td', { class: 'r' }, numberControl(`activities.${i}.expected`, { pct: true, max: 100, unit: '%' })),
    c.applied, c.withFI, c.saved, c.rate, c.value,
  ]);
  actRows.push(c);
  actBody.append(c.tr, c.mechRow);
});
const actTot = { today: el('td', { class: 'r' }), applied: el('td', { class: 'r' }), withFI: el('td', { class: 'r' }), saved: el('td', { class: 'r' }), value: el('td', { class: 'r' }) };
$('#actTable tfoot').append(el('tr', { class: 'total' }, [el('td', { colspan: 4, text: 'Total' }), actTot.today, el('td'), actTot.applied, actTot.withFI, actTot.saved, el('td'), actTot.value]));

/* ---------- build: step 3 ---------- */
function rows(tbody, spec) {   // spec: [[label, [cells...], {total, sub}]]
  const out = [];
  for (const [label, n, opts = {}] of spec) {
    const cells = Array.from({ length: n }, () => el('td', { class: 'r calc' + (opts.total ? ' strong' : '') }));
    const tr = el('tr', { class: opts.total ? 'total' : '' }, [el('td', { class: 'cell-main', text: label }), ...cells, opts.sub !== undefined ? el('td', { class: 'cell-sub', text: opts.sub }) : null]);
    tbody.append(tr); out.push(cells);
  }
  return out;
}
const annualCells = rows($('#annualTable tbody'), [
  ['Internal capacity released (value of time saved)', 2, { sub: 'Hours saved × fully loaded cost per hour. Year 1 reflects the ramp-up share. Released capacity – not a cash saving unless it reduces staffing or external spend.' }],
  ['Cash savings: software, databases & external services', 2, { sub: 'External costs today minus external costs still needed with FI' }],
  ['Footprint Intelligence subscription', 2, { sub: 'As per your offer' }],
  ['One-time transition costs', 2, { sub: 'Implementation fee, migration, parallel licences and internal onboarding time' }],
  ['Net benefit', 2, { total: true, sub: '' }],
]);
const threeCells = rows($('#threeYearTable tbody'), [
  ['Internal capacity released (value of time saved)', 3], ['Cash savings: software, databases & external services', 3],
  ['Footprint Intelligence subscription', 3], ['One-time transition costs', 3], ['Net benefit', 3, { total: true }],
]);
const scenCells = rows($('#scenTable tbody'), [
  ['Hours saved per year', 3], ['Internal capacity released (€ / year)', 3], ['Net cash impact incl. subscription (€ / year)', 3],
  ['Recurring annual net benefit (€ / year)', 3], ['Year-1 net benefit (€)', 3], ['3-year net benefit (€)', 3], ['3-year ROI', 3], ['Payback (months)', 3],
]);
const altCells = rows($('#altTable tbody'), [
  ['Internal capacity released (vs. today)', 3], ['Cash savings: software, databases & external services', 3],
  ['Software subscription', 3], ['One-time transition costs', 3], ['Net benefit over 3 years', 3, { total: true }],
]);

/* scenario tiles (Activities and Results) – they drive Inputs!C10. Each tile
   carries that scenario's own headline figures, so the three cases can be
   compared before one is chosen. */
const SCEN_DESC = {
  Conservative: `${fmtPct(FACTOR_CONSERVATIVE)} of the expected reduction per activity`,
  Expected: 'The reductions exactly as entered per activity',
  Optimistic: `${fmtPct(FACTOR_OPTIMISTIC)} of the expected reduction, capped at ${fmtPct(REDUCTION_CAP)}`,
};
const scenTiles = [];   // { box, tiles: [{ btn, hours, net, roi, payback }] }
function buildScenTiles(box, withStats) {
  if (!box) return;
  const tiles = SCENARIOS.map((name, i) => {
    const t = withStats ? { hours: el('b'), net: el('b'), roi: el('b'), payback: el('b') } : {};
    t.btn = el('button', { type: 'button', class: 'scen-tile' + (withStats ? '' : ' scen-tile--plain'), role: 'radio', 'aria-checked': 'false', style: `--i:${i}`,
      onclick: () => { if (state.scenario === name) return; state.scenario = name; syncInputs(); update(); } }, [
      el('span', { class: 'st-head' }, [el('span', { class: 'st-name', text: name }), el('span', { class: 'st-check', 'aria-hidden': 'true' })]),
      el('span', { class: 'st-desc', text: SCEN_DESC[name] }),
      withStats ? el('span', { class: 'st-stats' }, [
        el('span', {}, [el('small', { text: 'Time saved / yr' }), t.hours]),
        el('span', {}, [el('small', { text: 'Net benefit / yr' }), t.net]),
        el('span', {}, [el('small', { text: '3-year ROI' }), t.roi]),
        el('span', {}, [el('small', { text: 'Payback' }), t.payback]),
      ]) : null,
    ]);
    box.append(t.btn);
    return t;
  });
  scenTiles.push({ box, tiles });
}
/* Activities: the choice only. Results: each scenario with its own figures. */
buildScenTiles($('#scenTiles2'), false); buildScenTiles($('#scenTiles3'), true);
function syncScenSwitches() {
  for (const { tiles } of scenTiles) tiles.forEach((t, c) => {
    const col = model.columns[c];
    t.btn.setAttribute('aria-checked', String(SCENARIOS[c] === state.scenario));
    if (!t.hours) return;
    setNum(t.hours, col.hoursSaved, fmtHours);
    setNum(t.net, col.recurringNet, fmtEur); t.net.classList.toggle('neg', col.recurringNet < 0);
    setNum(t.roi, col.roi3y, fmtPct); t.roi.classList.toggle('neg', col.roi3y < 0);
    if (typeof col.payback === 'number') setNum(t.payback, col.payback, v => `${Math.round(v)} mo`); else setNum(t.payback, '> 36 mo', v => v);
  });
}

/* ---------- update everything from the model ---------- */
function update() {
  model = compute(state);
  const m = model;
  persist();
  syncModuleTiles();

  /* step 1 */
  m.roles.forEach((r, i) => setText(roleCells[i], `€${r.costPerHour.toFixed(2)}`));
  m.ext.forEach((e, i) => setText(extCells[i], fmtEur(e.withFI)));
  setText(extTodayTotal, fmtEur(m.extTodayTotal)); setText(extWithFITotal, fmtEur(m.extWithFITotal));
  [m.oneTime.fee, m.oneTime.migration, m.oneTime.parallel, m.oneTime.training].forEach((v, i) => setText(oneCells[i], fmtEur(v)));
  setText(oneTotal, fmtEur(m.oneTime.total));

  /* step 2 */
  m.activities.forEach((a, i) => {
    const c = actRows[i];
    c.tr.classList.toggle('out', a.inScope !== 'Yes');
    c.scope.textContent = a.inScope === 'Yes' ? 'In scope' : 'Not in scope';
    c.scope.className = `pill ${a.inScope === 'Yes' ? 'on' : 'off'}`;
    c.estInput.placeholder = fmtInt(a.benchmark);
    c.benchLine.innerHTML = `Benchmark <b>${fmtInt(a.benchmark)} h</b>${a.estimate !== null ? ' · overridden' : ''}`;
    c.mech.innerHTML = `<span><em>How the benchmark is built</em></span><span>Fixed hours / year <b>${fmtInt(a.fixed)}</b></span><span>Hours per unit <b>${fmtInt(a.perUnit)}</b></span><span>Driver <b>${a.driver}</b></span><span>Units from your inputs <b>${fmtInt(a.units)}</b></span><span>Benchmark <b>${fmtInt(a.fixed)} + ${fmtInt(a.perUnit)} × ${fmtInt(a.units)} = ${fmtInt(a.benchmark)} h</b></span><span>Conservative / Optimistic reduction <b>${fmtPct(a.conservative)} / ${fmtPct(a.optimistic)}</b></span>`;
    setText(c.applied, fmtPct(a.applied)); setText(c.withFI, fmtInt(a.withFI)); setText(c.saved, fmtInt(a.saved));
    setText(c.rate, `€${a.costPerHour.toFixed(2)}`); setText(c.value, fmtEur(a.value));
  });
  setText(actTot.today, fmtInt(m.totals.today)); setText(actTot.applied, fmtPct(m.totals.applied));
  setText(actTot.withFI, fmtInt(m.totals.withFI)); setText(actTot.saved, fmtInt(m.totals.saved)); setText(actTot.value, fmtEur(m.totals.value));

  /* step 3 – headline */
  $('#resTitle').textContent = `Business case: Footprint Intelligence for ${state.company || 'your company'}`;
  $('#resSub').textContent = `Compared with today's approach (${state.approach})  ·  Scenario: ${state.scenario}  ·  Step 3 of 3 – Results`;
  const h = m.headline;
  setNum($('#kHours'), h.hoursSaved, fmtHours);
  $('#kHoursSub').textContent = `${fmtInt(h.workingDays)} working days  ·  ${fmt1(h.fte)} FTE`;
  setNum($('#kNet'), h.recurringNet, fmtEur);
  setNum($('#kRoi'), h.roi3y, fmtPct);
  if (typeof h.payback === 'number') setNum($('#kPayback'), h.payback, v => `${Math.round(v)} months`); else setNum($('#kPayback'), h.paybackText, v => v);
  $('#kNet').classList.toggle('neg', h.recurringNet < 0); $('#kRoi').classList.toggle('neg', h.roi3y < 0);

  /* return on investment – Calculations!F44, F46, F47, F45, F48 for the selected scenario */
  const sel = m.selected;
  setNum($('#roiPerEuro'), sel.netPerEuro, fmtEur2);
  setNum($('#roiInvest'), sel.invest3y, fmtEur);
  setNum($('#roiReturn'), sel.net3y, fmtEur);
  setNum($('#roiRoi'), sel.roi3y, fmtPct);
  if (typeof sel.payback === 'number') setNum($('#roiPayback'), sel.payback, v => `${Math.round(v)} months`); else setNum($('#roiPayback'), '> 36 months', v => v);
  $('#roiReturn').classList.toggle('neg', sel.net3y < 0); $('#roiRoi').classList.toggle('neg', sel.roi3y < 0); $('#roiPerEuro').classList.toggle('neg', sel.netPerEuro < 0);
  const ringFill = $('#roiRingFill'), circ = 2 * Math.PI * 84;
  ringFill.style.strokeDasharray = circ;
  ringFill.style.strokeDashoffset = circ * (1 - Math.max(0, Math.min(1, sel.netPerEuro)));
  $('#roiRing').classList.toggle('over', sel.netPerEuro > 1);
  $('#roiLine').textContent = sel.net3y >= 0
    ? `Over 3 years, every €1 spent on Footprint Intelligence (${fmtEur(sel.invest3y)} in total) returns ${fmtEur2(sel.netPerEuro)} in net benefit on top of paying for itself – ${fmtEur(sel.net3y)} in total, ${state.scenario.toLowerCase()} scenario.`
    : `Over 3 years, the ${state.scenario.toLowerCase()} scenario does not recover the ${fmtEur(sel.invest3y)} spent on Footprint Intelligence: the net result is ${fmtEur(sel.net3y)}. Check the activities and external costs, or compare scenarios below.`;

  /* dock – a sweep crosses the bar whenever the headline moves */
  const sig = [h.hoursSaved, h.recurringNet, h.roi3y, h.payback].join('|');
  if (update.sig && update.sig !== sig && !reduced) { const d = $('#dock'); d.classList.remove('sweep'); void d.offsetWidth; d.classList.add('sweep'); }
  update.sig = sig;
  setNum($('#dHours'), h.hoursSaved, fmtHours); setNum($('#dNet'), h.recurringNet, fmtEur); setNum($('#dRoi'), h.roi3y, fmtPct);
  if (typeof h.payback === 'number') setNum($('#dPayback'), h.payback, v => `${Math.round(v)} mo`); else setNum($('#dPayback'), '> 36 mo', v => v);
  $('#dScen').textContent = state.scenario;

  /* annual + 3-year */
  const A = m.annual, T = m.threeYear;
  const eur = (cell, v) => { setText(cell, fmtEur(v)); cell.classList.remove('neg', 'pos'); if (v < 0) cell.classList.add('neg'); };
  [[A.capacity.y1, A.capacity.y2], [A.cashSavings.y1, A.cashSavings.y2], [A.subscription.y1, A.subscription.y2], [A.transition.y1, A.transition.y2], [A.net.y1, A.net.y2]]
    .forEach((vals, r) => vals.forEach((v, c) => eur(annualCells[r][c], v)));
  [T.capacity, T.cashSavings, T.subscription, T.transition, T.net].forEach((row, r) => [row.y1, row.y23, row.total].forEach((v, c) => eur(threeCells[r][c], v)));
  setNum($('#rRoi'), T.roi, fmtPct); setNum($('#rPerEuro'), T.netPerEuro, fmtEur2); setNum($('#rBreakEven'), T.breakEvenShare, fmtPct);

  /* scenario comparison */
  m.columns.forEach((col, c) => {
    setText(scenCells[0][c], fmtInt(col.hoursSaved)); eur(scenCells[1][c], col.capacityValue); eur(scenCells[2][c], col.netCash);
    eur(scenCells[3][c], col.recurringNet); eur(scenCells[4][c], col.year1Net); eur(scenCells[5][c], col.net3y);
    setText(scenCells[6][c], fmtPct(col.roi3y)); scenCells[6][c].classList.toggle('neg', col.roi3y < 0);
    setText(scenCells[7][c], typeof col.payback === 'number' ? String(col.payback) : col.payback);
  });
  $$('#scenTable thead th').forEach((th, i) => th.style.color = (i === m.scenarioIdx + 1) ? 'var(--accent)' : '');
  scenCells.forEach(r => r.forEach((cell, c) => cell.classList.toggle('strong', c === m.scenarioIdx)));

  /* alternative */
  const AL = m.alternative;
  [AL.capacity, AL.cashSavings, AL.subscription, AL.transition, AL.net].forEach((row, r) => {
    eur(altCells[r][0], row.alt); eur(altCells[r][1], row.fi); eur(altCells[r][2], row.advantage);
    altCells[r][2].classList.toggle('pos', row.advantage > 0);
  });

  syncScenSwitches();
  drawCharts();
}

/* ============================================================
   Charts – plain SVG, animated by interpolating the data.
   ============================================================ */
const svgNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, children = []) {
  const n = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}
function niceTicks(min, max, n = 5) {
  const span = Math.max(1, max - min), raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => span / x <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const kEur = v => (Math.abs(v) >= 1000 ? `${v < 0 ? '−' : ''}€${Math.round(Math.abs(v) / 1000)}k` : `€${Math.round(v)}`);
const charts = {};   // name -> { cur: number[], target: number[], raf }
function animateTo(name, target, draw) {
  const ch = charts[name] || (charts[name] = { cur: null });
  cancelAnimationFrame(ch.raf);
  const first = !ch.cur;
  if (first || reduced || document.hidden || ch.cur.length !== target.length) { ch.cur = target.slice(); draw(ch.cur, first); return; }
  const from = ch.cur.slice(), t0 = performance.now(), dur = 700;
  clearTimeout(ch.settle);
  const step = now => {
    const t = ease(Math.min(1, (now - t0) / dur));
    ch.cur = from.map((v, i) => v + (target[i] - v) * t);
    draw(ch.cur, false);
    if (t < 1) ch.raf = requestAnimationFrame(step);
  };
  ch.raf = requestAnimationFrame(step);
  ch.settle = setTimeout(() => { cancelAnimationFrame(ch.raf); ch.cur = target.slice(); draw(ch.cur, false); }, dur + 80);
}
function tooltipFor(box) {
  let tip = $('.tip', box);
  if (!tip) { tip = el('div', { class: 'tip' }); box.append(tip); }
  return tip;
}
function showTip(box, tip, x, y, html) {
  const r = box.getBoundingClientRect();
  tip.innerHTML = html; tip.classList.add('on');
  const w = tip.offsetWidth, left = Math.max(w / 2 + 4, Math.min(r.width - w / 2 - 4, x));
  tip.style.left = left + 'px'; tip.style.top = y + 'px';
}
const SERIES = [{ key: 'cons', color: 'var(--s-cons)', dash: '6 5' }, { key: 'exp', color: 'var(--s-exp)', dash: null }, { key: 'opt', color: 'var(--s-opt)', dash: '2 4' }];

function drawCharts() { drawCumulative(); drawBars(); drawHoursChart(); }

/* 1 · cumulative net benefit over 36 months, three scenarios */
function drawCumulative() {
  const box = $('#chartCum');
  const series = model.charts.cumulative;
  const flat = series.flatMap(s => s.values);
  animateTo('cum', flat, (vals, first) => {
    const W = 920, H = 340, L = 64, R = 96, Tp = 18, B = 46;
    const all = vals.concat([0]); const ticks = niceTicks(Math.min(...all), Math.max(...all), 5);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const x = mth => L + (mth - 1) / 35 * (W - L - R);
    const y = v => Tp + (1 - (v - y0) / (y1 - y0)) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Cumulative net benefit over 36 months by scenario' });
    /* year bands + grid */
    for (let yr = 0; yr < 3; yr++) {
      if (yr % 2 === 1) svg.append(sv('rect', { x: x(yr * 12 + 1), y: Tp, width: x(yr * 12 + 12) - x(yr * 12 + 1), height: H - Tp - B, fill: 'rgba(255,255,255,.018)' }));
      svg.append(sv('text', { x: (x(yr * 12 + 1) + x(yr * 12 + 12)) / 2, y: H - 10, 'text-anchor': 'middle', class: 'axis-label' }, document.createTextNode(`Year ${yr + 1}`)));
    }
    for (const t of ticks) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === 0 ? 'zero-line' : 'grid-line' }));
      svg.append(sv('text', { x: L - 10, y: y(t) + 4, 'text-anchor': 'end' }, document.createTextNode(kEur(t))));
    }
    for (const mth of [1, 6, 12, 18, 24, 30, 36]) svg.append(sv('text', { x: x(mth), y: H - B + 16, 'text-anchor': 'middle', class: 'axis-label' }, document.createTextNode(mth)));
    /* lines */
    const sel = model.scenarioIdx;
    series.forEach((s, i) => {
      const pts = vals.slice(i * 36, i * 36 + 36);
      const d = pts.map((v, j) => `${j ? 'L' : 'M'}${x(j + 1).toFixed(1)},${y(v).toFixed(1)}`).join('');
      const path = sv('path', { d, fill: 'none', stroke: SERIES[i].color, 'stroke-width': i === sel ? 2.6 : 1.8, 'stroke-dasharray': SERIES[i].dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'series', opacity: i === sel ? 1 : .8 });
      if (first && !reduced) { path.classList.add('draw'); path.style.setProperty('--len', 2200); }
      svg.append(path);
      /* direct label at the line end */
      svg.append(sv('text', { x: x(36) + 8, y: y(pts[35]) + 4, class: 'lbl', style: `fill:${SERIES[i].color};font-weight:${i === sel ? 600 : 500}` }, document.createTextNode(s.name)));
    });
    /* payback marker for the selected scenario */
    const pb = model.selected.payback;
    if (typeof pb === 'number') {
      const v = vals[sel * 36 + pb - 1];
      svg.append(sv('line', { x1: x(pb), x2: x(pb), y1: y(0), y2: y(v), stroke: 'rgba(255,255,255,.25)', 'stroke-dasharray': '2 3' }));
      svg.append(sv('circle', { cx: x(pb), cy: y(v), r: 5, fill: '#0B0B0B', stroke: SERIES[sel].color, 'stroke-width': 2.2, class: 'dot' }));
      svg.append(sv('text', { x: x(pb), y: y(v) - 12, 'text-anchor': 'middle', class: 'lbl' }, document.createTextNode(`Payback · month ${pb}`)));
    }
    /* hover */
    const cross = sv('line', { x1: 0, x2: 0, y1: Tp, y2: H - B, stroke: 'rgba(255,255,255,.3)', opacity: 0, class: 'crosshair' });
    const dots = series.map((s, i) => sv('circle', { r: 4, fill: SERIES[i].color, opacity: 0 }));
    svg.append(cross, ...dots);
    const hit = sv('rect', { x: L, y: Tp, width: W - L - R, height: H - Tp - B, class: 'hit' });
    const tip = tooltipFor(box);
    hit.addEventListener('pointermove', e => {
      const rect = svg.getBoundingClientRect(); const px = (e.clientX - rect.left) / rect.width * W;
      const mth = Math.max(1, Math.min(36, Math.round((px - L) / (W - L - R) * 35 + 1)));
      cross.setAttribute('x1', x(mth)); cross.setAttribute('x2', x(mth)); cross.setAttribute('opacity', 1);
      const cur = charts.cum.cur;
      dots.forEach((dot, i) => { dot.setAttribute('cx', x(mth)); dot.setAttribute('cy', y(cur[i * 36 + mth - 1])); dot.setAttribute('opacity', 1); });
      const rowsHtml = series.map((s, i) => `<div class="row"><span><i style="--c:${SERIES[i].color}"></i>${s.name}</span><b>${fmtEur(cur[i * 36 + mth - 1])}</b></div>`).join('');
      showTip(box, tip, x(mth) / W * rect.width, y(Math.max(...series.map((s, i) => cur[i * 36 + mth - 1]))) / H * rect.height, `<b>Month ${mth}</b> · cumulative net benefit${rowsHtml}`);
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); tip.classList.remove('on'); });
    svg.append(hit);
    const legend = el('div', { class: 'legend' }, series.map((s, i) => el('span', {}, [el('i', { class: SERIES[i].dash ? (i === 0 ? 'dash' : 'dot') : '', style: `--c:${SERIES[i].color}` }), s.name + (i === sel ? ' (selected)' : '')])));
    box.replaceChildren(svg, legend, tip);
  });
}

/* 2 · 3 years: benefits vs. investment */
function drawBars() {
  const box = $('#chartBars');
  const d = model.charts.threeYear;
  const target = [d[0].benefit, d[1].benefit, d[2].investment];
  animateTo('bars', target, (vals, first) => {
    const W = 460, H = 320, L = 56, R = 16, Tp = 30, B = 40;
    const [cap, cash, inv] = vals; const benefits = cap + cash;
    const max = Math.max(benefits, inv, 1); const ticks = niceTicks(0, max, 4); const top = ticks[ticks.length - 1];
    const y = v => Tp + (1 - v / top) * (H - Tp - B);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Three-year benefits versus investment' });
    for (const t of ticks) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === 0 ? 'zero-line' : 'grid-line' }));
      svg.append(sv('text', { x: L - 10, y: y(t) + 4, 'text-anchor': 'end' }, document.createTextNode(kEur(t))));
    }
    const bw = 120, gap = 2, cx = [L + (W - L - R) * .3, L + (W - L - R) * .7];
    const tip = tooltipFor(box);
    const seg = (x, v0, v1, color, label, name) => {
      const hgt = Math.max(0, y(v0) - y(v1) - gap);
      const r = sv('rect', { x: x - bw / 2, y: y(v1), width: bw, height: hgt, rx: 4, fill: color, class: 'bar' + (first && !reduced ? ' grow-y' : '') });
      r.style.setProperty('--i', svg.querySelectorAll('rect.bar').length);
      r.addEventListener('pointermove', e => { const rect = svg.getBoundingClientRect(); showTip(box, tip, (e.clientX - rect.left), (e.clientY - rect.top) - 6, `<b>${name}</b><div class="row"><span><i style="--c:${color}"></i>${label}</span><b>${fmtEur(v1 - v0)}</b></div>`); });
      r.addEventListener('pointerleave', () => tip.classList.remove('on'));
      svg.append(r);
      if (hgt > 22) svg.append(sv('text', { x, y: (y(v0) + y(v1)) / 2 + 4, 'text-anchor': 'middle', class: 'lbl', style: 'fill:#0B0B0B;pointer-events:none' }, document.createTextNode(fmtEur(v1 - v0))));
    };
    seg(cx[0], 0, cap, 'var(--s-fi)', 'Internal capacity released', 'Benefits');
    seg(cx[0], cap, cap + cash, 'var(--s-opt)', 'Cash savings', 'Benefits');
    seg(cx[1], 0, inv, 'var(--s-today)', 'FI subscription & one-time costs', 'Investment');
    svg.append(sv('text', { x: cx[0], y: y(benefits) - 8, 'text-anchor': 'middle', class: 'lbl' }, document.createTextNode(fmtEur(benefits))));
    svg.append(sv('text', { x: cx[1], y: y(inv) - 8, 'text-anchor': 'middle', class: 'lbl' }, document.createTextNode(fmtEur(inv))));
    svg.append(sv('text', { x: cx[0], y: H - 14, 'text-anchor': 'middle', class: 'lbl-dim' }, document.createTextNode('Benefits')));
    svg.append(sv('text', { x: cx[1], y: H - 14, 'text-anchor': 'middle', class: 'lbl-dim' }, document.createTextNode('Investment')));
    const legend = el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { class: 'sq', style: '--c:var(--s-fi)' }), 'Internal capacity released']),
      el('span', {}, [el('i', { class: 'sq', style: '--c:var(--s-opt)' }), 'Cash savings']),
      el('span', {}, [el('i', { class: 'sq', style: '--c:var(--s-today)' }), 'FI subscription & one-time costs']),
    ]);
    box.replaceChildren(svg, legend, tip);
  });
}

/* 3 · hours per year by activity, today vs. with FI */
function drawHoursChart() {
  const box = $('#chartHours');
  const d = model.charts.hours;
  const target = d.flatMap(r => [r.today, r.withFI]);
  animateTo('hours', target, (vals, first) => {
    const rowH = 30, L = 190, R = 60, Tp = 8, B = 8, W = 520, H = Tp + d.length * rowH + B;
    const grow = first && !reduced ? ' grow-x' : '';
    const max = Math.max(1, ...vals); const top = niceTicks(0, max, 4).pop();
    const x = v => L + v / top * (W - L - R);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Hours per year by activity, today versus with Footprint Intelligence' });
    const tip = tooltipFor(box);
    d.forEach((r, i) => {
      const today = vals[i * 2], fi = vals[i * 2 + 1], yTop = Tp + i * rowH;
      const g = sv('g', { opacity: model.activities[i].inScope === 'Yes' ? 1 : .35 });
      const name = r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label;
      g.append(sv('text', { x: L - 10, y: yTop + 18, 'text-anchor': 'end' }, document.createTextNode(name)));
      g.style.setProperty('--i', i);
      g.append(sv('rect', { x: L, y: yTop + 6, width: Math.max(0, x(today) - L), height: 9, rx: 3, fill: 'var(--s-today)', class: 'bar' + grow }));
      g.append(sv('rect', { x: L, y: yTop + 17, width: Math.max(0, x(fi) - L), height: 9, rx: 3, fill: 'var(--s-fi)', class: 'bar' + grow }));
      g.append(sv('text', { x: x(Math.max(today, fi)) + 6, y: yTop + 18, class: 'lbl-dim' }, document.createTextNode(`${fmtInt(today)} → ${fmtInt(fi)} h`)));
      const hit = sv('rect', { x: 0, y: yTop, width: W, height: rowH, class: 'hit' });
      hit.addEventListener('pointermove', e => { const rect = svg.getBoundingClientRect(); showTip(box, tip, e.clientX - rect.left, yTop / H * rect.height + 2, `<b>${r.label}</b><div class="row"><span><i style="--c:var(--s-today)"></i>Hours today</span><b>${fmtInt(today)} h</b></div><div class="row"><span><i style="--c:var(--s-fi)"></i>Hours with FI</span><b>${fmtInt(fi)} h</b></div><div class="row"><span>Saved</span><b>${fmtInt(today - fi)} h</b></div>`); });
      hit.addEventListener('pointerleave', () => tip.classList.remove('on'));
      g.append(hit);
      svg.append(g);
    });
    const legend = el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { class: 'sq', style: '--c:var(--s-today)' }), 'Hours today']),
      el('span', {}, [el('i', { class: 'sq', style: '--c:var(--s-fi)' }), 'Hours with Footprint Intelligence']),
    ]);
    box.replaceChildren(svg, legend, tip);
  });
}

/* ---------- views ---------- */
function showView(name, { scroll = true } = {}) {
  currentView = name;
  for (const v of $$('.view')) {
    const on = v.id === `view-${name}`;
    if (on && v.hidden) {
      v.hidden = false;
      $$(':scope > *', v).forEach((c, i) => c.style.setProperty('--i', i));
      v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
      setTimeout(() => v.classList.remove('enter'), 1200);
      /* whatever is already on screen shows at once; the observer only handles what is scrolled to.
         A timer backs both up, so nothing can stay invisible if the observer never fires. */
      const vh = window.innerHeight || 800;
      for (const c of $$('.reveal', v)) if (c.getBoundingClientRect().top < vh * 1.15) c.classList.add('in');
      clearTimeout(v._revealAll);
      v._revealAll = setTimeout(() => { for (const c of $$('.reveal', v)) c.classList.add('in'); }, 2500);
    } else if (!on) v.hidden = true;
  }
  for (const t of $$('.step')) t.setAttribute('aria-selected', String(t.dataset.view === name));
  $('.steps').dataset.view = name;
  $('#dockResults').textContent = name === 'results' ? 'Edit inputs' : 'See results →';
  $('#dockResults').dataset.goto = name === 'results' ? 'inputs' : 'results';
  if (name === 'results') {
    for (const k of Object.keys(charts)) charts[k].cur = null;
    if (!reduced) for (const n of $$('#view-results .k-value, #view-results .r-value, .roi-facts b, #roiPerEuro, #scenTiles3 b')) if (typeof n._v === 'number') n._v = 0;
    update();
  }
  requestAnimationFrame(syncScenSwitches);
  if (scroll) window.scrollTo({ top: Math.max(0, $('.steps').getBoundingClientRect().top + window.scrollY - 16), behavior: reduced ? 'auto' : 'smooth' });
  try { sessionStorage.setItem('fi-roi-view', name); } catch (e) { /* ignore */ }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-goto],[data-view]');
  if (!t) return;
  showView(t.dataset.goto || t.dataset.view);
});
$('#printBtn').addEventListener('click', () => { showView('results', { scroll: false }); setTimeout(() => window.print(), 200); });
$('#dockPrint').addEventListener('click', () => { showView('results', { scroll: false }); setTimeout(() => window.print(), 200); });
$('#resetBtn').addEventListener('click', () => {
  state = defaultState(); syncInputs(); update(); toast('Reset to the default values');
});
$('#shareBtn').addEventListener('click', async () => {
  const d = diff(defaultState(), state);
  const url = location.origin + location.pathname + (d ? '#s=' + encodeState(d) : '');
  try { await navigator.clipboard.writeText(url); toast('Link with your inputs copied'); }
  catch (e) { prompt('Copy this link', url); }
});
window.addEventListener('resize', () => syncScenSwitches());

/* ---------- flourishes ---------- */
/* the headline arrives word by word */
(() => {
  const h = $('#heroTitle'); const words = h.textContent.trim().split(/\s+/);
  h.replaceChildren(...words.flatMap((w, i) => [el('span', { class: 'w', text: w, style: `--w:${i}` }), document.createTextNode(' ')]));
})();
/* cards further down rise into view as they are scrolled to */
if ('IntersectionObserver' in window && !reduced) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const c of $$('.view > .card, .view > .grid, .view > .kpis')) { c.classList.add('reveal'); io.observe(c); }
}
/* a spotlight follows the pointer across the KPI cards and they tilt toward it */
if (!reduced && matchMedia('(hover:hover)').matches) {
  document.addEventListener('pointermove', e => {
    const k = e.target.closest('.kpi, .roi-card'); if (!k) return;
    const r = k.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    k.style.setProperty('--mx', mx + 'px'); k.style.setProperty('--my', my + 'px');
    if (k.classList.contains('kpi')) {
      const rx = ((my / r.height) - .5) * -5, ry = ((mx / r.width) - .5) * 6;
      k.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`;
    }
  });
  document.addEventListener('pointerout', e => { const k = e.target.closest('.kpi'); if (k && !k.contains(e.relatedTarget)) k.style.transform = ''; });
}
/* a ripple from the point of the click on steps and buttons */
if (!reduced) document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.step, .cta, .scen-tile, .mod-tile:not(.is-locked)'); if (!b) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
  const rp = el('span', { class: 'ripple', style: `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px` });
  b.append(rp); rp.addEventListener('animationend', () => rp.remove());
});

/* ---------- go ---------- */
bindInputs();
syncInputs();
update();
let startView = 'inputs';
try { startView = sessionStorage.getItem('fi-roi-view') || 'inputs'; } catch (e) { /* ignore */ }
if (location.hash.includes('s=')) startView = 'results';   // a shared link opens on the business case
showView(startView, { scroll: false });
$$('.page > *').forEach((c, i) => c.style.setProperty('--i', i));

/* ---------- access gate ----------
   A static site cannot keep a secret: this compares a hash in the browser and
   keeps casual visitors out, nothing more. The unlock is remembered per browser. */
const GATE_HASH = '0c59e405607552899fe446695148d2d5d76cf66ce486d002c6206a2340560a58';
const GATE_KEY = 'fi-roi-unlock';
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function gateUnlocked() { try { return localStorage.getItem(GATE_KEY) === GATE_HASH; } catch (e) { return false; } }
(() => {
  const gate = $('#gate'), form = $('#gateForm'), input = $('#gateInput'), err = $('#gateError'), card = $('.gate-card');
  if (!gate || gateUnlocked() || !crypto.subtle) { gate && gate.remove(); return startIntro(); }
  gate.hidden = false; $('#loader').hidden = true;
  setTimeout(() => input.focus(), 350);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = (await sha256(input.value.trim())) === GATE_HASH;
    if (!ok) {
      err.hidden = false; input.select();
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      return;
    }
    try { localStorage.setItem(GATE_KEY, GATE_HASH); } catch (e2) { /* ignore */ }
    err.hidden = true; card.classList.add('ok');
    $('#loader').hidden = false;
    gate.classList.add('done');
    setTimeout(() => gate.remove(), 700);
    startIntro();
  });
})();
$('#lockBtn').addEventListener('click', () => {
  try { localStorage.removeItem(GATE_KEY); } catch (e) { /* ignore */ }
  toast('Locked – the access code is required again on the next visit');
});

/* ---------- intro: a progress bar fills while the fonts arrive, then the page deals in ---------- */
function startIntro() {
  const loader = $('#loader'), fill = $('#loaderFill'), pct = $('#loaderPct'), label = $('#loaderLabel');
  const ready = () => { document.body.classList.add('ready'); requestAnimationFrame(syncScenSwitches); };
  if (!loader) return ready();
  if (reduced) { loader.remove(); return ready(); }
  let seen = false;
  try { seen = sessionStorage.getItem('fi-roi-seen') === '1'; sessionStorage.setItem('fi-roi-seen', '1'); } catch (e) { /* ignore */ }
  const minMs = seen ? 420 : 1250, maxMs = 3000, t0 = performance.now();
  const labels = ['Preparing your business case', 'Loading benchmarks', 'Warming up the scenario engine', 'Almost there'];
  let fontsDone = false, finished = false;
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { fontsDone = true; });
  const finish = () => {
    if (finished) return; finished = true;
    fill.style.width = '100%'; pct.textContent = '100%'; label.textContent = 'Ready';
    setTimeout(() => {
      loader.classList.add('done'); ready();
      loader.addEventListener('transitionend', () => loader.remove(), { once: true });
      setTimeout(() => loader.remove(), 1200);
    }, 260);
  };
  const tick = () => {
    if (finished) return;
    const t = performance.now() - t0;
    /* ease toward 92% over the minimum time, hold there until the fonts are in */
    const p = Math.min(.92, .92 * (1 - Math.pow(1 - Math.min(1, t / minMs), 3)));
    fill.style.width = (p * 100).toFixed(1) + '%'; pct.textContent = Math.round(p * 100) + '%';
    if (!seen) label.textContent = labels[Math.min(labels.length - 1, Math.floor(t / (minMs / labels.length)))];
    if ((t >= minMs && fontsDone) || t >= maxMs) finish(); else setTimeout(tick, 32);
  };
  tick();
}
