> Historical PR #44 design notes. The integrated behavior and current validation supersede these notes: see [KAKAO_EXCEL_INTEGRATION_QA.md](KAKAO_EXCEL_INTEGRATION_QA.md). In particular missing monthly templates are now blocked, and no whole-workbook SheetJS rewrite occurs.

# KakaoTalk → Excel monthly register (2026-11-03)

## Approved scope

This workflow **does not** export the entire driver log, expense breakdown, mileage, or any new data column. It only fills the **existing A–L columns** of the office's uploaded `차량 이용 내역 관리기록부2026년(1).xlsx` format.

Reference workbook inspection: a single `4월` sheet with 244 used rows (actual fleet-operation rows end at 113, isolated footer cells follow), A–L layout:

A date · B car number (usually last four digits) · C model · D customer · E driver · F time · G route/pickup/dropoff · H self/chauffeur · I OT hours · J amount · K payment · L amount including VAT.

The existing `4월` first two header cells contain legacy numeric data rather than text. We leave them **untouched**; newly created month sheets use clear column names in A/B and preserve A–L order.

## HQ user flow

1. Open `/hq?tab=excel_import` on an authorized HQ session.
2. Choose **Excel 파일 열기**: browser File System Access picker on supported desktops, ordinary file upload fallback elsewhere.
3. Paste a KakaoTalk report, choose the report year, and click **항목 추출 및 검토**.
4. Review A–H. Vehicle model resolves ONLY from full vehicle plate in `VIP_REAL_VEHICLES`, not from the last four digits alone. Report service type and OT are **not guessed**.
5. Click **확인하고 Excel에 행 추가**. The downloaded/in-memory workbook receives an entry in the matching month tab. Duplicate check uses date, vehicle plate/short label, customer, driver and times.
6. Download the updated workbook **or**, on a supporting browser with explicit file permission and a backup, click **선택한 PC 파일에 저장**. If that file is in a OneDrive synchronized folder, the OneDrive desktop client handles synchronization.

## Important protections / limits

- Raw KakaoTalk original text is not saved to Supabase or sent to AI/external services. No automatic messaging or financial data transmission.
- Time conflicts are warned about; inconsistent stops are not silently reordered. G is a short origin/destination summary rather than the original operational itinerary.
- I–L remain empty by default: expense total is NOT invoice revenue, and work duration is NOT contractual OT.
- Existing tabs remain in the same workbook; missing month tabs are created with the same 12-column layout. Newly added rows do not overwrite filled rows. Complex styles, macros, images and unusual formulas may not survive SheetJS rewrites, so retain a backup and inspect the output before using it for billing.
- Excel itself remains the current output. There is **no production Microsoft Graph/Power Automate connection** and no live OneDrive personal workbook API write. Official Graph Excel APIs do not currently support OneDrive Consumer; OneDrive for Business / SharePoint requires a separately approved delegated account or Power Automate setup.
- Existing HQ/Supabase reservations, fleet and driver workflows are untouched. Do not commit the uploaded financial workbook to the repository.

## Acceptance tests

- Sample report 2026-10-24 (윤태준, 700호 1458, 샤넬) populates A–H with accurate values. OT, J, K, L are unfilled.
- Inconsistent original route timestamps produce warnings rather than an invented stop sequence.
- `4월` historical rows stay present when adding the new `10월` sheet.
- Re-import of the same date/vehicle/customer/driver/time is rejected, while a second separate service time can be added.
- PC file selection and manual upload both function. The saved workbook is validated in Excel before production use.
- Build and tests must pass before merging; mobile Safari fallback must be checked separately.
