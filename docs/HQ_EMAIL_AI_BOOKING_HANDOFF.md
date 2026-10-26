# A02 handoff — NAVER Mail → Selective AI booking drafts → Manager dispatch

**Owner:** A01 · **Product clarification from user:** 2026-10-26 · **Status:** SPEC / HANDOFF, not an authorization to merge/deploy, send email, or auto-dispatch.  
**GitHub:** https://github.com/Junebooky/driver-eta-notifier  
**Email feature:** [Issue #20](https://github.com/Junebooky/driver-eta-notifier/issues/20)  
**HQ dispatch:** [Issue #12](https://github.com/Junebooky/driver-eta-notifier/issues/12)  
**Fleet:** [Issue #10](https://github.com/Junebooky/driver-eta-notifier/issues/10)  
**HQ design:** [HQ Dashboard Product Design Spec](https://github.com/Junebooky/driver-eta-notifier/blob/feat/vip-korea-report-preview/docs/HQ_DASHBOARD_PRODUCT_DESIGN_SPEC.md)  
**Related master backlog:** [#7](https://github.com/Junebooky/driver-eta-notifier/issues/7)

## 0. New user facts (do not speculate beyond them)
- The user has **enabled NAVER IMAP/SMTP**, generated a NAVER **application-specific password**, and says they put the necessary variables in a local **`.env.local`**.
- A02 has **not been told what the email feature should do**. This document is that direction.
- The user wants AI to **recognize relevant client booking emails and prepare structured schedules**, but **only the administrator selects the chauffeur** (and confirms vehicle/sends dispatch). Many messages are spam or unrelated; **do not send every mailbox message through AI**.
- This does NOT verify that an IMAP connection, environment variable names, networking on deployment, inbox-sync jobs, or API integrations actually work. A02 must test safely when authorized.
- **Never ask the user to paste the app password in chat or GitHub**; do not inspect/print its value. Confirm only that expected server-only variable names exist. `.env.local` is already covered by GitHub `.gitignore`; ensure it was never accidentally committed, and avoid writing secret values to any diff, logs, preview, or tests.

## 1. Real product objective: candidate mail → AI draft → human-confirmed assignment

### Workflow
1. NAVER business inbox gets mail, which the authorized HQ admin views from a **read-only inbox** in the existing dashboard. Gmail can use a separate provider adapter later; NAVER is the available starting source.
2. Sync INBOX **metadata only** first: provider account, folder/UID/UIDVALIDITY, Message-ID/thread context, sender, subject, received date, unread status (without marking read), small safe preview only if truly available; **do not download and send every body to Gemini**.
3. Cheap **deterministic candidate filter** selects messages likely about chauffeur/vehicle service (company-approved trusted senders or previous booking threads; Korean/English booking keywords, references, reservation-like dates/model phrases). Exclude Spam/Trash/Junk folders and obvious promotions/newsletters (`List-Unsubscribe`, common bulk headers) by default, with cautious heuristics. No sender/subject rule should permanently delete/suppress a possible client booking; **uncertain messages remain in inbox, marked `검토 필요`**, with one-click `AI로 일정 분석`. Allow manual selection of any message regardless of filter.
4. Only for **likely candidates** or **manual administrator request**, fetch necessary body parts from NAVER with **nonmutating IMAP reads**; make a bounded, consented AI analysis request using the existing **server-side** `@google/genai` stack. Do not forward attachments by default; later explicitly select PDF/image attachment and verify type/size/privacy.
5. Stage 1 classify intent: `new_booking`, `booking_change`, `cancellation_request`, `booking_question`, `unrelated`, `uncertain`. High-confidence unrelated/spam stops *without parsing scheduling fields*. Never automatically delete, mark read or move the message; never use AI to infer a client as trusted solely from display name.
6. Stage 2 extract only relevant requested information into a **structured, editable, evidence-linked booking draft**. If an email requests 3 cars, create **one group event + separate proposed trip rows**. If it refers to an existing booking, link a proposed change/cancellation for HQ review instead of creating duplicates.
7. Admin opens the message in a two-pane inbox/draft UI, compares original text with suggested details, corrects missing/wrong fields, verifies addresses and times, and selects the **actual driver and specific vehicle** from authorized dispatch data. **AI is not allowed to auto-assign a driver, select a vehicle, confirm a booking, or publish/send an assignment.** It may *show* optional availability suggestions later, but final choice is always human.
8. `예약 초안 저장` persists a draft **without notifying anyone**. `배차 발송` is a separate authorized manager action: validate the assigned driver and vehicle, check conflicts, publish server-side to the selected driver's Cockpit schedule and optional notification. Driver must tap `배차 확인` for HQ to record a real acknowledgment timestamp (Issue #12).
9. The client-facing **고객 안내자료 PDF/email** (Issue #18) is an independent, separately manager-reviewed outbound workflow, **not sent together to the driver**.
10. Admin inbox/booking link should show status `원본 메일`, `AI 후보`, `분석 완료`, `예약 초안`, `배차 발송됨`, `변경 검토 필요`, not confuse email flags/unread with driver acknowledgment.

### What AI is allowed to fill (never fabricate)
- `intent`, `language`, `client_company`, `contact_name` / `passenger_name` / explicit phone if present
- `service_date`, `pickup_datetime`, `arrival_by_datetime`, `time_zone` (KST where appropriate)
- `pickup_address` / `pickup_place_name`, `destination_address` / `destination_name`
- `requested_vehicle_model`, `requested_seat_count`, `vehicle_quantity`, `passenger_count`, `trip_rows` for group arrangements
- `flight_number` or terminal, special instructions, client reference, comments
- `linked_booking_id` only if a verified existing booking reference matches; an LLM must not guess IDs
- `source_evidence` (brief quotes/field-level source spans), `missing_fields`, `warnings` and model-supported confidence indicators if calibrated/validated.

**Missing means `null` / unknown**, not `tomorrow 07:30` because default, and do not invent a car plate, phone, exact geographic coordinates or driver. Resolve relative dates (e.g. "tomorrow") relative to email's received timestamp in `Asia/Seoul`, but flag ambiguity around received time zones, forwarded messages or reply chains. Never overwrite date/time with an ETA guess.

### Suggested draft JSON contract (illustrative, not actual parsed email)
```json
{
  "intent": "new_booking",
  "status": "needs_manager_review",
  "source": {"provider": "naver", "email_ref": "opaque-server-id"},
  "client_company": "Example Client",
  "date": "2026-10-28",
  "destination": {"name": "Example destination", "address": null},
  "arrival_by": "09:40",
  "requested_model": "G90",
  "trip_rows": [
    {"passenger_name": "Passenger A", "pickup_time": "07:30", "pickup_place": "Example location", "driver_id": null, "vehicle_id": null}
  ],
  "missing_fields": ["destination.address", "trip_rows[0].driver_id", "trip_rows[0].vehicle_id"],
  "warnings": []
}
```
**A02** should define strict server-side schema with typed results, reject malformed output, map to the company booking domain, and record original email reference. Never trust instructions embedded in incoming emails: mail is untrusted data, not a prompt or commands to perform actions.

## 2. Candidate-filter policy (cost, security, missed bookings)

**DO NOT AI-READ THE WHOLE MAILBOX.** Filter in stages:
- Scope first to permitted company mailbox **INBOX** (exclude Spam, Trash and unrelated folders by default), and optionally a user-managed NAVER folder or VIP customer allowlist. Do **not** assume unread-only: a manager may have read a relevant email before syncing.
- Candidate **positive rules** (configurable Korean/English keywords such as `예약`, `배차`, `의전`, `기사`, `차량`, `픽업`, `airport transfer`, `chauffeur`, `reservation`, `schedule change`) plus sender/thread context.
- Candidate **negative rules**: obvious newsletters/bulk mail, messages classified spam by provider, known blocklist, obvious unrelated content. Avoid hard-deleting or irrevocable exclusion: present uncertain messages to the admin, with `분석하기`.
- To avoid keyword matching every irrelevant email, **only selected candidate email BODY goes to Gemini**. If the first classifier returns `unrelated`, stop. Admin can override false positives/negatives.
- Efficient re-scan: key by account + folder + UIDVALIDITY + UID (or Gmail message ID later), message hash/model/prompt version, and user-invoked reanalysis. Incremental sync, dedup, bounded page sizes, backoff/rate limits.
- Protect all private email data: no raw bodies in public GitHub, analytics, prompts embedded in logs, or test fixture; limit AI provider data exposure to candidate business requests and apply data usage agreements/consent appropriate for company.
- Provide an account-level toggle for `예약 메일 자동 후보 분석` **ON/OFF**, and separate button `이 메일 AI 분석`; default **OFF until the mailbox owner/admin has reviewed the AI data-use notice and explicitly enabled it**. Read-only inbox should work with AI completely off.

## 3. NAVER IMAP implementation contract — read only

- NAVER `imap.naver.com` port `993` TLS, application password + NAVER two-step verification already configured by user per report; check official docs.
- Use the server-only environment variables already configured in `.env.local`; **detect their names with a safe presence check, never print the secret**. Add placeholder names to `.env.example` ONLY if needed; no credentials or personal mail addresses committed.
- **NO SMTP** now despite SMTP being enabled in NAVER settings; no real outbound email. Reading doesn't require SMTP.
- Use `EXAMINE` / IMAP read-only mailbox, FETCH with PEEK for bodies; never set Seen, delete/move/modify flags/forward, and test this behavior. Some IMAP client library APIs mark mail read unless PEEK is selected.
- Confirm that host/serverless runtime supports outbound IMAP TCP/TLS and short-lived secure connections. No promise of instant updates from background loops. Prefer explicit refresh plus bounded poll/scheduled sync with honest `최근 동기화` timestamp and failure states.
- Manager-only org-scoped server route; never a public app API returning everyone's mailbox. No token/password exposed to client JS; no service-role anonymous route.
- Parse MIME safely, strip unwanted HTML active content, block external images/tracking pixels and script/links by default, prevent pathological large/decompression payloads. If attachments later, require human selection, type/size allowlist and malware/privacy handling.
- The user already set up local secrets **but local `.env.local` is not automatically present in Vercel production or in another A02's environment**. Verify names and deployment readiness separately; do not upload local secrets to GitHub.

## 4. Specific A03/HQ UI requirements
**Preserve the accepted HQ dashboard visual system**; don't add decorative KPI clutter. `고객 이메일 / 통합 메일함` entry with account/provider filters `전체`, `NAVER`, `Gmail` (Gmail adapter later), list sorted newest first.
- Inbox row: source icon, sender, subject, time, provider unread indicator, **AI status** (`분석 안 함`, `예약 후보`, `분석 중`, `예약 초안 생성됨`, `검토 필요`, `관련 없음`). Treat unread vs AI-classification vs booking-publish state as **distinct dimensions**.
- Click email: left original read-only message/thread, right **AI 일정 추천/예약 초안** editor, with field-by-field source highlighting when possible; "AI 분석하기", "분석 건너뛰기", "예약 초안 저장" and "기존 예약에 연결".
- Admin selects driver + exact car **manually** using drop-down selectors tied to verified roster/availability; don't allow `배차 발송` without required fields/driver/vehicle and explicit confirmation.
- Support one booking, several bookings in email, group bookings and change/cancellation flows; errors, uncertain AI, impossible time/overlap, missing detail, disconnected/expired NAVER credential and privacy toggle.
- Candidate-suggestion section near HQ `작성 중 / 미발송` queue may show "AI 추출한 예약 후보 N건" but not mix an **unconfirmed** candidate with a confirmed actual booking.
- A03 must show screenshot mockups of inbox list, relevant email → AI draft, unrelated/spam email → skip, group booking extraction and manual driver assignment. Synthetic emails only, no actual private mail screenshots in a public issue.

## 5. MVP order to hand A02 — stages and tests
1. **Read-only NAVER Inbox connector** (connection-health check, authorized minimal message listing/detail, no flags/mark read), account-level auto-analysis toggle OFF; no outbound SMTP.
2. **Candidate prefilter + manual `AI로 분석`**, with deterministic tests for clear booking requests, normal personal email, spam, forwarded quotation, previously seen client thread, ambiguous subjects. Measure false negatives—missed bookings are more harmful than a few manual-review candidates.
3. **Gemini structured booking extraction** for selected candidates only. Use existing `@google/genai` backend but **DO NOT directly reuse the existing `app/api/schedule/parse/route.ts` request flow**: it uses client/vehicle defaults and queries Supabase schedules; mail parsing must ONLY produce a draft suggestion with validated JSON and no automatic writes to driver schedule tables.
4. **Manager review/save/edit and association to booking**, manual driver + vehicle selection, duplicate/thread/concurrency checks, separate publish button integrated with Issue #12 (once approved/ready). **Stop before production push dispatch if secure auth/roster/booking system isn't built.**
5. **Gmail adapter** later via OAuth and Google restricted-scope review; same provider-neutral UI and review workflow.

**Acceptance tests**:
- Relevant email 1 car/1 pickup → candidate+structured draft; no driver selected. Manager assigns, saves, publishes only after manual action.
- Relevant email with 3 passengers/vehicles → three distinct trip rows under one client event, independent pickup details, no auto-assignment.
- Spam/promotional/unrelated email → no AI body extraction, still searchable in permitted inbox (excluding provider Spam/Trash); manual review/override possible.
- Ambiguous subject from existing client → held in review, not auto discarded.
- "Pickup changed" reply → proposed change to verified booking, not duplicate booking; cancellation request never cancels automatically.
- Missing pickup time/address → warnings and editable blank, no fabricated values.
- IMAP read/reopen → does NOT mark the NAVER message read or change flags; no SMTP used.
- AI enabled only after admin opts in; no raw email leak/secret in logs, DB accessible only to authorized HQ manager.
- Two refreshes, repeated webhook/poll or repeated `AI 분석` → no duplicate drafts/dispatches.
- Driver/vehicle conflict prevents publish; no unauthorized cross-organization/driver access.
- Build/lint/relevant tests and screenshots; keep existing 운행일지/경비지출 UI PRs independent. **No merge or deploy without user authorization.**

**A02's immediate next response**: explain verified current architecture, name-only (never value) env var requirements and readiness, plan for IMAP read-only + candidate classifier + validated Gemini draft, privacy/security blockers and dependencies to Issue #12. Use small phased reviewable Draft PRs; no credentials or customer data in GitHub.
