# DollDime — chit cancellation, resellers, account deletion, logging

What was added in this round, how it behaves, and what to do when deploying it.

---

## 1. Chit cancellation microservice (`artifacts/chit-service`)

Customers can cancel a chit plan at any time from the **Chits** tab ("Cancel plan" on a plan that
is under review or active).

**What cancelling does**

| Plan state | Result |
|---|---|
| Under review / active | Plan becomes `cancelled`. Everything already paid into it moves from *locked in chits* to the customer's **spendable wallet balance**, with a wallet transaction "Chit savings released – … (plan cancelled)". The customer gets a WhatsApp message. |
| Already cancelled | Nothing changes; the answer says `alreadyCancelled: true` (safe to retry). |
| Completed | Refused (`409 PLAN_COMPLETED`) — the money was already released at the end of the plan. |
| Rejected by admin | Refused (`409 PLAN_REJECTED`) — nothing was ever locked. |

The plan row and wallet row are locked in the same order the payment code uses, so a payment
arriving at the same moment can't double-count. Cancelled plans keep `cancelled_at`,
`cancellation_reason` and `released_amount` for the records.

**How it fits together**

```
mobile app ──► API  POST /api/chits/:id/cancel   (customer login checked here)
                 │   X-Internal-Token + X-User-Id + X-Trace-Id
                 ▼
           chit-service  POST /internal/chit-plans/:id/cancel   (127.0.0.1:3002, same Postgres)
```

If the service is down or the token is wrong, the customer gets a clear "try again shortly"
(`503 CHIT_SERVICE_UNAVAILABLE`) — nothing is half-done.

**Deploying it**

1. Run it as its own process: `pnpm --filter @workspace/chit-service run build` then
   `pnpm --filter @workspace/chit-service run start`.
2. Environment (see `artifacts/chit-service/.env.example`):
   - `DATABASE_URL` — the same database as the API.
   - `CHIT_SERVICE_TOKEN` — 32+ random characters, **identical** on the API and the service.
   - `CHIT_SERVICE_HOST` / `CHIT_SERVICE_PORT` — keep it on a private address. Never expose it to the internet.
3. On the API set `CHIT_SERVICE_URL` (for example `http://10.0.0.5:3002`) and the same `CHIT_SERVICE_TOKEN`.
4. Health check: `GET /health` on the service.

---

## 2. Resellers portal (admin → **Resellers**)

Replaces the old "Vendors" page. Resellers hand us their dolls and we sell them in the app.

- **Add reseller** — name, contact, phone, email, address, notes.
- **Add their doll** on the Products page and choose them under *Supplied by*. The starting stock is
  recorded as received from them.
- **Stock received / Return stock** (open a reseller) — every hand-over and take-back is logged with a
  date and note, and moves the product's stock in the same step. You can't return more than is free
  on the shelf (units held by customers who are paying don't count).
- **Per reseller:** received, returned, on the shelf, sold, revenue, sell-through %, last sale, a
  12-month sales chart, per-product breakdown and the stock history.
- **Insights tab:** active resellers, their units on the shelf, units sold, revenue in the last 30 days,
  what share of store sales comes from reseller dolls, a 6-month trend, top resellers, dolls running
  low (ask for more) and slow movers (promote or return).
- A yellow **"Stock doesn't add up"** warning means stock was changed on Products/Inventory instead of
  through the reseller buttons. Use the reseller buttons for their dolls.
- Resellers with history can only be **deactivated** (no new stock or products; returns still work).
  Unused ones can be deleted.

"Sold" counts units in **paid** orders only. Payouts to resellers are not handled in the app yet.

---

## 3. Google Play: account deletion link

Play Console → *App content* → *Data safety* → *Delete account URL*:

```
https://<your API domain>/account-deletion
```

The page works without the app: the customer enters their phone number, receives an SMS code
(purpose "delete", the SMS says it will DELETE the account), then enters the code and their password.
The same rules as in-app deletion apply (for example it is blocked while money is in the wallet), and
the page lists what is deleted and what is kept for legal/accounting reasons. Set `SUPPORT_EMAIL` on the
API to show a contact address on the page.

---

## 4. Errors and logs

- Every log line is one JSON object (`timestamp`, `level`, `service`, `message`, `traceId`, …) — ready for
  CloudWatch, Datadog, Grafana Loki, etc. Set `LOG_LEVEL` (`debug`, `info`, `warn`, `error`).
- Every request gets a `traceId`. It is returned in the `X-Trace-Id` header and in every error response,
  passed on to the chit-service, and shown in admin error messages as "(ref …)". When a customer or
  admin reports a problem, search the logs for that id.
- Error responses look like `{ "error": "...", "code": "SOME_CODE", "traceId": "..." }`. Bad JSON is a
  400, oversized bodies/uploads are 413, unexpected failures are a 500 with the details only in the logs.
- Phone numbers are masked in SMS logs (last 4 digits only); query strings aren't logged.

---

## 5. Pagination

Every list takes `?page=1&pageSize=25` and returns `{ items, total, page, pageSize, totalPages }`.
Search and filters run in the database, not in the browser.

| Endpoint | Max page size | Filters |
|---|---|---|
| `GET /api/products` (app) | 50 | `category`, `search`, `featured=true` |
| `GET /api/orders` (app) | 50 | — (paid orders only) |
| `GET /api/admin/products` | 100 | `search`, `category`, `reseller=<id>\|none`, `listing=listed\|hidden`, `stock=low\|out` |
| `GET /api/admin/orders` | 100 | `search` (id/name/phone), `status`, `paymentStatus`, `from`, `to` (YYYY-MM-DD) |
| `GET /api/admin/users` | 100 | `search`, `status=active\|closed` (+ `counts`) |
| `GET /api/admin/wallets` | 100 | `search` (+ `totals` across all wallets) |
| `GET /api/admin/resellers` | 100 | `search`, `status=active\|inactive` |

The app's shop loads 20 dolls at a time as you scroll; search waits until you stop typing.

---

## 6. Database migrations

The project already had versioned migrations (Drizzle — see [DATABASE.md](DATABASE.md)), so
SQLAlchemy/Alembic was **not** added: it is a Python tool, and this codebase is TypeScript end to end,
so it would mean a second schema definition to keep in sync. This round adds one migration,
`lib/db/migrations/0002_conscious_prodigy.sql`. It only adds things (columns, a table, indexes), so it is
safe on a live database. Apply it before starting the new code:

```
DATABASE_URL=... pnpm --filter @workspace/db run migrate
```
