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

The importer reads OOXML directly with a size-limited ZIP/XML reader, with no SheetJS reserialization or runtime dependency in this workspace. A ZIP/XML patch appends A–L cells to an existing approved monthly sheet after its entire used/styled/footer/merged range. All other ZIP member contents remain byte-for-byte unchanged; original target worksheet XML is retained except the dimension and appended row. Existing formulas are not shifted/recalculated or extended; accounting totals must be checked by the operator.

New month sheets are deliberately not invented: copy the company's approved template in Excel first. Explicit cell styles of the last data row are reused; if it has no date format, an unambiguous ISO date string is written. Blank financial cells are omitted. XML text is escaped and stored literally, including strings starting with `=`. Signed, table-bearing target sheets and unsupported layouts fail closed. Input is limited to 12MB, expanded ZIP to 64MB, and append position to 25,000 rows.

Desktop save requires explicit backup confirmation, rejects a file changed externally since load/last save, and reopens and compares saved bytes. OneDrive synchronization/conflict semantics cannot be guaranteed by the browser; no Graph integration was added.

## Local validation (2026-11-04)

- Importer regressions: **8 tests passed** across parser, sample integration and ZIP preservation. Includes exact mapping, invalid dates/times, periods, multiple plates, overnight review, duplicate/ambiguous existing records, date1904, literal strings, leading zero plates, optional cells, signed/table rejection and input limits.
- Changed importer/parser/workbook/test/script files: ESLint passed. Full repository lint attempt: 470 errors, 383 warnings; no autofix applied to unrelated code.
- Whole suite after isolating this feature from SheetJS: **40/50 test files passed**. The other 10 fail loading the existing `xlsx` dependency used by the separate HiPass/settlement pipeline. Full suite must be repeated after dependency setup.
- TypeScript: blocked by missing `xlsx` declarations in `hipassReconciler.ts` and `hipassSyncAndMasking.test.ts` (2 TS2307 diagnostics); not a passing whole-repo type check.
- Production build attempt: failed with missing SheetJS and blocked Google Fonts. Existing pinned SheetJS CDN artifact returns proxy HTTP 403. No package version/checksum/TLS verification was weakened. Other dependencies were installed separately for independent checks; this is not a completed frozen-lock installation.
- **Actual uploaded company workbook COPY tested**: sheet `4월`, actual used range `A1:X468` (different from older A01 QA's A1:L244). Added fictional test data ONLY in A–L at row 469. Existing X-column/footer contents retained; no new columns created. Every original target-sheet XML element, cell value/formula/style, merge/width metadata remained identical except dimension and appended row; every other ZIP member's uncompressed bytes identical. Input SHA256 `9f020dce0b4776c53c1fc4042dad7a0485060bdc4862effe91f5b2366915c30e` remained unchanged. Duplicate attempt blocked; missing 10월 template blocked. Output reopened successfully with the OOXML reader. Private workbooks are NOT committed.
- Reproduce copy QA: `npx tsx scripts/verify-kakao-workbook.ts INPUT.xlsx NEW_COPY.xlsx`. Script refuses to overwrite an existing output and asserts preservation and duplicate blocking. Fictional data is for QA only.
- Real-component Chromium harness **1440×1000 and 390×1000**: actual workbook COPY upload → extraction/review → row 469 append → download passed. Both downloaded XLSX copies independently compared with Python XML/ZIP and preserved original content. No horizontal overflow or browser errors. Extraction/review screen also checked at 390×844. Screenshots: `docs/qa/kakao-excel/desktop.png`, `mobile.png` (no company records shown).
- Desktop File System Access **test double**: external-change conflict rejected; write/close/reopen verification passed. This is not a claim of real OS file-picker permission coverage or live OneDrive synchronization.
- Full authenticated HQ, Excel desktop rendering/recalculation, mobile Safari, real Chrome/Edge OS file picker, live OneDrive conflicts and Postgres/HTTP suites remain unverified. Component harness is not a full-HQ end-to-end test.
- Initial pushed commit CI failed at workflow tests; full logs require authenticated GitHub API/web access. Updated commit must be checked after push; no green-CI claim.

## Required before merge

1. Apply allowed domains `cdn.sheetjs.com`, `fonts.googleapis.com`, `fonts.gstatic.com` in environment settings. `api.github.com` is needed for GitHub PR operations. Draft saved; runtime still returned HTTP 403 at last check.
2. `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:http`, and isolated `npm run test:db` per CI. Do not point tests/migrations at production services.
3. Actual uploaded workbook COPY XML/ZIP checks passed as above. Open the output in Excel itself and check display, totals, formulas and the newly appended row placement before operational use. Do not commit private workbooks.
4. Full authorized HQ PC/mobile navigation and file load/download checks, Chrome/Edge permission/save/reopen and external-change conflicts, mobile Safari upload/download fallback, and OneDrive conflict checks remain mandatory.

This is a draft integration, not a release approval. No main merge, deployment or production database changes.
