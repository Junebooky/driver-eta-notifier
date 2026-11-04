# HQ KakaoTalk → Excel integration

Base: latest A02 `fix/comprehensive-repo-audit`, `1cccdeb84de73e9039d465c95d8c39f42fde4e4f`.
Source: PR #44 `bd1aa259ce9f5c51e448dd5873f942221684d960` and A01 QA comment 6596954948.

## Behavior

- Independent `/hq?tab=excel_import` sidebar workspace; latest A02 navigation and other workspaces retained. White/slate cards and brand #1E60F3, no black/green accents in new workspace.
- Reuses A01's local extraction, exact full-plate fleet mapping, A–L field review, duplicate checks, download and desktop file-picker flow. Original text stays in browser memory; no AI, database writes or messaging added.
- I–L remain genuinely absent unless explicitly supplied. Expenses never become invoice revenue. No new columns or expense detail fields.
- Period/multiple date reports and multi-plate input are left for manual confirmation. Invalid times are blocked; a decreasing end time is not silently changed to next day. Explicit `17:30~24:20` and `11(13:20~24:20)` are accepted. Unknown models must be manually confirmed. Review checkbox required after each edit.
- Existing period/multi-plate workbook rows conservatively block potentially duplicate records. Ambiguous suffixes are never used to map a fleet model.

## Workbook preservation changes from PR #44

SheetJS is used to read/inspect, **not to reserialize the workbook**. A ZIP/XML patch appends A–L cells to an existing approved monthly sheet after its entire used/styled/footer/merged range. All other ZIP member contents remain byte-for-byte unchanged; original target worksheet XML is retained except the dimension and appended row. Existing formulas are not shifted/recalculated or extended; accounting totals must be checked by the operator.

New month sheets are deliberately not invented: copy the company's approved template in Excel first. Explicit cell styles of the last data row are reused; if it has no date format, an unambiguous ISO date string is written. Blank financial cells are omitted. XML text is escaped and stored literally, including strings starting with `=`. Signed, table-bearing target sheets and unsupported layouts fail closed. Input is limited to 12MB, expanded ZIP to 64MB, and append position to 25,000 rows.

Desktop save requires explicit backup confirmation, rejects a file changed externally since load/last save, and reopens and compares saved bytes. OneDrive synchronization/conflict semantics cannot be guaranteed by the browser; no Graph integration was added.

## Local validation (2026-11-04)

- Parser regression: 3 tests passed, including original report, exact mapping, invalid dates/times, periods, multiple plates, and overnight review.
- Changed importer/parser/workbook/test files: ESLint passed. Full repository lint: 470 errors, 383 warnings; no autofix applied to unrelated code.
- Whole suite initial attempt: 37/49 test files passed, 12 failed to load missing `xlsx`. A parser-only file was subsequently split out and passed. Full suite must be repeated after dependency setup.
- TypeScript: blocked only by missing `xlsx` declarations (5 TS2307 diagnostics); not a passing type check.
- Production build: failed with missing SheetJS and blocked Google Fonts. Existing pinned SheetJS CDN artifact returns proxy HTTP 403. No package version/checksum/TLS verification was weakened. Other dependencies were installed separately for independent checks; this is not a completed frozen-lock installation.
- Browser component harness: Chromium 1440×1000 and 390×844; extraction, fleet mapping, review gate, no horizontal overflow and no browser errors passed. Screenshots inspected. This is an isolated real-component test, not an authenticated full-HQ end-to-end test. It did not exercise file upload/save because the pinned workbook dependency was unavailable.
- Synthetic workbook preservation/duplicate tests authored, **not yet executed** due to SheetJS dependency. Synthetic fixture includes legacy numeric headings, period and multiple-plate rows, formula, merge, widths, footer at row 244 and opaque ZIP metadata.

## Required before merge

1. Apply allowed domains `cdn.sheetjs.com`, `fonts.googleapis.com`, `fonts.gstatic.com` in environment settings. `api.github.com` is needed for GitHub PR operations. Draft saved; runtime still returned HTTP 403 at last check.
2. `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:http`, and isolated `npm run test:db` per CI. Do not point tests/migrations at production services.
3. Provide a **copy** of `차량 이용 내역 관리기록부2026년(1).xlsx`. It is intentionally absent from the repo and this environment. Compare all existing cell values/formulas/styles, merges, column widths, sheet names and unusual rows before/after, in Excel itself. Do not commit private workbooks.
4. Full authorized HQ PC/mobile navigation and file load/download checks, Chrome/Edge permission/save/reopen and external-change conflicts, mobile Safari upload/download fallback, and OneDrive conflict checks remain mandatory.

This is a draft integration, not a release approval. No main merge, deployment or production database changes.
