# Footprint Intelligence ROI calculator

roi.footprint-intelligence.com – the ROI workbook (`ROI_Calculator_Master_v2.xlsx`)
as a web page: enter company profile, people and costs, review the hours per
activity, get the management summary (time saved, net benefit, 3-year ROI,
payback, scenarios, charts).

Same chrome as share.footprint-intelligence.com: Poppins, near-black, one accent.

## Where the formulas live

`assets/js/model.js` is a one-to-one port of the workbook. Every function is
annotated with the sheet and cell range it reproduces, so a change in the
workbook can be carried over line by line. Nothing in the interface does
arithmetic.

`tests/verify.mjs` runs the engine against the values Excel itself calculated
for the workbook's own inputs (`workbookState()`; the web page starts with a
€40,000 salary for every role instead of the workbook's figures) (`tests/expected-defaults.json`, 563 cells exported from
the workbook in `tests/`). Run it after any change to the model:

```bash
node tests/verify.mjs
```

## Running it

```bash
node serve.mjs      # http://localhost:8831
```

No build step, no dependencies. Inputs are kept in the browser's localStorage
and in the URL hash (`#s=…`), which is what "Copy link" produces – nothing is
sent to a server.

## Publishing

GitHub Pages from `main`, custom domain via `CNAME`. The DNS record for
`roi.footprint-intelligence.com` already points at `sgx1992.github.io`.
