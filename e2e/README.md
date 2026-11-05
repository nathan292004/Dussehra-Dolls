# UI tests (Playwright)

End-to-end browser tests against the admin website and the mobile app's web preview. These assume
the API, admin and mobile dev servers are already running locally (see `../README-LOCAL.md`) —
this suite does not start them, since the API needs a migrated Postgres database first.

## Run

```bash
pnpm --filter @workspace/e2e exec playwright install chromium   # once
pnpm --filter @workspace/e2e test
```

`ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD` default to the local dev admin
(`admin` / `DevAdmin123!`, see `scripts/create-admin.ts`). Override them if your local admin
account differs.

## Gotcha: every registration test now sends a real, billed SMS

`DEV_OTP_MODE` is off in this project's `.env` (switched off deliberately so real Twilio OTP
delivery works end to end). That means every spec that registers or resets a password — currently
`tests/mobile/auth.spec.ts`, `tests/mobile/auth-direct-nav.spec.ts` and `tests/mobile/maps.spec.ts`
— triggers a real Twilio SMS send each time it runs, at Twilio's normal per-message cost. They
read the OTP straight out of the database (`tests/mobile/db-otp.ts`, mirroring what support staff
would do) rather than waiting for the SMS to arrive, but the send itself still happens and is still
billed. Don't run this suite in a loop or in CI without accounting for that. If you need a
no-cost run, temporarily set `DEV_OTP_MODE=true`, restart the API, and swap `db-otp.ts`'s callers
back to reading the on-screen dev code — but check with whoever owns the Twilio account first,
since that also turns off real OTP delivery for anyone testing the app at the same time.

## Gotcha: the auth rate limiter

The API deliberately rate-limits login attempts (`/api/auth`, `/api/admin/auth/login`: 10/min;
admin login specifically: 10 per 15 min — see `artifacts/api-server/src/app.ts`). That's a
security feature, not a bug, but it means:

- `tests/admin/navigation.spec.ts` logs in **once** (`tests/admin/auth.setup.ts`, the
  `admin-setup` project) and every nav-item test reuses that session via `storageState`, instead
  of each test logging in separately.
- If you still hit "Too many auth attempts" while iterating on tests, either wait for the window
  to clear or restart the api-server dev process — it resets the limiter's in-memory counters.
- Prefer `pnpm --filter @workspace/e2e test -- --workers=1` while actively debugging auth-related
  specs, to avoid parallel runs racing the same limiter.

## What's covered

- `tests/admin/login.spec.ts` — bad credentials rejected, good credentials signs in, logout works.
- `tests/admin/navigation.spec.ts` — every sidebar item loads without a console error or falling
  back to the 404 screen (this is what would have caught the `usersTable.id`/`.name` field-name
  bugs from the branch merge).
- `tests/mobile/shop.spec.ts` — the shop tab and bottom tab bar.
- `tests/mobile/auth.spec.ts` — full registration end to end (real Twilio SMS, OTP read from the DB).
- `tests/mobile/auth-direct-nav.spec.ts` — registering/signing in after loading `/auth` directly
  (no back-history) still navigates away on success. Regression test for a bug where
  `router.back()` silently failed when there was nothing to go back to, leaving a successful
  login/registration looking stuck on the same screen.
- `tests/mobile/maps.spec.ts` — the Google Maps address picker actually renders a map (not the
  "needs an API key" fallback), proving `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is wired correctly end
  to end.

## Reports

```bash
pnpm --filter @workspace/e2e run report   # opens the last HTML report
```
