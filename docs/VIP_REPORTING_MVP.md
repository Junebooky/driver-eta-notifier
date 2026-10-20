# VIP KOREA reporting — P0 specification

Status: **A03 screenshot-based design review required before A02 engineering**. [A03 brief](./A03_DESIGN_AGENT.md), [A03 Issue #3](https://github.com/Junebooky/driver-eta-notifier/issues/3). The working preview at `/vip-report-demo` is an **unapproved, non-persistent UI sample**; its mileage input design must be revised after A03 approval.

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
| Mileage | Synced from existing 차량체크 | confirmed 차량 인수 `pickupOdo`, 차량 반납 `returnOdo`, derived kilometers; linked to correct job/vehicle/period |
| Route | Ordered driver events | stops array: time, place, sequence, optional note |
| Expense | Driver entered / receipt checked | category, KRW integer amount, optional memo, optional private receipt reference |
| Notes | Driver entered | 특이사항 |
| Approval | Server | draft, submitted, approved, needs_correction; timestamps and audit events |

**Mileage sync (user-approved 2026-10-20):** Do **not** ask the VIP driver to re-enter odometer already supplied in **차량체크**. Existing `components/VehicleInspectionModal.tsx` stores `pickupOdo` (vehicle pickup) and `returnOdo` (vehicle return) under per-vehicle browser `localStorage`, using `getInspectionStorageKey(profile.vehicleNo)` in `utils/vehicleReport.ts`. A03 should design read-only, linked mileage fields, a `차량체크에서 자동 연결` source label, missing-value prompts, and a source-modal shortcut. A02 must migrate confirmed inspection records to authenticated job/vehicle/date-linked Supabase records, then have both screens read the same source of truth; a per-vehicle localStorage entry is **not** cross-device and is **not always one job**. If inspection dates or jobs do not match, do not silently copy mileage; request review or open 차량체크. Mileage is `returnOdo - pickupOdo` only when the records represent that reporting interval, never guessed from navigation ETA.

The UI should support multiple route stops and multiple expenses of the same type.

Expense categories: 통행료, 세차비, 주차비, 주유비, 교통비, 숙박비, 식비, 기타.

Example: tolls 1,000 + 1,000, parking 18,800, meals 9,500 + 10,000 = **40,300원**.

## Design-first implementation gate

A03 must first deliver real screenshot-based visual mockups based on screenshots provided by the user and receive **explicit design approval**. A02 must **not start implementing the reporting feature** until that approval. Design work is tracked in [Issue #3](https://github.com/Junebooky/driver-eta-notifier/issues/3). Source of truth for A03 role: [A03_DESIGN_AGENT.md](./A03_DESIGN_AGENT.md).

## Integration plan

1. Keep `/vip-report-demo` as a non-persistent visual reference while building.
2. Add Supabase Auth server-side verification and company/assignment membership; do not use hardcoded company flags, localStorage-only identity, plate number, or an admin PIN as the security boundary.
3. Define secured tables for organizations, active assignments, daily reports, route stops, expense line items, receipts, and audit events. Ensure no public read/write to company data. Every mutation must be idempotent.
4. Render conditional VIP shortcuts in `components/QuickActionBar.tsx` only after verified assignment capability check. The five existing shortcuts and standalone use must remain intact.
5. Create authenticated report save / submit / approve endpoints and server-side validation (valid time pairs, overnight, non-negative mileage, integer expense amounts, duplicate protection).
6. Build `/vip/admin` sheet view with row filters, report drilldown, and Excel export matching the uploaded company workbook's useful columns.
7. Add secure private receipt upload, existing 車량체크 odometer photo analysis prefill, error indicators and offline draft queue, after the core data path is verified.
8. Keep original 차량체크 mileage value as the sole editable entry point for records covering the same job and custody period; admin corrections must be audited.

## Admin sheet rule

**The database is the source of truth.** The admin sheet reflects saved report versions; it must not be treated as a separate free-form input database. Driver sees a visible "Saved" acknowledgement only after the backend confirms persistence. All corrections after approval must retain who/when/what changed.

One driver can work several separate jobs on the same day, so a report must have its own immutable identifier and job link; `(driver_id, date)` is not a unique key.

## Security stop signs

Current repository includes privileged server-side database access and permissive legacy cockpit policies. Do not extend those patterns to sensitive new report tables. Verify Supabase Auth token server-side on every request and check organization role/membership and job access. Secure receipt storage with private buckets and scoped object access.

Never merge or deploy a reporting implementation using fake login, a shared PIN, client-side VIP flag, or any global access to other drivers' records.

## Preview acceptance checks

- Only `출근시간` and `퇴근시간` appear as work-time inputs.
- 06:40 to 22:30 displays 15시간 50분.
- Synced 차량체크 154725 to 154861 displays 136 km without duplicate manual entry; a reversed odometer returns an error.
- Two 1,000 KRW tolls + 18,800 KRW parking + 9,500 and 10,000 KRW meals display 40,300원.
- Add and remove route stops and expense line items.
- Admin mock table and report text update from shared draft state.
- Page clearly says it is a local preview and never claims it has saved or sent data.
