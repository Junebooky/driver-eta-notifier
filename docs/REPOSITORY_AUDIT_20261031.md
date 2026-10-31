# Driver Cockpit repository audit — 2026-10-31 KST

This report covers main, all 21 open issues and 18 open PRs observed at the start of the audit, and the integrated PR #39 head `89763bd`. The changes are stacked in PR #40 so the audit does not overwrite existing feature branches.

## Implemented corrections

| Finding | Correction / evidence |
| --- | --- |
| Per-process mutex and compensating deletes could leave duplicate or partial dispatches | Single `commit_dispatch_batch` RPC; Postgres transaction and database advisory lock; row trigger also protects direct writes; every create/edit API uses this path. No memory/write fallback. |
| Missing/guessed end time, invalid date, reversed interval | Explicit end date/time controls; removed `18:00` and automatic vehicle/driver assignment; strict calendar/interval validation; old unknown ends remain open holds. |
| Date-only calendar and stale/static availability | Same interval engine for fleet board and booking selectors; KST midnight/60-minute turnaround handling; abort/stale-request protection; registered driver UUIDs and explicit full plates; paginated schedule reads. |
| Vehicle state stored in module memory | `fleet_vehicle_operations` persistence by immutable UUID; DB read/write failures return 503; no fake save success; unavailable/unknown state is distinct from verified operation. |
| Driver data scope widened by matching name or vehicle | Driver schedule and profile reads use the authenticated immutable driver UUID; no hardcoded profile fallback or unmasked directory fallback. |
| Internal APIs could be called without authentication | Authentication on all previously open internal/paid-provider routes; HQ restrictions on shared place writes/checklist; scoped personal presets; real login/logout entry points. |
| Auth input and session edge cases | Invalid cookie encoding handled safely; signed token expiry/issued-at/role validation; production Secure + HttpOnly cookies; individual provider accounts, server-only role/driver UUID mapping, active-session checks, revocation and rate limiting; hosted legacy-token rejection. |
| Vehicle-based profile upsert could overwrite another driver | Existing immutable UUID only; no insert/rekey by vehicle; preference merge under row lock, self-only writes, and confirmed-save modal behavior. |
| HTTP retry could create another booking | Frozen client request body/key, same-tab reload recovery, actor/operation scoping, pre-hydration ledger replay, changed-body rejection. |
| OCR could read a user-selected server path or return success after failure | Image data validation; arbitrary filesystem paths rejected; unavailable provider/failure produces non-success HTTP response; sample recognition only accepts exact known identifiers/hashes. |
| Static sample schedules/live flight prose used as real copilot context | Copilot loads authorized server schedules; removed fabricated flight briefing and historical fallback dispatches. |
| Wrong representative vehicle and unverified specifications | Unknown current status/year/color no longer inferred; S560 uses a neutral missing-photo illustration; top hero preserved; no gallery reintroduced. |
| Conditional React hook in customer-message dialog | Removed hook after conditional return, avoiding hook-order crashes as booking state changes. |
| Incomplete or unsafe tests | All unit files discovered; offline fixture isolation; three live-write scripts renamed as explicit opt-in integration checks; no default production project in SQL helper; real Postgres CI added. |
| Dependency advisories | Next.js/eslint-config-next 16.4.3; official SheetJS 0.20.3 distribution; refreshed lockfile; Latest follow-up audit: 0 high/critical, 16 moderate reports in the ESLint/minimatch development dependency chain; see the note below. |

## Verified

- 34/34 unit test files pass; these are file counts, not individual assertion counts.
- `tsc --noEmit` and Next.js production build pass.
- Isolated Postgres 16 CI: independent-connection race (one commit/one conflict), intra-batch conflicts, third-row DB error/zero partial inserts, idempotent replay and key mismatch, stale-update rejection, preservation of omitted columns, KST midnight buffer boundary, general authenticated-role denial, cross-connection state persistence and maintenance blocking. The follow-up also verifies login attempt windows, real SQL session expiry/revocation, UUID-only profile patches and preservation of linked asset fixtures across vehicle assignments. Initial evidence: [CI run 41081075917](https://github.com/Junebooky/driver-eta-notifier/actions/runs/41081075917). Later commits extend the same suite with legacy holds, same-name UUIDs and vehicle-only separation.
- Local production HTTP smoke passes: login HTML, anonymous 401, production development-switch rejection, wrong-password rejection, personal HQ/driver sign-in, Secure/HttpOnly cookies, UUID isolation, HQ access rejection, refresh rotation, copied-token logout revocation, ninth-attempt rate limiting, OCR path rejection and missing-end rejection. This uses an isolated Auth/PostgREST fixture, not live Supabase.
- [Follow-up code CI 41162727597](https://github.com/Junebooky/driver-eta-notifier/actions/runs/41162727597) passed both jobs at `a736bf3`: 34/34 unit files, type check, production build, personal-auth HTTP smoke and Postgres 16 suite.
- `git diff --check` passes. `npm audit --omit=dev` reports zero runtime advisories. `npm audit` reports 0 high/critical and 16 moderate reports, rooted in [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), newly updated October 30. All reported dependency paths are lint tooling. The proposed `npm audit fix --force` downgrade to obsolete ESLint/Next lint configurations was not applied; a compatible upstream fix remains pending. The initial audit had reported zero; that historical result is not the current result.
- Browser visual/mobile interaction QA is **not** claimed: the provided Chromium download failed. HTTP checks do not replace browser verification.
- Full repository lint still fails: 456 errors / 288 warnings at the final follow-up run, primarily pre-existing `any` types and effect-state patterns. Automatic safe fixes reduced errors from 492 at baseline; the rules were not disabled. Type checking/build passing does not imply lint passing.

## Read-only operating database findings

No shared database writes were performed.

- `cockpit.schedules`: 16 records, all 16 have an unknown `end_time`. These need genuine administrator confirmation; no guessed values were written.
- Present: `drivers`, `schedules`, `customers`.
- Absent: `vehicles`, `driving_logs`, `expenses`, `fleet_vehicle_operations`, `dispatch_requests`, `driver_profile_assets`, `driver_vehicle_info_assets`, `driver_info_dispatch_logs`.
- Neither `commit_dispatch_batch` nor the earlier `atomic_dispatch_schedules` is installed.
- The inspected schedule table has no `driver_id`, `vehicle_id`, or `org_id`; the proposal adds them without inventing legacy assignments.
- Security advisor results scoped to `cockpit` only: `official_price_cards` and `official_price_rules` have RLS enabled with no client policies. This is consistent with server-service-role-only pricing access; no permissive public policy was added. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The new code intentionally refuses a supposedly successful dispatch/state save if the required DB capabilities are missing. It must not be deployed as a functioning live dispatch system before the reviewed schema is installed.

## Entire open-issue inventory

Code presence is separate from live readiness. These issues are not bulk-closed on the strength of unit tests.

| Issue | Audit outcome / remaining work |
| --- | --- |
| #1 VIP reporting MVP | Driver log/expense UI and API exist; corresponding live tables absent. Apply reviewed reporting schema and verify real authenticated round trip in isolation first. |
| #3 HQ dashboard design | HQ views exist on feature stack; mobile/desktop visual acceptance and remaining sample-based panels need review. |
| #4 ICN/GMP lookup | Detection/recall code and fixtures exist. Actual KAC operation endpoint/key and live-provider response validation remain necessary. |
| #6 Hi-Pass | Statement import/masking/reconciliation code and tests exist; patched Excel parser. Actual customer statements and real-system reconciliation remain unverified. |
| #7 Master backlog | Aggregate roadmap; not an implementation completion ticket. Use this inventory and linked feature issues. |
| #8 Receipt AI | OCR implemented with truthful failure handling. Live provider configuration and accuracy checks on representative real receipts remain. |
| #9 Receipt split-view review | Do not claim the complete dedicated zoom/rotate + inline edit + Approve & Next workflow is delivered by this audit; it remains product/UI work. |
| #10 Fleet/dispatch | Critical atomicity/state/period/identity corrections delivered in PR #40. Live schema activation, legacy end-time confirmation and visual acceptance remain; full car-only custody lifecycle is not delivered. |
| #11 Driver vehicle check-in | Existing vehicle inspection is not a complete authoritative custody/check-in workflow. Explicit vehicle claim, assignment mismatch and cross-device operational verification remain. |
| #12 HQ→driver dispatch | Assignment, acknowledgment/version/cancellation code exists. Delivery/push guarantees, end-to-end real driver identity and operational checklist acceptance remain. |
| #13 Onboarding audit | Repository/branch/API/schema/verification findings recorded here; this does not close the underlying feature backlog. |
| #14 Log shortcuts/reference UI | Existing shortcuts/log UI preserved. Production membership/API auth enforced; visual acceptance remains. |
| #16 Expense reference UI | Existing expense UI preserved; live persistence schema missing. |
| #18 Customer chauffeur/vehicle profile | Booking-based asset UI exists; live mapping tables/private assets and actual authorized delivery setup remain. |
| #20 Selective email intake | Manual extraction/intake code and fixtures exist; actual mailbox/provider tests and real recipient-safe delivery acceptance remain. Gmail was explicitly deferred. |
| #21 Minimal CRM | Customer UI/server round-trip tests exist; actual customer/contacts migration and complete operational acceptance remain. |
| #23 Field knowledge | Existing knowledge UI/data preserved; shared editorial persistence and content verification require separate acceptance. |
| #25 Email/schedule→HQ→driver plan | Pipeline code exists across stacked PRs. Place authorization and dispatch save safety fixed; isolated full-flow acceptance remains. |
| #33 NAVER/CRM/TMAP/mobile dispatch | Broad feature stack exists, but branch presence alone is not deployment. Mailbox, TMAP, driver account/identity and real-device tests remain. |
| #35 Fresh ETA/log sync | Existing fresh-action tests pass. Live TMAP/mobile app gesture behavior and actual HQ log sync await provider/device/schema verification. |
| #37 Profile + driver×vehicle Info | Exact UUID mapping/upload/preview code exists; all relevant asset tables and vehicle master are absent live. No original assets were uploaded publicly or messages sent. |

## Apply/release checklist

1. Review PR #40 against PR #39, plus the earlier reporting/asset changes already in that stack. Keep existing branches intact.
2. Review current actual schema, take a database backup and validate proposals in a separate database. Old migration files mix `public` and `cockpit`, use inconsistent historical timestamp prefixes and must not be blindly replayed as a folder.
3. For this fix, review `20261030_atomic_dispatch_and_fleet_schema.sql`. It creates the transaction/state infrastructure, adds nullable UUID linkage, removes only the legacy vehicle-to-driver FK, and restricts direct client access. It does **not** infer legacy end times, seed customer data or need the asset migration first.
4. Separately review reporting (`20261029_cockpit_driving_logs_and_expenses.sql`) and vehicle asset (`20261030_driver_vehicle_info_assets.sql`) prerequisites. Existing legacy driver association backfill must be checked by an administrator; no name-only identity inference.
5. Configure actual `.env.example` values. `DEV_AUTH_ENABLED=true` is for local development; hosted production rejects it regardless. Shared driver PIN/HQ passkey login and hosted legacy tokens are now rejected. Apply the reviewed personal-auth proposal and prepare verified individual account-to-driver UUID mappings before deploying; see [the concrete release/rollback plan](PERSONAL_AUTH_RELEASE_PLAN.md).
6. Confirm all 16 genuine end dates/times or explicitly resolve obsolete holds. The 60-minute buffer remains the reviewed draft policy from PR #39; confirm business policy before live release.
7. Run `npm test`, `npm run test:db` against an empty disposable localhost Postgres, `npm run build`, `npm run test:http`, dependency audit, and actual browser/device acceptance. Existing lint debt must remain visible until corrected.
8. Release/merge, shared DB migration, real customer delivery and production reservations were not executed during this audit.
