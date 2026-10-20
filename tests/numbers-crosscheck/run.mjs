/* Recalculates the workbook in Numbers for each variant and compares every
   output cell with the web engine. Numbers is an independent spreadsheet
   engine, so agreement here means the port matches the sheet's formulas,
   not just the cached values Excel left in the file. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compute, defaultState, SCENARIOS, ROLE_NAMES, MODULES } from '../../assets/js/model.js';

const HERE = new URL('./', import.meta.url).pathname;
const variants = JSON.parse(readFileSync(HERE + 'variants.json', 'utf8'));

function merge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base)) return base.map((v, i) => merge(v, patch[i]));
  if (base && typeof base === 'object') { const o = { ...base }; for (const k of Object.keys(patch)) o[k] = merge(base[k], patch[k]); return o; }
  return patch;
}
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const num = v => String(v);

/* ---------- which cells to set (state -> Inputs / Activities cells) ---------- */
function setters(st) {
  const I = [], A = [];
  const put = (arr, cell, v) => arr.push([cell, v]);
  put(I, 'C6', st.company); put(I, 'C7', st.approach); put(I, 'C8', st.covered); put(I, 'C9', st.rounds); put(I, 'C10', st.scenario);
  put(I, 'C13', st.entities); put(I, 'C14', st.sites); put(I, 'C15', st.frameworks); put(I, 'C16', st.questionnaires); put(I, 'C17', st.suppliers); put(I, 'C18', st.products);
  MODULES.forEach((m, i) => put(I, `C${21 + i}`, st.modules[m.key]));
  st.roles.forEach((r, i) => { put(I, `C${30 + i}`, r.people); put(I, `D${30 + i}`, r.salary); put(I, `E${30 + i}`, r.onCost); put(I, `F${30 + i}`, r.hours); });
  st.ext.forEach((e, i) => { put(I, `C${38 + i}`, e.today); put(I, `D${38 + i}`, e.still); });
  put(I, 'E42', st.fiSubscription);
  put(I, 'C47', st.oneTime.fee); put(I, 'C48', st.oneTime.migration); put(I, 'C49', st.oneTime.parallelMonths); put(I, 'C50', st.oneTime.trainingHours);
  put(I, 'C54', st.rampUp);
  put(I, 'C58', st.alt.licence); put(I, 'C59', st.alt.oneTime); put(I, 'C60', st.alt.share); put(I, 'C61', st.alt.extra);
  st.activities.forEach((a, i) => { put(A, `G${7 + i}`, a.doneBy); put(A, `M${7 + i}`, a.estimate === null ? '' : a.estimate); put(A, `P${7 + i}`, a.expected); });
  return { I, A };
}

/* ---------- which cells to read, and the engine value for each ---------- */
function expectations(m, st) {
  const e = {};
  const R = (c, v) => e['Results!' + c] = v, C = (c, v) => e['Calculations!' + c] = v, Ac = (c, v) => e['Activities!' + c] = v;
  R('B7', m.headline.hoursSaved); R('C7', m.headline.recurringNet); R('E7', m.headline.roi3y); R('G7', m.headline.paybackText);
  const A = m.annual, T = m.threeYear;
  R('C12', A.capacity.y1); R('D12', A.capacity.y2); R('C13', A.cashSavings.y1); R('D13', A.cashSavings.y2); R('C14', A.subscription.y1); R('D14', A.subscription.y2);
  R('C15', A.transition.y1); R('D15', A.transition.y2); R('C16', A.net.y1); R('D16', A.net.y2);
  [['20', T.capacity], ['21', T.cashSavings], ['22', T.subscription], ['23', T.transition], ['24', T.net]].forEach(([r, row]) => { R('C' + r, row.y1); R('D' + r, row.y23); R('E' + r, row.total); });
  R('E25', T.roi); R('E26', T.netPerEuro); R('E27', T.breakEvenShare);
  const sc = { 30: 'hoursSaved', 31: 'capacityValue', 32: 'netCash', 33: 'recurringNet', 34: 'year1Net', 35: 'net3y', 36: 'roi3y', 37: 'payback' };
  ['C', 'D', 'E'].forEach((col, c) => { for (const [r, k] of Object.entries(sc)) R(col + r, m.columns[c][k]); });
  const AL = m.alternative;
  ['capacity', 'cashSavings', 'subscription', 'transition', 'net'].forEach((k, i) => { R('C' + (41 + i), AL[k].alt); R('D' + (41 + i), AL[k].fi); R('E' + (41 + i), AL[k].advantage); });
  const rows = { 29: 'hoursToday', 30: 'hoursSaved', 31: 'staffCostToday', 32: 'capacityValue', 33: 'extToday', 34: 'extWithFI', 35: 'netCash', 36: 'recurringNet', 37: 'transition', 38: 'year1Net', 39: 'costToday', 40: 'costWithFI', 41: 'year1CostWithFI', 42: 'cost3yToday', 43: 'cost3yWithFI', 44: 'net3y', 45: 'roi3y', 46: 'invest3y', 47: 'netPerEuro', 48: 'payback', 49: 'workingDays', 50: 'fte' };
  ['C', 'D', 'E'].forEach((col, c) => { for (const [r, k] of Object.entries(rows)) C(col + r, m.columns[c][k]); });
  for (const [r, k] of Object.entries(rows)) C('F' + r, m.selected[k]);
  ['C', 'D', 'E'].forEach((col, c) => { [1, 6, 12, 13, 24, 36].forEach(mth => C(col + (53 + mth), m.columns[c].monthly[mth - 1])); });
  m.activities.forEach((a, i) => { const r = 7 + i; Ac('N' + r, a.today); Ac('R' + r, a.applied); Ac('S' + r, a.withFI); Ac('T' + r, a.saved); Ac('U' + r, a.costPerHour); Ac('V' + r, a.value); });
  Ac('N25', m.totals.today); Ac('S25', m.totals.withFI); Ac('T25', m.totals.saved); Ac('V25', m.totals.value); Ac('R25', m.totals.applied);
  return e;
}

/* ---------- AppleScript ---------- */
function script(sets, reads) {
  const lines = [];
  lines.push('tell application "Numbers"');
  lines.push('  set doc to document 1');
  lines.push('  set tI to table 1 of sheet "Inputs" of doc');
  lines.push('  set tA to table 1 of sheet "Activities" of doc');
  lines.push('  set tR to table 1 of sheet "Results" of doc');
  lines.push('  set tC to table 1 of sheet "Calculations" of doc');
  for (const [cell, v] of sets.I) lines.push(`  set value of cell "${cell}" of tI to ${typeof v === 'number' ? num(v) : q(v)}`);
  for (const [cell, v] of sets.A) lines.push(`  set value of cell "${cell}" of tA to ${typeof v === 'number' ? num(v) : q(v)}`);
  lines.push('  delay 1.5');
  lines.push('  set out to {}');
  const tbl = { Results: 'tR', Calculations: 'tC', Activities: 'tA' };
  for (const key of reads) {
    const [sheet, cell] = key.split('!');
    lines.push(`  set end of out to "${key}=" & (value of cell "${cell}" of ${tbl[sheet]})`);
  }
  lines.push('  set AppleScript\'s text item delimiters to linefeed');
  lines.push('  return out as text');
  lines.push('end tell');
  return lines.join('\n');
}
function parse(v) {
  if (v === 'missing value' || v === '') return '';
  if (/^-?\d+(,\d+)?(E[+-]?\d+)?$/.test(v)) return Number(v.replace(',', '.'));
  return v;
}

/* ---------- run ---------- */
let totalChecked = 0, totalFail = 0;
const report = [];
for (const v of variants) {
  const st = merge(defaultState(), v.state);
  const m = compute(st);
  const exp = expectations(m, st);
  const keys = Object.keys(exp);
  const src = script(setters(st), keys);
  writeFileSync(HERE + 'last.applescript', src);
  const out = execFileSync('osascript', ['-'], { input: src, encoding: 'utf8', maxBuffer: 1 << 24 });
  const got = {};
  for (const line of out.split('\n')) { const i = line.indexOf('='); if (i > 0) got[line.slice(0, i)] = parse(line.slice(i + 1).trim()); }
  let fails = [];
  for (const k of keys) {
    const e = exp[k], g = got[k];
    let ok;
    if (typeof e === 'number') ok = typeof g === 'number' && Math.abs(g - e) <= 1e-6 * Math.max(1, Math.abs(e));
    else ok = String(g).trim() === String(e).trim();
    if (!ok) fails.push({ cell: k, engine: e, numbers: g });
  }
  totalChecked += keys.length; totalFail += fails.length;
  report.push({ name: v.name, checked: keys.length, fails, headline: { hours: m.headline.hoursSaved, net: m.headline.recurringNet, roi: m.headline.roi3y, payback: m.headline.paybackText } });
  console.log(`${v.name}: ${keys.length} cells, ${fails.length} mismatches  | web: ${Math.round(m.headline.hoursSaved)} h, €${Math.round(m.headline.recurringNet)}, ${Math.round(m.headline.roi3y * 100)} %, ${m.headline.paybackText}`);
  for (const f of fails.slice(0, 12)) console.log('   MISMATCH', f.cell, 'engine', f.engine, 'numbers', f.numbers);
}
writeFileSync(HERE + 'report.json', JSON.stringify(report, null, 2));
console.log(`\nTOTAL ${totalChecked} cells across ${variants.length} variants, ${totalFail} mismatches`);
process.exit(totalFail ? 1 : 0);
