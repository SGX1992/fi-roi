# Cross-check against Apple Numbers

`tests/verify.mjs` compares the engine with the values Excel cached in the
workbook, which only covers the workbook's own inputs. This folder recalculates
the workbook with *changed* inputs in Apple Numbers – an independent spreadsheet
engine – and compares every output cell with the web engine.

Last run (2026-10-20): 6 variants × 290 cells = 1,740 cells, 0 mismatches.
See `report.json` for the variants' headline figures and `variants.json` for
the inputs they change (scale, modules, scenarios, costs, ramp-up, activity
overrides, the 95 % cap, alternative software, zero-value edge cases).

## Running it

1. Open `tests/ROI_Calculator_Master_v2.xlsx` in Numbers (keep it the front
   document; the scripts address `document 1`).
2. Numbers drops the 108 formulas in Calculations!C54:E89 on import because it
   has no `N()` function – it keeps the cached numbers instead, so payback would
   never move. Re-insert them in equivalent form (`N(text header)` = 0,
   `N(number)` = the number):

   ```bash
   osascript tests/numbers-crosscheck/fix_monthly.applescript
   ```

3. Run the comparison (it drives Numbers via AppleScript; macOS asks once to
   allow automation):

   ```bash
   node tests/numbers-crosscheck/run.mjs
   ```

4. Close the document in Numbers without saving.

The formula text in `fix_monthly.applescript` uses `;` as the argument
separator, which is what Numbers expects on a German-locale system; use `,`
on an English one.
