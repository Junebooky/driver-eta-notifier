# TaaS P0-00 — Legacy compatibility and release gates (2026-11-26)

## Baseline
- Cockpit integration: 632750abb320a2ea22234fd70dfde7cc8c1ac047, green CI 45322496448.
- PR #131: ac2e7f6983db9d2f1987bf73214fc34ec10dbc03, green CI 45578638746, actual public report preview deployment dpl_588uASiMn7YSAzvRnphZA1bY2Duz. PR still unmerged. Stack on #131; merge #131 first after review and retarget to integration.
- Chauffeur main: 4545227644e9b50413f4677bae34eb6be2d2751e, green CI 45623399051. No website intake change until tenant gates pass.
- Preserve actual public report host, token fragment, alias protection override, report-device scope, existing Excel objects/versions/formulas, raw reports, row identities, and queue state. Never use live keys or data in tests. No live DB mutations or deployment in this PR.

## Read-only live metadata
Project rvaowhriekibxtcpyalu: cockpit 35 tables + 4 views, chauffeur 15 tables; cockpit 46 RPCs, 17 policies, 17 trigger entries; chauffeur 7 RPCs, 9 policies.
- Four legacy views cockpit_drivers, cockpit_presets, cockpit_schedules, driver_profiles have security_invoker=true. Do not ALTER as tables. Six base tables without tenant columns: customers, drivers, official_price_cards, official_price_rules, presets, pricing_presets. Verify ownership before backfill.
- schedules/report tables use org_id; vehicles/driving_logs/expenses use organization_id. Retain existing columns and API shapes during transition.
- VIP-only CHECK constraints exist on fleet_vehicle_operations, vehicle_custodies, vehicle_custody_requests; dispatch RPC/triggers need audit.
- report_shared_links, report_submissions, report_jobs, report_ledgers, report_workbook_versions exist. In catalog query report_driver_invites, report_device_sessions, report_devices and verify_report_device/redeem_report_invite/issue_report_invite were not found. Verify exact schema/deployed environment before repair; public report is distinct. No user rows inspected.
- anon SELECT grants on several vehicle/asset relations require RLS and storage audit, not a conclusion of actual exposure.
- Re-run metadata inventory in disposable clone. Backup/restore rehearsal and end-to-end verification still required.

## Release gates
1. Preserve existing URLs and methods, API payload/response/error contracts, IDs, cookies and redirects with compatibility adapters. Unknown domains fail closed.
2. Expand -> migrate verified data -> validate -> switch -> contract after old clients retire. Use forward migrations; no renames/deletions or global Auth changes. Old and new release must work with expanded DB.
3. Structural baseline gate in CI detects route/test deletion, missing critical API methods, historical SQL edits, report origin and cron removal. It does not prove behavior. Keep existing npm test, disposable Postgres dispatch/report/settlement tests, HTTP smoke and build. Add feature-specific tests before every change; any baseline change needs review.
4. Per feature: synthetic VIP baseline -> flag off -> same VIP baseline -> two-tenant isolation -> compare IDs/data/side effects -> review. No real customer emails or live writes in QA. No new tenant before all P0 security gates.
5. Record exact commits, applied migration state, deployment/alias/protection, recovery steps; restore test before change. Roll back application or flag first, reconcile write history, never blindly restore whole shared DB or overwrite active workbook.
6. Stop on failed tests, missing dependency, incorrect tenant access, report job errors or lost data.

## Phase exit criteria
| Stage | Deliverable | Required proof |
| --- | --- | --- |
| P0-00 | Source/DB baseline, regression gate, ownership map | backup and restore rehearsal, old/new DB compatibility |
| P0-01 | Dormant organization/membership/domain/feature model | additive; VIP works unchanged; no guessed ownership |
| P0-02 | Tenant resolver and auth | verified active membership; host-only cookies; old login/redirect/report-device scope; unknown/revoked denied |
| P0-03 | Tenant-aware fleet/driver/CRM/dispatch | scoped service-role/RLS/RPC/trigger/FK, preserve UUIDs, supplier/temporary fleet, no cross-tenant assignment |
| P0-04 | Logs/expenses/settlement/VIP Excel | existing public URL, parser, service choice, idempotency/retry, sheets/formulas/row IDs, VIP-only APIs, standard driving_logs for others |
| P1-05 | White-label PWA | old VIP address/install compatibility, isolated caches, correct invite/reset |
| P1-06 | Chauffeur integration | source reservation/day IDs, stops, currency, suppliers, payments, PDF/outbox, version and idempotency; single write authority |
| P2-07 | Super Admin | least privilege, audit, initial owner invitation, new tenant default denied |

## Behavior test matrix
- Existing admin/representative/driver login, old bookmark, refresh/logout, device token, role revocation, forged host/role/org.
- Email thread+attachment, multi-day/vehicle/waypoints/address/flight; confirm -> assign -> driver schedule/favorites -> ack -> real-time status.
- Fleet/CRM: exact plate/UUID, conflict, maintenance/custody, customer and driver card assets/share.
- VIP public report: same origin and synthetic key fragment, spaced labels/tilde arrow regression, service type, ambiguity, dedup/retry, Excel versions/formulas/rows; no expense inferred as sales.
- Logs, receipts, review and settlement: driver/HQ API, storage, version conflicts, no duplicates/loss.
- Chauffeur: booking/price, date range/route, PDF/mail retry, Gmail OAuth, staff auth, supplier/payment; preserve UI.
- Two tenants with same names and multi-membership, forged IDs, service-role/RLS, storage/cache/session isolation.
