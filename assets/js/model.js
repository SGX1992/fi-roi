/* ROI Calculator – calculation engine.

   A one-to-one port of ROI_Calculator_Master_v2.xlsx. Every function below is
   named after the sheet and cell range it reproduces, and the formula is quoted
   next to it, so a change in the workbook can be carried over line by line.
   Nothing in here touches the DOM; tests/verify.mjs runs this file under Node
   against the values Excel itself calculated for the default inputs.

   Excel semantics that matter and how they are kept:
   - IFERROR(a/b,0)            -> div(a,b) returns 0 when b is 0 (or the result is not finite)
   - IF(M="",L,M)              -> an estimate of null/'' means "use the benchmark"; 0 is a real 0
   - XMATCH(TRUE,range>=0)     -> first 1-based month whose cumulative value is >= 0, else the text "> 36"
   - SUM over a range with text (Inputs!C42 = "–") ignores the text
*/

export const SCENARIOS = ['Conservative', 'Expected', 'Optimistic'];   // Calculations!F6:F8
export const APPROACHES = ['Manual / Excel', 'Other sustainability software', 'Consultancy-led', 'Combination']; // Calculations!B6:B9
export const ROUNDS = [1, 2, 4, 12];                                   // Calculations!H6:H9
export const YES_NO = ['Yes', 'No'];                                   // Calculations!D6:D7

/* Activities!O4 and Q4 – scenario factors applied to the "Expected" reduction. */
export const FACTOR_CONSERVATIVE = 0.7;
export const FACTOR_OPTIMISTIC = 1.25;
export const REDUCTION_CAP = 0.95;

/* Inputs!B30:H34 */
export const ROLE_NAMES = [
  'Sustainability team (full-time)',
  'Data providers (sites, HR, facilities, fleet)',
  'Finance & controlling',
  'Procurement',
  'Management & reviewers',
];

export const MODULES = [
  { key: 'carbon', label: 'Carbon accounting (corporate carbon footprint)', calcName: 'Carbon accounting' }, // Inputs!C21
  { key: 'esg',    label: 'ESG / CSRD reporting',                            calcName: 'ESG reporting' },     // Inputs!C22
  { key: 'pcf',    label: 'Product carbon footprints (PCF)',                 calcName: 'PCF' },               // Inputs!C23
  { key: 'supply', label: 'Supply chain & questionnaires',                   calcName: 'Supply chain' },      // Inputs!C24
  { key: 'decarb', label: 'Decarbonization planning',                        calcName: 'Decarbonization' },   // Inputs!C25
];

/* Activities!B7:J24 – the fixed part of every activity row. Editable cells
   (G done by, M your estimate, P expected reduction) live in state.activities. */
export const ACTIVITIES = [
  { n: 1,  name: 'Data requesting & import',                 how: 'Excel/CSV imports, document and electricity bill extraction, system integrations',          module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 8,  driver: 'Locations × rounds',      expected: 0.55 },
  { n: 2,  name: "Providing data (contributors' own time)",  how: 'Guided input forms and file uploads with AI extraction instead of re-typing',                module: 'Core',              doneBy: ROLE_NAMES[1], fixed: 0,  perUnit: 12, driver: 'Data providers × rounds', expected: 0.45 },
  { n: 3,  name: 'Data preparation & mapping',               how: 'AI-assisted classification, mapping and structuring; mappings are reused next period',      module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 6,  driver: 'Locations × rounds',      expected: 0.65 },
  { n: 4,  name: 'Emission factor research & maintenance',   how: 'Centrally maintained factor databases with reporting-year consistency',                     module: 'Carbon accounting', doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 4,  driver: 'Entities',                expected: 0.75 },
  { n: 5,  name: 'Calculations & consolidation',             how: 'Automated calculation and aggregation across entities and locations',                       module: 'Carbon accounting', doneBy: ROLE_NAMES[2], fixed: 40, perUnit: 12, driver: 'Entities × rounds',       expected: 0.75 },
  { n: 6,  name: 'Data validation & correction cycles',      how: 'AI-assisted plausibility checks, review workflows and structured approvals',                module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 30, perUnit: 5,  driver: 'Locations × rounds',      expected: 0.45 },
  { n: 7,  name: 'Task coordination & chasing contributors', how: 'Assignments, deadlines, automatic reminders and status tracking',                           module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 20, perUnit: 3,  driver: 'Data providers × rounds', expected: 0.6 },
  { n: 8,  name: 'Regulatory requirements & gap analysis',   how: 'Framework structures, guidance and mapping of existing data to disclosures',                module: 'ESG reporting',     doneBy: ROLE_NAMES[0], fixed: 20, perUnit: 30, driver: 'Frameworks',              expected: 0.35 },
  { n: 9,  name: 'Narrative drafting',                       how: 'AI-assisted draft answers based on existing inputs – human review retained',                module: 'ESG reporting',     doneBy: ROLE_NAMES[0], fixed: 0,  perUnit: 40, driver: 'Frameworks',              expected: 0.45 },
  { n: 10, name: 'Report creation & formatting',             how: 'Automated, one-click report generation',                                                     module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 20, perUnit: 25, driver: 'Frameworks',              expected: 0.65 },
  { n: 11, name: 'Dashboard & management updates',           how: 'Connected outputs – no copying of figures, refreshing charts or reconciling versions',       module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 20, perUnit: 20, driver: 'Rounds',                  expected: 0.7 },
  { n: 12, name: 'Evidence & assurance preparation',         how: 'Central source documents, references and audit trail for reviewers',                        module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 8,  driver: 'Entities',                expected: 0.45 },
  { n: 13, name: 'Management review & approvals',            how: 'Structured approval workflow with consistent, traceable figures',                            module: 'Core',              doneBy: ROLE_NAMES[4], fixed: 10, perUnit: 10, driver: 'Frameworks',              expected: 0.2 },
  { n: 14, name: 'Customer & supplier questionnaires',       how: 'AI agents reuse existing answers for recurring information requests',                        module: 'Supply chain',      doneBy: ROLE_NAMES[0], fixed: 0,  perUnit: 8,  driver: 'Questionnaires',          expected: 0.5 },
  { n: 15, name: 'Supplier data requests',                   how: 'Supplier surveys, automated reminders and structured supplier responses',                    module: 'Supply chain',      doneBy: ROLE_NAMES[3], fixed: 10, perUnit: 2,  driver: 'Suppliers',               expected: 0.5 },
  { n: 16, name: 'Product carbon footprints (PCF)',          how: 'Reusable product models and automated factor mapping',                                       module: 'PCF',               doneBy: ROLE_NAMES[0], fixed: 20, perUnit: 16, driver: 'Products',                expected: 0.55 },
  { n: 17, name: 'Decarbonization planning',                 how: 'Identification and prioritization of measures incl. financial implications',                 module: 'Decarbonization',   doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 0,  driver: 'Fixed',                   expected: 0.35 },
  { n: 18, name: 'Knowledge continuity & handovers',         how: 'Shared data, methods and workflows instead of individual spreadsheets',                      module: 'Core',              doneBy: ROLE_NAMES[0], fixed: 40, perUnit: 0,  driver: 'Fixed',                   expected: 0.5 },
];

/* Inputs!D30:D34 as the workbook ships them – the verifier runs against these. */
export const WORKBOOK_SALARIES = [70000, 55000, 75000, 65000, 120000];

/* The state the workbook opens with (used by tests/verify.mjs). */
export function workbookState() {
  const s = defaultState();
  s.roles.forEach((r, i) => { r.salary = WORKBOOK_SALARIES[i]; });
  return s;
}

/* Inputs sheet, yellow cells. Same as the workbook except the salaries, which
   the web version starts at €40,000 for every role (requested 2026-10-18). */
export function defaultState() {
  return {
    company: 'Your company',          // C6
    approach: 'Manual / Excel',       // C7
    covered: 0,                       // C8  share of FI savings already covered (0–1)
    rounds: 1,                        // C9
    scenario: 'Expected',             // C10
    entities: 5,                      // C13
    sites: 30,                        // C14
    frameworks: 3,                    // C15
    questionnaires: 10,               // C16
    suppliers: 20,                    // C17
    products: 5,                      // C18
    modules: { carbon: 'Yes', esg: 'Yes', pcf: 'No', supply: 'Yes', decarb: 'Yes' }, // C21:C25
    roles: [                          // C30:F34 (salary: web default 40k, workbook values in WORKBOOK_SALARIES)
      { people: 2,  salary: 40000, onCost: 0.25, hours: 1600 },
      { people: 25, salary: 40000, onCost: 0.25, hours: 1600 },
      { people: 2,  salary: 40000, onCost: 0.25, hours: 1600 },
      { people: 1,  salary: 40000, onCost: 0.25, hours: 1600 },
      { people: 2,  salary: 40000, onCost: 0.25, hours: 1600 },
    ],
    ext: [                            // C38:D41
      { today: 0,     still: 0 },     // current ESG software licence(s)
      { today: 5000,  still: 0 },     // emission factor databases & data subscriptions
      { today: 15000, still: 0.5 },   // external consultants
      { today: 0,     still: 1 },     // other external services
    ],
    fiSubscription: 39000,            // E42
    oneTime: { fee: 0, migration: 0, parallelMonths: 3, trainingHours: 80 }, // C47:C50
    rampUp: 0.6,                      // C54
    alt: { licence: 20000, oneTime: 0, share: 0.6, extra: 5000 },           // C58:C61
    activities: ACTIVITIES.map(a => ({ doneBy: a.doneBy, estimate: null, expected: a.expected })), // G, M, P
  };
}

/* ---------- Excel helpers ---------- */
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(+v)) ? 0 : +v;
const div = (a, b) => (b === 0 || !Number.isFinite(a / b)) ? 0 : a / b;   // IFERROR(a/b,0)
const sum = arr => arr.reduce((s, v) => s + num(v), 0);

/* ---------- the model ---------- */
export function compute(state) {
  const s = state;
  const scenarioIdx = Math.max(0, SCENARIOS.indexOf(s.scenario));   // Calculations!I13 (1-based in Excel)
  const covered = num(s.covered);                                   // Inputs!C8
  const rounds = num(s.rounds);                                     // Inputs!C9
  const rampUp = num(s.rampUp);                                     // Inputs!C54

  /* Inputs!G30:G34  =IFERROR(D*(1+E)/F,0) */
  const roles = s.roles.map((r, i) => ({
    name: ROLE_NAMES[i],
    people: num(r.people), salary: num(r.salary), onCost: num(r.onCost), hours: num(r.hours),
    costPerHour: div(num(r.salary) * (1 + num(r.onCost)), num(r.hours)),
  }));
  const costPerHourByRole = Object.fromEntries(roles.map(r => [r.name, r.costPerHour]));

  /* Inputs!E38:E41  =C*D ;  C43 =SUM(C38:C42) ; E43 =SUM(E38:E42) */
  const ext = s.ext.map(e => ({ today: num(e.today), still: num(e.still), withFI: num(e.today) * num(e.still) }));
  const fiSubscription = num(s.fiSubscription);                     // Inputs!E42
  const extTodayTotal = sum(ext.map(e => e.today));                 // Inputs!C43 (C42 is text and ignored by SUM)
  const extWithFITotal = sum(ext.map(e => e.withFI)) + fiSubscription; // Inputs!E43

  /* Inputs!D47:D51 */
  const oneTime = {
    fee: num(s.oneTime.fee),                                         // D47 =C47
    migration: num(s.oneTime.migration),                             // D48 =C48
    parallel: ext[0].today / 12 * num(s.oneTime.parallelMonths),     // D49 =C38/12*C49
    training: num(s.oneTime.trainingHours) * roles[0].costPerHour,   // D50 =C50*G30
  };
  oneTime.total = oneTime.fee + oneTime.migration + oneTime.parallel + oneTime.training; // D51

  /* Calculations!B13:C18 – module in scope */
  const inScope = { Core: 'Yes' };
  for (const m of MODULES) inScope[m.calcName] = s.modules[m.key] === 'Yes' ? 'Yes' : 'No';

  /* Calculations!E13:F22 – driver units */
  const units = {
    'Fixed': 0,
    'Locations × rounds': num(s.sites) * rounds,
    'Entities × rounds': num(s.entities) * rounds,
    'Data providers × rounds': roles[1].people * rounds,
    'Entities': num(s.entities),
    'Frameworks': num(s.frameworks),
    'Questionnaires': num(s.questionnaires),
    'Suppliers': num(s.suppliers),
    'Products': num(s.products),
    'Rounds': rounds,
  };

  /* Activities!F7:V24 */
  const activities = ACTIVITIES.map((a, i) => {
    const e = s.activities[i] || {};
    const doneBy = e.doneBy ?? a.doneBy;
    const estimate = (e.estimate === null || e.estimate === undefined || e.estimate === '') ? null : num(e.estimate);
    const expected = num(e.expected ?? a.expected);
    const inScopeRow = inScope[a.module] ?? 'No';                             // F =XLOOKUP(E,modules,inScope,"No")
    const unitCount = units[a.driver] ?? 0;                                   // K =XLOOKUP(J,drivers,units,0)
    const benchmark = inScopeRow === 'Yes' ? a.fixed + a.perUnit * unitCount : 0; // L =IF(F="Yes",H+I*K,0)
    const today = inScopeRow === 'Yes' ? (estimate === null ? benchmark : estimate) : 0; // N =IF(F="Yes",IF(M="",L,M),0)
    const conservative = Math.min(expected * FACTOR_CONSERVATIVE, REDUCTION_CAP); // O =MIN(P*$O$4,0.95)
    const optimistic = Math.min(expected * FACTOR_OPTIMISTIC, REDUCTION_CAP);     // Q =MIN(P*$Q$4,0.95)
    const byScenario = [conservative, expected, optimistic];
    const applied = byScenario[scenarioIdx] * (1 - covered);                  // R =INDEX(O:Q,I13)*(1-C8)
    const withFI = today * (1 - applied);                                     // S =N*(1-R)
    const saved = today - withFI;                                             // T =N-S
    const costPerHour = costPerHourByRole[doneBy] ?? 0;                       // U =XLOOKUP(G,roles,cost,0)
    const value = saved * costPerHour;                                        // V =T*U
    return { ...a, doneBy, estimate, expected, inScope: inScopeRow, units: unitCount, benchmark, today,
             conservative, optimistic, byScenario, applied, withFI, saved, costPerHour, value };
  });
  const act = activities;
  const totals = {                                                           // Activities row 25
    benchmark: sum(act.map(r => r.benchmark)),
    estimate: sum(act.map(r => r.estimate)),
    today: sum(act.map(r => r.today)),
    withFI: sum(act.map(r => r.withFI)),
    saved: sum(act.map(r => r.saved)),
    value: sum(act.map(r => r.value)),
  };
  totals.applied = totals.today === 0 ? 0 : 1 - totals.withFI / totals.today;   // R25 =IFERROR(1-S25/N25,0)

  /* Calculations!C29:E50 – scenario engine, one column per scenario */
  const columns = SCENARIOS.map((name, c) => {
    const hoursToday = sum(act.map(r => r.today));                                                     // row 29
    const hoursSaved = sum(act.map(r => r.today * r.byScenario[c])) * (1 - covered);                   // row 30
    const staffCostToday = sum(act.map(r => r.today * r.costPerHour));                                 // row 31
    const capacityValue = sum(act.map(r => r.today * r.byScenario[c] * r.costPerHour)) * (1 - covered); // row 32
    const extToday = extTodayTotal;                                                                    // row 33
    const extWithFI = extWithFITotal;                                                                  // row 34
    const netCash = extToday - extWithFI;                                                              // row 35
    const recurringNet = capacityValue + netCash;                                                      // row 36
    const transition = oneTime.total;                                                                  // row 37
    const year1Net = capacityValue * rampUp + netCash - transition;                                    // row 38
    const costToday = staffCostToday + extToday;                                                       // row 39
    const costWithFI = staffCostToday - capacityValue + extWithFI;                                     // row 40
    const year1CostWithFI = staffCostToday - capacityValue * rampUp + extWithFI + transition;          // row 41
    const cost3yToday = 3 * costToday;                                                                 // row 42
    const cost3yWithFI = year1CostWithFI + 2 * costWithFI;                                             // row 43
    const net3y = cost3yToday - cost3yWithFI;                                                          // row 44
    const roi3y = div(net3y, cost3yWithFI);                                                            // row 45
    const invest3y = 3 * fiSubscription + transition;                                                  // row 46
    const netPerEuro = div(net3y, invest3y);                                                           // row 47
    /* rows 54–89: cumulative monthly net benefit */
    const monthly = [];
    let cum = 0;
    for (let m = 1; m <= 36; m++) {
      const year = Math.ceil(m / 12);                                                                  // F =ROUNDUP(B/12,0)
      cum = cum + ((year === 1 ? capacityValue * rampUp : capacityValue) + netCash) / 12 - (m === 1 ? transition : 0);
      monthly.push(cum);
    }
    const firstPositive = monthly.findIndex(v => v >= 0);
    const payback = firstPositive === -1 ? '> 36' : firstPositive + 1;                                 // row 48 =IFERROR(XMATCH(TRUE,range>=0),"> 36")
    const workingDays = hoursSaved / 8;                                                                // row 49
    const fte = div(hoursSaved, roles[0].hours);                                                       // row 50 =IFERROR(C30/Inputs!F30,0)
    return { name, hoursToday, hoursSaved, staffCostToday, capacityValue, extToday, extWithFI, netCash, recurringNet,
             transition, year1Net, costToday, costWithFI, year1CostWithFI, cost3yToday, cost3yWithFI, net3y, roi3y,
             invest3y, netPerEuro, monthly, payback, workingDays, fte };
  });
  const sel = columns[scenarioIdx];                                            // Calculations!F29:F50 =INDEX(C:E,I13)

  /* Results sheet */
  const annual = {                                                             // Results!C12:D16
    capacity:     { y1: sel.capacityValue * rampUp, y2: sel.capacityValue },
    cashSavings:  { y1: extTodayTotal - (extWithFITotal - fiSubscription), y2: null },  // C13 =C43-(E43-E42)
    subscription: { y1: -fiSubscription, y2: null },
    transition:   { y1: -sel.transition, y2: 0 },
  };
  annual.cashSavings.y2 = annual.cashSavings.y1;
  annual.subscription.y2 = annual.subscription.y1;
  annual.net = { y1: annual.capacity.y1 + annual.cashSavings.y1 + annual.subscription.y1 + annual.transition.y1,
                 y2: annual.capacity.y2 + annual.cashSavings.y2 + annual.subscription.y2 + annual.transition.y2 };

  const threeYear = {                                                          // Results!C20:E24
    capacity:     { y1: annual.capacity.y1,     y23: 2 * annual.capacity.y2 },
    cashSavings:  { y1: annual.cashSavings.y1,  y23: 2 * annual.cashSavings.y2 },
    subscription: { y1: annual.subscription.y1, y23: 2 * annual.subscription.y2 },
    transition:   { y1: annual.transition.y1,   y23: 0 },
  };
  for (const k of Object.keys(threeYear)) threeYear[k].total = threeYear[k].y1 + threeYear[k].y23;
  threeYear.net = {
    y1: threeYear.capacity.y1 + threeYear.cashSavings.y1 + threeYear.subscription.y1 + threeYear.transition.y1,
    y23: threeYear.capacity.y23 + threeYear.cashSavings.y23 + threeYear.subscription.y23 + threeYear.transition.y23,
  };
  threeYear.net.total = threeYear.net.y1 + threeYear.net.y23;
  threeYear.roi = sel.roi3y;                                                   // E25
  threeYear.netPerEuro = sel.netPerEuro;                                       // E26
  threeYear.breakEvenShare = div(Math.max(0, -sel.netCash), sel.capacityValue); // E27 =IFERROR(MAX(0,-F35)/F32,0)

  /* Results!C41:E45 – alternative software, selected scenario */
  const altCapacity = sel.capacityValue * num(s.alt.share) * (rampUp + 2);                 // C41 =F32*C60*(C54+2)
  const altCash = 3 * (extTodayTotal - (extWithFITotal - fiSubscription) - num(s.alt.extra)); // C42
  const altSubscription = -3 * num(s.alt.licence);                                         // C43
  const altTransition = -(num(s.alt.oneTime) + oneTime.migration + oneTime.parallel + oneTime.training); // C44
  const alternative = {
    capacity:     { alt: altCapacity,     fi: threeYear.capacity.total },
    cashSavings:  { alt: altCash,         fi: threeYear.cashSavings.total },
    subscription: { alt: altSubscription, fi: threeYear.subscription.total },
    transition:   { alt: altTransition,   fi: threeYear.transition.total },
  };
  for (const k of Object.keys(alternative)) alternative[k].advantage = alternative[k].fi - alternative[k].alt;
  alternative.net = {
    alt: altCapacity + altCash + altSubscription + altTransition,
    fi: threeYear.capacity.total + threeYear.cashSavings.total + threeYear.subscription.total + threeYear.transition.total,
  };
  alternative.net.advantage = alternative.net.fi - alternative.net.alt;

  const headline = {                                                           // Results!B7:G8
    hoursSaved: sel.hoursSaved,
    recurringNet: sel.recurringNet,
    roi3y: sel.roi3y,
    payback: sel.payback,
    paybackText: typeof sel.payback === 'number' ? `${sel.payback} months` : '> 36 months',
    workingDays: sel.workingDays,
    fte: sel.fte,
  };

  const charts = {
    cumulative: columns.map(c => ({ name: c.name, values: c.monthly })),       // Calculations!B54:E89
    threeYear: [                                                               // Calculations!B93:D96
      { label: 'Internal capacity released', benefit: threeYear.capacity.total, investment: 0 },
      { label: 'Cash savings', benefit: threeYear.cashSavings.total, investment: 0 },
      { label: 'FI subscription & one-time costs', benefit: 0, investment: -(threeYear.subscription.total + threeYear.transition.total) },
    ],
    hours: act.map(r => ({ label: r.name, today: r.today, withFI: r.withFI })), // Calculations!B99:D116
  };

  return { scenarioIdx, roles, ext, fiSubscription, extTodayTotal, extWithFITotal, oneTime, inScope, units,
           activities, totals, columns, selected: sel, annual, threeYear, alternative, headline, charts };
}

/* ---------- number formats, as the workbook shows them ---------- */
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/* "€"#,##0;("€"#,##0);"–" */
export function fmtEur(v) {
  v = num(v);
  if (v === 0) return '–';
  const r = Math.round(Math.abs(v));
  if (r === 0) return v < 0 ? '(€0)' : '€0';
  return v < 0 ? `(€${nf0.format(r)})` : `€${nf0.format(r)}`;
}
/* "€"0.00 */
export const fmtEur2 = v => `€${num(v).toFixed(2)}`;
/* #,##0 */
export const fmtInt = v => nf0.format(Math.round(num(v)));
/* 0% */
export const fmtPct = v => `${Math.round(num(v) * 100)}%`;
/* #,##0" h" */
export const fmtHours = v => `${fmtInt(v)} h`;
/* 0.0 */
export const fmt1 = v => num(v).toFixed(1);
/* 0.00 */
export const fmt2 = v => num(v).toFixed(2);
