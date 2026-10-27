# VIP LIMOUSINE KOREA — HQ Admin Dashboard Product/Design Specification (A03)

**Date:** 2026-10-26 · **Owner:** A01 Product · **Design owner:** A03 · **Status:** CURRENT DESIGN BRIEF, user-selected base mockup, pending final approval of detailed flows. **NOT approval to code/merge/deploy.**

**Repository:** https://github.com/Junebooky/driver-eta-notifier  
**Design task:** https://github.com/Junebooky/driver-eta-notifier/issues/3  
**Master backlog:** https://github.com/Junebooky/driver-eta-notifier/issues/7  
**Related:** [Fleet #10](https://github.com/Junebooky/driver-eta-notifier/issues/10), [Driver check-in #11](https://github.com/Junebooky/driver-eta-notifier/issues/11), [Direct HQ→driver dispatch #12](https://github.com/Junebooky/driver-eta-notifier/issues/12), [VIP reports #1](https://github.com/Junebooky/driver-eta-notifier/issues/1), [AI receipts #8](https://github.com/Junebooky/driver-eta-notifier/issues/8), [Admin receipt verification #9](https://github.com/Junebooky/driver-eta-notifier/issues/9), [Client chauffeur/vehicle profile #18](https://github.com/Junebooky/driver-eta-notifier/issues/18).

> **Source screenshot**: The user has shown A03's UPDATED wide desktop design in ChatGPT on 2026-10-26. The actual image is an attachment to that chat, not a GitHub asset. Ask the user to pass it directly to A03 if unavailable. Do NOT upload the screenshot to a public repository or use any real private client/driver details as public fixtures.
>
> **Design verdict**: **KEEP THE UPDATED DASHBOARD'S VISUAL ARCHITECTURE.** The user wants A03 to understand the purpose and interactions behind it, not replace it with another generic dashboard concept.

## 1. What the product actually is

Driver Cockpit has two connected operational surfaces and one separate customer-facing output:

| Surface | User | Purpose | Visual identity |
|---|---|---|---|
| **HQ / 운영 대시보드** | Authorized VIP LIMOUSINE KOREA dispatchers/managers | Create bookings, choose specific vehicle + driver, publish assignments, chase unconfirmed work, share client info, manage fleet, approve reports/expenses | The selected **white / soft-gray / cobalt blue #1E60F3** dense desktop dashboard |
| **Cockpit driver mobile app** | Verified assigned chauffeur | Reopen own current/upcoming trips, receive notifications, explicitly tap **배차 확인**, navigate/call, perform vehicle check and submit 운행일지 / 경비지출 | Existing mobile Cockpit design, same cobalt blue |
| **Client-facing profile PDF/PNG/email** | VIP customer | Know the **actual assigned driver and car** and see approved exterior/interior photos and contact info | **Premium black + champagne gold**, per user's separate reference; NOT the admin dashboard style |

**Critical recipient rule**:
- **배차 발송** → **the DRIVER** receives a secure digital schedule / notification in Cockpit; HQ follows up until acknowledged.
- **고객 안내자료 생성 / 고객 이메일 발송** → **the CLIENT** receives an approved driver+vehicle brochure (or attachment/link), from the company and only after manager review.
- These are **two distinct processes, status columns, notifications, privacy policies and sending histories** on ONE linked booking. NEVER put the client's profile onto the driver push and NEVER assume a company brochure has been sent just because a driver confirmed.

## 2. Freeze the basic dashboard visual structure (updated A03 reference)

Retain the current screenshot's compact professional layout:
- Persistent **left sidebar**: VIP LIMOUSINE KOREA logo + `대시보드`, `예약·배차 관리`, `차량 관리`, `기사 관리`, `운행일지 관리`, `경비지출 관리`, `영수증 검수`, `보고서·통계`, `설정·권한`. No extra top-level menu needed for `고객 안내자료`; access it from booking details.
- **Top toolbar**: `운영 대시보드`, REAL local date dynamically derived from browser/organization timezone (the screenshot's 2024-10-24 is static MOCK only), search by authorized client/booking/driver/vehicle, notification bell, authenticated admin profile.
- **Seven clickable KPI cards across top** (exact order from selected image): `오늘 전체 예약`, `미배정`, `작성 중 / 미발송`, `발송 · 미확인`, `재확인 필요`, `운행일지 검토`, `영수증 검수`. Colored accents indicate exceptions; keep card shapes and typography. Clicking each card opens a **filtered actionable work queue**, not a static infographic.
- **Main working area**: left ~2/3 `오늘 / 내일 배차 현황` table with pills/tabs and right ~1/3 `빠른 배차 생성`. The row/status/action visual hierarchy from reference is good; don't relocate these panels.
- **Lower area**: `운행일지 검토` and `경비지출/영수증 검수` and `차량 운영 현황` cards, then `기사 현황` and `보고서/데이터 내보내기` if space permits. Their purpose is attention + shortcuts to detail, not replacing full management pages.
- Preserve white card borders, subtle shadows, cobalt buttons, small restrained semantic red/amber/green statuses, structured tables, efficient information density. No huge colorful banners, generic hero art, or brand switch. Responsive for 1440px desktop and 1024px small laptop; dense table may horizontally scroll with sticky important columns or a simplified layout.

## 3. The owner's most important problem: no forgotten jobs

Today managers may forward customer email screenshots, tell drivers verbally, or forget entirely. HQ must make every known customer request visible **before and after assignment**.

### Core booking lifecycle (HQ)
1. **전화/이메일 문의 접수** → Create a booking `작성 중` / draft with client, date, pickup time/places, destination, requested model, passenger information, notes, source, and service type; show `미배정` if no chauffeur. **A booking not entered anywhere cannot be detected by software**; the UI must make registration easy.
2. **차량/기사 배정** → Choose qualified available real driver and vehicle for that interval, with conflict warnings; if a model is only requested but the exact plate isn't confirmed yet, clearly show `차량 미확정`.
3. **배차 발송** → Explicit manager publish; write a secure versioned assignment tied to the verified driver account (NOT vehicle number alone). HQ now shows `발송 · 미확인`.
4. Driver sees `새 배차` and its persistent card in Cockpit's **스케줄** tab even if push was missed. TMAP/call, notes, assigned plate. Driver taps **`배차 확인`**; HQ shows server-based confirmation timestamp, e.g. `10/26 16:05`.
5. HQ monitors `미배정`, `미발송`, `발송 · 미확인` and `변경 후 재확인 필요`. Manager `재알림` or `전화` follow-up action, with realistic notification error states. Important: push accepted by service != delivered/read.
6. If manager edits driver, car, location or pickup time, show a revision badge; notify affected driver, require re-ack and distinguish `문제 신고` / `알림 실패` / `확인 필요`.

### Customer profile lifecycle (separate!)
1. After **exact vehicle and chauffeur are confirmed**, booking detail offers `고객 안내자료`.
2. Manager previews the black-and-gold portrait brochure with **approved photo of actual exterior**, two approved cabin/rear-seat photos, assigned driver's approved portrait/name/title, exact plate, permitted client-facing contact and bilingual footer.
3. `미리보기` → `PDF/PNG` → `고객 이메일 발송` (explicit recipient and contents confirmation). It may be emailed separately from the driver dispatch. Email integration not yet implemented.
4. HQ status `고객 안내 미생성/미발송` → `발송됨` or `실패`. Driver/vehicle changes mark the previously sent profile **`재발송 필요`**, with old version/history preserved.
5. Client delivery is **not** equivalent to the driver's `배차 확인`. Do not claim email was read simply because the sender service accepted it.

### IMPORTANT: correct misleading screenshot helper copy
The updated quick-dispatch card currently says roughly: **`배차 발송 시 기사에게 배차서와 고객 안내자료(기사·차량 프로필)가 함께 전달됩니다.`** This is **WRONG** for the intended recipient flow.

**Replace with:**
> `배차 발송 시 선택한 기사에게 Cockpit 배차 알림이 전달됩니다. 고객 안내자료는 예약 상세에서 별도로 생성·발송합니다.`

Under each booking's detail show independent progress lines:
- `기사 배차: 발송·미확인 / 확인완료 16:05 / 재확인 필요`.
- `고객 안내: 미생성 / 발송대기 / 발송됨 / 재발송 필요 / 실패`.

## 4. Define each dashboard section's FUNCTION, not just appearance

### Seven KPI tiles
| Tile | Count means | On click |
|---|---|---|
| `오늘 전체 예약` | All bookings within selected day, explicitly specify status/cancellation policy | Open filtered booking list |
| `미배정` | Reservation needs driver / vehicle assignment; distinguish if partially assigned | Filtered urgent assignment queue, `기사 배정` |
| `작성 중 / 미발송` | Saved but **not yet published** jobs; must remind manager, not driver | Draft/unpublished queue, `배차 작성·발송` |
| `발송 · 미확인` | Latest published revision is not acknowledged by targeted driver | Queue with `재알림` and `전화` |
| `재확인 필요` | Dispatch changed materially after acknowledgment; manager/driver needs reconfirm | Changed field diff + resend/reconfirm |
| `운행일지 검토` | Submitted driver logs awaiting HQ approval | Review queue with driving log detail |
| `영수증 검수` | Submitted receipt/expense lines awaiting verification | Side-by-side photo left / editable OCR form right, save and `승인 후 다음` (Issue #9) |

Count semantics must be sourced from actual records; if mock, label them **sample**. No stale date, no mismatched totals.

### Today / Tomorrow booking table
Keep columns from the updated reference:
- `No.`, `고객명`, `픽업 시간`, `기사명`, `차량`, `목적지`,
- **`배차 상태`**, **`기사 확인`**, **`고객 안내자료`**, **`작업`**.

The screenshot uses short labels `기사 확인` and `고객 안내자료` correctly; keep two distinct columns. Actions: `보기` opens **booking detail drawer**, `기사 배정`, `재발송`, `···` for edit/cancel/history. Add obvious `고객 안내자료 생성` action inside the detail even when the table column only says `미발송`.

**Do not conflate statuses**: booking `미배정/배차 완료`; dispatch `미발송/발송됨`; driver acknowledgement `미확인/확인완료/재확인 필요`; customer-profile `미생성/미발송/발송됨/재발송 필요`. Driver `출근`, physical `차량 인수` and `배차 확인` are three separate events.

Counts/tabs must match: screenshot currently shows `오늘 전체 예약 18`, `오늘 전체 예약 18`, `배차 대상 12`, and **8 rendered rows**. This is allowed only if the UI clearly distinguishes all vs dispatch-target records and shows `8건 표시 / 총 18건` plus pagination/scroll or an explicit filtered view; not 18 without explanation.

### Quick Dispatch creation
Keep the right card and **`단일 배차 / 그룹 배차`** tabs.
- `단일 배차`: customer, pickup datetime, pickup & destination (searchable), company job and passenger contact, assigned vehicle and driver, notes, `임시저장`, `배차 발송`.
- `그룹 배차`: click opens separate larger form/drawer; enter shared customer/date/destination/arrival-by **once**, add any number of rows with distinct passenger / phone / pickup place/time / exact car / driver.
- When booking exists, `예약에서 불러오기` pre-fills verified data; don't duplicate/create another booking accidentally.
- Optional customer email-text/screenshot Gemini extraction should **populate an editable DRAFT only**; manager verifies before sending.
- `임시저장` must NOT notify; `배차 발송` validates recipient driver/driver ID, details and availability and publishes; show failure and no-driver/no-car states. **Never silently send clients their brochure when the manager presses the driver dispatch button.**

### Lower panels
- **운행일지 검토:** driver, vehicle, job/date, elapsed duration, mileage, status, approve/revision actions; full detail uses exactly `출근시간` and `퇴근시간`; link to `차량체크` km with valid job/vehicle/date mapping; editable corrections in driver UI remain possible.
- **경비지출 / 영수증 검수:** distinguish expense summary, received receipts, approved/pending, reimbursement payer (company card vs personal) and duplicate alerts. `영수증 검수` opens receipt-image LEFT / OCR/form RIGHT, rotate/zoom/edit/`승인 후 다음`.
- **차량 운영 현황:** class/model+seat counts (Staria 9/10, Sprinter, Carnival Normal/High-Limousine, G90/G90 LWB). Distinguish **`현재 차고지` vs `선택 기간 예약 가능`**; include future date-time filters and maintenance/return buffers. A badge `3 / 4대` needs a label specifying numerator. Classes' vehicle totals must equal combined status totals when using the same denominator/snapshot.
- **기사 현황:** `운행 중`, `대기`, `휴무`, `지연` etc only if statuses are mutually exclusive; show exact total and consistent subtotals. The mock image's `운행 중 9 + 대기 6 + 휴무 2 + 지연 1` implies **18** if disjoint; the UI should state total 18 (sample).
- **보고서 / 데이터 내보내기:** daily/monthly summary and permissioned XLSX, no fake completed data.
- **알림 bell:** unacknowledged departures / failed push / changed booking / admin approval / unassigned draft alerts, with count and filtered next actions.

## 5. Exact mockup consistency fixes from selected image

The selected screenshot is **one visual reference, not verified live company records**. A03 must use ONE internally consistent, synthetic data fixture throughout every screenshot:
- Screenshot displays **2024-10-24** even though actual design review is 2026-10-26. In implementation date must be dynamic; in design use an explicitly labeled sample date and correct weekdays. No apparent live 'today' for an old mock day.
- Vehicle classes: displayed totals **4+3+3+3+4+3+2 = 22 vehicles**, whereas status legend **15 + 4 + 1 = 20**. Fix totals/legend or clearly separate dimensions and say so. The 7 classes should have IDs/model names consistent with the booking table.
- Top tile `오늘 전체 예약 18` vs `배차 대상 12` and 8 visible table records must have appropriate **filters/pagination** rather than silently disagreeing.
- A passenger contact/private employee profile should NEVER be a real person's phone in a public design; anonymize all fixtures and photos.
- Define `오늘 총 지출` as exact selected-day expenses, not a mix with yesterday. Earlier expense mock reference made that mistake.
- A green `기사 확인` only after explicit current-revision tap in Cockpit; not inferred from notification send.

## 6. Supporting screens A03 must design NEXT, not another homepage overhaul

**Deliver FIVE actual high-fidelity images/sets, in this order:**
1. **Refined MAIN dashboard** — preserve current screenshot exactly in layout; fix helper copy, count semantics, label/interaction clues, full booking actions, correct timeline/recipient flows. Include at least one clickable queue example.
2. **Booking detail drawer** (from `보기`): left booking/driver/vehicle/passenger essentials, right two independent communications: **기사 배차/확인** and **고객 안내자료/이메일**; change/swap and `재발송 필요` status; audit/history.
3. **Single/Group dispatch drawer** (from `그룹 배차`): shared client/date/destination/arrival deadline once, multiple passenger/pickup/driver/vehicle rows; optional `고객 이메일 가져오기` AI draft review; visible `임시저장` vs `배차 발송`.
4. **Black/Gold client brochure composer + email confirmation** (from `고객 안내자료`): manage approved actual vehicle exterior/two interior photos, driver's consented portrait/contact, portrait brochure preview, PDF/PNG export, recipient/subject confirmation, send history.
5. **Driver Cockpit mobile assignment & acknowledgment**: `새 배차` banner, persistent today's/upcoming mission card, pickup/destination TMAP, call, notes, `배차 확인` and timestamp; optional push permission/failed notification and schedule-changed re-ack states.

Additional states in the same set or follow-up variants: empty `미배정` queue, driver/vehicle conflicts, `미발송` draft approaching deadline, push refused/offline, profile not generated yet, changed driver/car invalidating prior profile, screenshot-ocr uncertainty, no pending receipts. Admin receipt audit can reuse Issue #9's selected split-view.

### A03 visual handoff checklist
- Use exact **uploaded updated dashboard screenshot** as **the base**; DO NOT draw a totally new generic UI.
- The screenshot has a white + cobalt (#1E60F3) design; external profile only uses gold/black.
- Annotate intended clicks/transitions in a concise table without changing their visual style.
- Prepare at least desktop 1440px (table readable) and narrower laptop 1024px responsive variants; for Cockpit phone 375–430px.
- Avoid PII/sensitive details in public GitHub or mock fixture; the screenshot itself stays in private chat.
- A03 draws/approves **design only**. A02 engineering starts after explicit user direction; **do not merge or deploy**. The latest exceptions for approved driver `운행일지` and `경비지출` UI are tracked in Issues #14/#16. These do not authorize HQ backend.

## 7. A01 acceptance summary

This design is successful if an HQ manager can answer **in seconds**:
1. What jobs are coming up, and which haven't been entered/assigned/published?
2. Who has not yet **acknowledged the most recent dispatch**?
3. Which exact car and chauffeur are truly assigned, and are they free in the requested period?
4. Has the **customer** received the correct driver+vehicle profile — and must we resend because the assigned vehicle/driver changed?
5. Which driving logs, expenses, and receipts await approval?

**The dashboard exists to prevent forgotten dispatches and reduce retyping, not to show static ornamental metrics.**

### 2026-10-26 — NAVER Mail also required (supersedes Gmail-only inbox)
The user also receives client messages on **NAVER Mail**, so the HQ design should now say **`고객 이메일 / 통합 메일함`**: one inbox with provider filters `전체 · Gmail · NAVER`, unified unread count, distinct provider account labels and connection/sync-error status. **Gmail uses its official OAuth API; NAVER uses secure IMAP (`imap.naver.com:993` SSL) with NAVER 2FA + application-specific password**. Never imply NAVER uses Gmail OAuth, request the primary NAVER password, or present a fake live inbox. A03 should show account-connect instructions and message viewer using synthetic placeholder emails. Both providers remain **read-only**; opening an email must not mark it read in the provider, and messages must not be forwarded to the whole company unless that company account's owner granted access. Full specs / compliance / refs in [Issue #20](https://github.com/Junebooky/driver-eta-notifier/issues/20). No account has been connected; no code/email data changes are approved.

### Latest email AI product direction — A02, 2026-10-26
**Detailed engineering handoff:** [NAVER selective email → AI booking draft → manager dispatch](https://github.com/Junebooky/driver-eta-notifier/blob/feat/vip-korea-report-preview/docs/HQ_EMAIL_AI_BOOKING_HANDOFF.md). NAVER IMAP credentials are reportedly already set in user's local `.env.local`, but live connection is not verified and passwords must never be printed/committed. NAVER is the first implementation candidate; Gmail can be added later.

This is **not an AI that reads every email**: list minimal inbox metadata, use inexpensive configurable sender/subject/thread/keyword filters to flag likely chauffeur reservation requests; exclude provider spam folders by default, leave uncertain mail manually reviewable, and fetch/send body to Gemini **only for candidates** or on explicit `AI로 분석` click. Default automatic analysis OFF until owner opts in. AI classifies new bookings vs changes/cancellations/questions and fills an **editable draft**, never a confirmed assignment. The HQ manager checks source text, fills missing fields and **selects the driver and exact vehicle**. `예약 초안 저장` notifies nobody; only separately confirmed `배차 발송` sends the selected driver their Cockpit schedule. SMTP/send from NAVER is not in scope despite the user enabling it.

A03 should draw **NAVER inbox with AI booking candidate badges**, a split email-left/AI-draft-right reviewer, a `관련 없음` email state with no AI processing, a group-booking extraction variant, and a visibly manual driver selection + publish step. Source content may be adversarial/untrusted; never treat emailed text as commands to send. Keep the white/blue dashboard template.

## 8. Unified Gmail + NAVER customer inbox inside HQ (new owner request — 2026-10-26)

**New first-class feature (now supporting both Gmail + NAVER):** [Gmail Inbox Issue #20](https://github.com/Junebooky/driver-eta-notifier/issues/20). The manager receives VIP booking enquiries in Gmail and wants to check them **inside HQ**, without keeping a separate browser tab open.

**A03:** Keep the already-selected dashboard layout as the base. Add a clear entrance to `고객 이메일`: compare (a) a small sidebar entry and (b) `예약·배차 관리` → inbox tab, with unread badge and compact recent-unread preview accessible from dashboard. Choose a discoverable option without redesigning the seven KPI cards. Design a desktop read-only Gmail inbox with unread dots, sender, subject, time, safe snippet, search, filters and refresh/sync time, and a message/thread detail drawer. State `Google 계정 연결`, `연결 해제`, disconnected/error/expired permission/empty/loading. Buttons: `Gmail에서 열기`, future `예약 초안 만들기` (extract fields for manager review ONLY; never automatically dispatch).

**Do not confuse channels:** This Gmail panel is **inbound CUSTOMER → HQ correspondence**. `배차 발송` still sends assigned schedules **HQ → DRIVER**; `고객 안내자료 발송` still sends the approved brochure **HQ → CUSTOMER** as a separately authorized outbound workflow. Gmail connection must not automatically email, delete, modify or mark source messages as read.

**Backend compliance gate:** A02 (only after approval) must research Gmail OAuth restricted `gmail.readonly` permissions, Google's verification/security-assessment requirements, Workspace internal vs external audience, secure tokens, manager-only access and explicit mailbox sharing, minimal retention, sanitized email HTML and remote image tracking precautions. The Gmail website itself should not be embedded as an iframe; design our own read-only viewer using the Gmail API. Optional Gmail watch/PubSub sync is later; for MVP offer manual refresh and accurately labeled last-sync time. Prefer a dedicated business/company inbox or business-specific label, not importing the owner's entire private mailbox to all staff.

**Deliverable update:** In addition to the five UI-image sets in §6, A03 should show a **sixth** supporting view: `고객 이메일` inbox/message detail and `예약 초안 만들기` action. This is design backlog only; no real Google account connection has been authorized.

