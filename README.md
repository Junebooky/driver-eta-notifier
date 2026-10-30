# Driver Cockpit / VIP HQ

Next.js application for driver schedules, live route/flight lookups, driving logs, receipts and HQ operations.

## Run locally

```sh
npm ci
cp .env.example .env.local
# Fill in your own environment values. For isolated local development only,
# DEV_AUTH_ENABLED=true enables the existing synthetic account switcher.
npm run dev
```

Use `/login` for driver/HQ credentials, `/` for the driver cockpit and `/hq` for HQ. Hosted environments require actual credentials; missing DB/provider configuration is reported as an error rather than simulated save success.

## Verify

```sh
npm test                     # all offline fixture-based unit files
npx tsc --noEmit
npm run build
npm run test:http            # production HTTP smoke on localhost, synthetic secrets
npm audit
npm run lint                 # existing lint debt is still tracked; not currently green
```

For real database transaction tests, use an **empty disposable localhost database**:

```sh
TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/dispatch_test npm run test:db
```

That suite creates its own `cockpit` test schema and runs in a separate Postgres 16 service in CI. It must never target shared/production data. Older `utils/*.integration.ts` scripts are opt-in and require `RUN_ISOLATED_E2E=true` plus explicitly configured isolated services.

Read [the complete audit, open backlog and database release prerequisites](docs/REPOSITORY_AUDIT_20261031.md) before deploying this branch. SQL files marked as proposals have not been executed against the operating database.
