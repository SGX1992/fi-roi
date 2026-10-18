/* Compares model.js with the values Excel calculated for the workbook's
   defaults (tests/expected-defaults.json, exported from
   ROI_Calculator_Master_v2.xlsx). Run: node tests/verify.mjs */
import { readFileSync } from 'node:fs';
import { compute, defaultState, SCENARIOS } from '../assets/js/model.js';

const expected = JSON.parse(readFileSync(new URL('./expected-defaults.json', import.meta.url)));
const m = compute(defaultState());
const got = {};

m.roles.forEach((r, i) => got[`Inputs!G${30 + i}`] = r.costPerHour);
m.ext.forEach((e, i) => got[`Inputs!E${38 + i}`] = e.withFI);
Object.assign(got, {
  'Inputs!C43': m.extTodayTotal, 'Inputs!E43': m.extWithFITotal,
  'Inputs!D47': m.oneTime.fee, 'Inputs!D48': m.oneTime.migration, 'Inputs!D49': m.oneTime.parallel,
  'Inputs!D50': m.oneTime.training, 'Inputs!D51': m.oneTime.total,
});
m.activities.forEach((a, i) => {
  const r = 7 + i;
  Object.assign(got, {
    [`Activities!F${r}`]: a.inScope, [`Activities!K${r}`]: a.units, [`Activities!L${r}`]: a.benchmark,
    [`Activities!N${r}`]: a.today, [`Activities!O${r}`]: a.conservative, [`Activities!P${r}`]: a.expected,
    [`Activities!Q${r}`]: a.optimistic, [`Activities!R${r}`]: a.applied, [`Activities!S${r}`]: a.withFI,
    [`Activities!T${r}`]: a.saved, [`Activities!U${r}`]: a.costPerHour, [`Activities!V${r}`]: a.value,
  });
});
Object.assign(got, {
  'Activities!L25': m.totals.benchmark, 'Activities!M25': m.totals.estimate, 'Activities!N25': m.totals.today,
  'Activities!R25': m.totals.applied, 'Activities!S25': m.totals.withFI, 'Activities!T25': m.totals.saved,
  'Activities!V25': m.totals.value,
  'Calculations!I13': m.scenarioIdx + 1,
});
const unitRows = ['Fixed','Locations × rounds','Entities × rounds','Data providers × rounds','Entities','Frameworks','Questionnaires','Suppliers','Products','Rounds'];
unitRows.forEach((d, i) => got[`Calculations!F${13 + i}`] = m.units[d]);
const rowMap = { 29: 'hoursToday', 30: 'hoursSaved', 31: 'staffCostToday', 32: 'capacityValue', 33: 'extToday', 34: 'extWithFI',
  35: 'netCash', 36: 'recurringNet', 37: 'transition', 38: 'year1Net', 39: 'costToday', 40: 'costWithFI', 41: 'year1CostWithFI',
  42: 'cost3yToday', 43: 'cost3yWithFI', 44: 'net3y', 45: 'roi3y', 46: 'invest3y', 47: 'netPerEuro', 48: 'payback', 49: 'workingDays', 50: 'fte' };
['C', 'D', 'E'].forEach((col, c) => {
  got[`Calculations!${col}28`] = c + 1;
  for (const [row, key] of Object.entries(rowMap)) got[`Calculations!${col}${row}`] = m.columns[c][key];
  m.columns[c].monthly.forEach((v, i) => got[`Calculations!${col}${54 + i}`] = v);
});
got['Calculations!F28'] = m.scenarioIdx + 1;
for (const [row, key] of Object.entries(rowMap)) got[`Calculations!F${row}`] = m.selected[key];
got['Calculations!C94'] = m.charts.threeYear[0].benefit;
got['Calculations!C95'] = m.charts.threeYear[1].benefit;
got['Calculations!D96'] = m.charts.threeYear[2].investment;
m.charts.hours.forEach((h, i) => { got[`Calculations!C${99 + i}`] = h.today; got[`Calculations!D${99 + i}`] = h.withFI; });

const st = defaultState();
Object.assign(got, {
  'Results!B2': `Business case: Footprint Intelligence for ${st.company}`,
  'Results!B3': `Compared with today's approach (${st.approach})  ·  Scenario: ${st.scenario}  ·  Step 3 of 3 – Results`,
  'Results!B7': m.headline.hoursSaved, 'Results!C7': m.headline.recurringNet, 'Results!E7': m.headline.roi3y,
  'Results!G7': m.headline.paybackText,
  'Results!B8': `${Math.round(m.headline.workingDays).toLocaleString('en-US')} working days  ·  ${m.headline.fte.toFixed(1)} FTE`,
  'Results!C12': m.annual.capacity.y1, 'Results!D12': m.annual.capacity.y2,
  'Results!C13': m.annual.cashSavings.y1, 'Results!D13': m.annual.cashSavings.y2,
  'Results!C14': m.annual.subscription.y1, 'Results!D14': m.annual.subscription.y2,
  'Results!C15': m.annual.transition.y1, 'Results!D15': m.annual.transition.y2,
  'Results!C16': m.annual.net.y1, 'Results!D16': m.annual.net.y2,
  'Results!C20': m.threeYear.capacity.y1, 'Results!D20': m.threeYear.capacity.y23, 'Results!E20': m.threeYear.capacity.total,
  'Results!C21': m.threeYear.cashSavings.y1, 'Results!D21': m.threeYear.cashSavings.y23, 'Results!E21': m.threeYear.cashSavings.total,
  'Results!C22': m.threeYear.subscription.y1, 'Results!D22': m.threeYear.subscription.y23, 'Results!E22': m.threeYear.subscription.total,
  'Results!C23': m.threeYear.transition.y1, 'Results!D23': m.threeYear.transition.y23, 'Results!E23': m.threeYear.transition.total,
  'Results!C24': m.threeYear.net.y1, 'Results!D24': m.threeYear.net.y23, 'Results!E24': m.threeYear.net.total,
  'Results!E25': m.threeYear.roi, 'Results!E26': m.threeYear.netPerEuro, 'Results!E27': m.threeYear.breakEvenShare,
});
const scRows = { 30: 'hoursSaved', 31: 'capacityValue', 32: 'netCash', 33: 'recurringNet', 34: 'year1Net', 35: 'net3y', 36: 'roi3y', 37: 'payback' };
['C', 'D', 'E'].forEach((col, c) => { for (const [row, key] of Object.entries(scRows)) got[`Results!${col}${row}`] = m.columns[c][key]; });
const altRows = ['capacity', 'cashSavings', 'subscription', 'transition', 'net'];
altRows.forEach((k, i) => { got[`Results!C${41 + i}`] = m.alternative[k].alt; got[`Results!D${41 + i}`] = m.alternative[k].fi; got[`Results!E${41 + i}`] = m.alternative[k].advantage; });

let fails = 0, checked = 0;
for (const [cell, exp] of Object.entries(expected)) {
  if (!(cell in got)) { console.log('NOT MAPPED', cell, exp); fails++; continue; }
  const g = got[cell];
  checked++;
  let ok;
  if (typeof exp === 'number') ok = typeof g === 'number' && Math.abs(g - exp) <= 1e-6 * Math.max(1, Math.abs(exp));
  else if (exp === 'True') ok = true;
  else ok = String(g) === String(exp);
  if (!ok) { fails++; console.log('MISMATCH', cell, 'expected', exp, 'got', g); }
}
console.log(`${checked} cells compared, ${fails} failures`);
process.exit(fails ? 1 : 0);
