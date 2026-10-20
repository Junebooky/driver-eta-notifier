# VIP KOREA reporting — P0 specification

Status: **design review / implementation preparation**. The working preview is available at `/vip-report-demo` on this branch; the preview stores **nothing** and is not the production driver workflow.

Tracked in [Issue #1](https://github.com/Junebooky/driver-eta-notifier/issues/1).

## Non-negotiable UX contract

For VIP LIMOUSINE KOREA assignments only, prepend **운행일지** and **경비지출** above the five existing Driver Cockpit shortcut icons. Unaffiliated drivers must see the unchanged Driver Cockpit.

The report has **exactly two work-time inputs**:

- `출근시간` (`clock_in`)
- `퇴근시간` (`clock_out`)

No separate `서비스시작`, `서비스종료`, `업무시작`, or `업무종료` fields. Stop time fields in the route timeline are permitted because they are per-location events, not a separate service clock.

**Total duty duration** = actual time difference from clock-in to clock-out, with midnight rollover. The first version describes this as **elapsed time before break deductions**, not automatically as billable or payable work time.

Example: 2026-10-19, 06:40 → 22:30 = **15시간 50분**.

## Daily report fields

| Category | Source of truth | Data |
| --- | --- | --- |
| Identity | Verified assignment (prefilled) | company, job id, user id, driver display name, vehicle id/plate, client, passenger count |
| Work log | Driver confirmed | work date, clock_in, clock_out |
| Mileage | Driver confirmed + optional image proof | starting odometer, ending odometer, derived kilometers |
| Route | Ordered driver events | stops array: time, place, sequence, optional note |
| Expense | Driver entered / receipt checked | category, KRW integer amount, optional memo, optional private receipt reference |
| Notes | Driver entered | 특이사항 |
| Approval | Server | draft, submitted, approved, needs_correction; timestamps and audit events |

Mileage is `end_odometer_km - start_odometer_km`, never guessed from navigation ETA.

The UI should support multiple route stops and multiple expenses of the same type.

Expense categories: 통행료, 세차비, 주차비, 주유비, 교통비, 숙박비, 식비, 기타.

Example: tolls 1,000 + 1,000, parking 18,800, meals 9,500 + 10,000 = **40,300원**.

## Integration plan

1. Keep `/vip-report-demo` as a non-persistent visual reference while building.
2. Add Supabase Auth server-side verification and company/assignment membership; do not use hardcoded company flags, localStorage-only identity, plate number, or an admin PIN as the security boundary.
3. Define secured tables for organizations, active assignments, daily reports, route stops, expense line items, receipts, and audit events. Ensure no public read/write to company data. Every mutation must be idempotent.
4. Render conditional VIP shortcuts in `components/QuickActionBar.tsx` only after verified assignment capability check. The five existing shortcuts and standalone use must remain intact.
5. Create authenticated report save / submit / approve endpoints and server-side validation (valid time pairs, overnight, non-negative mileage, integer expense amounts, duplicate protection).
6. Build `/vip/admin` sheet view with row filters, report drilldown, and Excel export matching the uploaded company workbook's useful columns.
7. Add secure private receipt upload, optional dashboard odometer AI prefill, error indicators and offline draft queue, after the core data path is verified.

## Admin sheet rule

**The database is the source of truth.** The admin sheet reflects saved report versions; it must not be treated as a separate free-form input database. Driver sees a visible "Saved" acknowledgement only after the backend confirms persistence. All corrections after approval must retain who/when/what changed.

One driver can work several separate jobs on the same day, so a report must have its own immutable identifier and job link; `(driver_id, date)` is not a unique key.

## Security stop signs

Current repository includes privileged server-side database access and permissive legacy cockpit policies. Do not extend those patterns to sensitive new report tables. Verify Supabase Auth token server-side on every request and check organization role/membership and job access. Secure receipt storage with private buckets and scoped object access.

Never merge or deploy a reporting implementation using fake login, a shared PIN, client-side VIP flag, or any global access to other drivers' records.

## Preview acceptance checks

- Only `출근시간` and `퇴근시간` appear as work-time inputs.
- 06:40 to 22:30 displays 15시간 50분.
- 154725 to 154861 displays 136 km; reversed odometer returns an error.
- Two 1,000 KRW tolls + 18,800 KRW parking + 9,500 and 10,000 KRW meals display 40,300원.
- Add and remove route stops and expense line items.
- Admin mock table and report text update from shared draft state.
- Page clearly says it is a local preview and never claims it has saved or sent data.
