# DollDime — Code Review & Production Readiness Plan

*Review of the full repository (API server, admin website, mobile app, database). Written for the project owner and any developer who will take this to launch.*

*Latest update: **high-priority round done** (see section 0A). Earlier: critical round (section 0).*

*First written 17 Oct 2026. **Updated 19 Oct 2026** after the critical issues (C1–C8) were fixed and tested; this version marks what is done and lists what is still open.*

---

## 0A. Status update — high-priority issues

Tested by the end-to-end suite (84 checks, run on a database built only from the migration files; only Twilio and Razorpay are simulated).

| # | Problem | Status | What was done |
|---|---|---|---|
| H1 | Chit plan rules loose | ✅ Fixed | New approval flow (below), one plan per customer per year enforced by the database, cap of 100 chits, missed payments tracked (see decision) |
| H2 | No stock reservation | ✅ Fixed (cancel/refund + invoices: later, as agreed) | Items are frozen when the customer goes to pay; availability is checked first |
| H3 | Images on local disk | ⏸ Open (you chose to do it later) | – |
| H4 | `push`, no migrations | ✅ Fixed | Versioned migrations, safe runner, `docs/DATABASE.md` |
| H5 | Reminders inside web server, not tracked | ✅ Fixed | Tracked + retried reminders, separate worker, notification log, admin dashboard |
| H6 | Test-WhatsApp endpoint | ✅ Removed | It depended on code that no longer exists |
| H7 | App still points at Replit | ⏸ Open (later). One piece fixed: the production web bundle crashed on start (`import.meta` in a CommonJS bundle); it now starts | – |
| H8 | Open image CORS | ⏸ Open (later) | – |
| H9 | Fake email | ✅ Fixed | Email removed completely; phone number only |

**User table and ids.** Customers now have a permanent text id `user_` + registration date `ddmmyy` (Indian time) + 5 random upper/lower-case letters, e.g. `user_191026kQzTb`. It is the primary key of `users` and every other table links to it. A clash is caught by the database and a new id is generated automatically (up to 6 tries). The table now has: `index` (running number), `user_id`, `fname`, `lname`, `phone`, `address`, `registered_at`, `is_reseller`, `reseller_code`, plus login-lockout and soft-delete fields. Reseller and address are stored but have no behaviour yet.

**H1 — approval flow.** One row per customer plan in a new `chit_plans` table linked to `users.user_id` (it replaces the old plans and enrolments tables). `is_approved` and `is_rejected` start `false`; the admin changes them with **Approve** / **Reject** on the new **Chit Approvals** page (a red number in the menu shows how many are waiting). The customer sees "Under review", then Approved or "Not approved" with the reason, and gets a WhatsApp message each time. Rules enforced by the database, not just the code: a plan cannot be both approved and rejected; a customer can have only one live (under review or approved) plan per plan year, so five simultaneous requests create exactly one and the other four are told to retry/check; two admins approving at once, only one wins. Plans under review cannot be paid and are never reminded. The "active" list shows only approved, running plans. A plan from a finished plan year can only be rejected. Deleting an account cancels a plan still under review.
*Decision recorded:* missed payments are **tracked and shown, with no automatic lapse or fee** (the new dashboard makes them visible).

**H2 — stock reservation.** `products.reserved_stock` holds units frozen by unpaid checkouts; customers can buy `stock − reserved`. When the customer goes to the payment step, one database transaction locks the product rows (always in the same order, so no deadlocks), checks every item and freezes them, or refuses with the exact item and how many are left, before any payment link exists. On payment the frozen units become sold; on cancel, failure or after 30 minutes they are released automatically (the sweeper). Tested: 8 customers racing for 5 units → exactly 5 succeed; opposite-order carts don't deadlock; a cart with one short item freezes nothing; wallet-only orders respect frozen stock; admin cannot set stock below what is frozen; the database itself also refuses reserved > stock.

**H4 — migrations.** `pnpm --filter @workspace/db run generate / migrate / migrate:status / check`. The runner uses a lock (one migrator at a time), applies everything in one transaction, refuses `DROP`/`TRUNCATE`/type changes unless `--allow-destructive`, requires `--yes` in production, has a lock timeout, and refuses a database it does not recognise. All of these were exercised. `Start-Local.ps1` uses it, with `--reset-db` to start clean. `docs/DATABASE.md` explains the safe deploy order, the expand/contract patterns for a live database, and backups.

**H5 — reminders and tracking.** Every WhatsApp/SMS is recorded (`notification_log`); every reminder is recorded (`chit_reminder_log`) as sent or failed with the error, retried up to 3 times, a dead sender's claim is taken over after 15 minutes, and a database claim guarantees one message per customer per month even with several servers. Reminders can run in a separate worker (`start:worker`, with `RUN_BACKGROUND_JOBS=false` on the web servers). The new **Reminders & Tracking** page shows reminders and notifications sent/failed, late payments, customers 2+ months behind, the list of everyone who needs to pay (sortable by late / multi-month), money collected per month, collection rate, wallets, customers, frozen items and low stock.

---

## 0. Status update — critical issues

All eight critical problems from the first review are fixed and covered by an automated end-to-end test (about 90 checks, run against a real PostgreSQL database; only Twilio and Razorpay are simulated).

| # | Problem | Status | What was done |
|---|---|---|---|
| C1 | Admin API had no login | ✅ Fixed | Admin accounts, login page, signed admin tokens, every `/api/admin/*` route protected, 5-wrong-password lock |
| C2 | Customer tokens could be forged | ✅ Fixed | Real JWTs (HS256, signed with a secret, 30-day expiry, separate audience and secret from admin tokens). Deleted/disabled accounts are rejected even with an unexpired token. App stores the token in the phone's secure storage and signs out automatically when the server says it is no longer valid |
| C3 | Passwords stored as plain SHA-256 | ✅ Fixed | bcrypt (cost 12). Existing test users were not migrated, as agreed: they use "Forgot password" once |
| C4 | Free-money / fake-order endpoints | ✅ Fixed | `POST /api/wallet` and `POST /api/orders` were not used by either app, so both were **deleted**. Wallet money now only changes through verified payments, chit completion, wallet purchases and refunds |
| C5 | Registration could take over an account | ✅ Fixed | Registering an existing number is refused ("already registered"). Forgot-password flow with its own OTP. Account deletion. Soft delete only (see below) |
| C6 | OTP could be brute-forced | ✅ Fixed | 5 wrong OTP guesses kill the code; max 5 OTP sends per hour per number; 5 wrong passwords lock login for 15 minutes (customers, admins, and the delete-account password check) |
| C7 | Chit money could not be used | ✅ Fixed | Chit savings stay locked until the plan completes, then move to the spendable wallet with the bonus. Customers can pay for shop orders with wallet money, with the remainder paid online |
| C8 | Floating-point money maths | ✅ Fixed (with one deliberate difference, explained below) | All server money maths is now in whole paise |

### Details of each fix

**C2 — JWT.** Tokens are issued by `jsonwebtoken`, verified with the algorithm pinned to HS256 (so "alg: none" tricks fail), and carry an audience so a customer token cannot open admin routes and vice versa. Tested: tampered, expired, wrong-key, wrong-audience, `alg: none`, the old forgeable format, and an admin token on a customer route are all rejected. New setting: `JWT_SECRET` (required in production; the local launcher generates one).

**C3 — bcrypt.** Passwords are limited to 72 bytes (bcrypt's real limit) so long passwords are not silently truncated. A dummy hash is checked for unknown numbers so response time does not reveal which numbers are registered. (Admin passwords use scrypt, which is equally strong.)

**C5 — accounts.**
- *Register:* the database is checked for a live (`is_deleted = false`) account with the number; if one exists the customer is told "This number is already registered". A database rule (unique index on live numbers) also stops two simultaneous registrations.
- *Forgot password:* send OTP (purpose "reset") → verify → the old row is marked `is_deleted = true` (reason `password_reset`) and a **new row with the same number and the new password** is created. One addition you did not ask for but which is necessary: the customer's wallet, locked chit money, orders, cart, transactions and chit plans are **moved to the new row**. Without that, a password reset would have made all their money and history disappear from their view.
- *OTP safety:* a registration code cannot be used for a reset (and vice versa); each code works once.
- *Delete account:* needs the password. It is refused while there is money in the wallet, savings locked in a chit plan, an undelivered order, or a checkout awaiting payment (customers are told why). Otherwise the row is soft-deleted (`account_deleted`), nothing is removed, and the same number can register again as a brand-new account. Chit plans with no payment yet are marked cancelled.
- *Soft delete:* new columns `is_deleted`, `deleted_at`, `deletion_reason` on users; `is_deleted` on OTP codes. The old fake email (`<phone>@dussehradolls.app`) is gone; email is now optional and the apps show the phone number.

**C6 — limits.** Wrong OTP guesses are counted per code, wrong passwords per account, and the existing per-IP limiters remain on top.

**C7 — wallet purchases.** At checkout the customer can switch "Pay with wallet" on. The wallet pays first, only from the *spendable* balance (locked chit money is never touched):
- Wallet covers everything → the order is confirmed immediately, no online payment.
- Wallet covers part → that part is held, and the rest goes through Razorpay (the screen shows "From wallet ₹300 / Pay online ₹700").
- If the customer abandons the online payment, the held wallet money is returned (immediately when they close the payment screen, or automatically after 30 minutes).
- If the customer pays but the app never reports it, a Razorpay webhook (or the sweeper) still completes the order.
- If the checkout expired, or an item sold out before the order could be confirmed, the online payment is **refunded automatically** and the wallet money returned.
- Two simultaneous checkouts cannot spend the same wallet money twice.
- The online part never drops below ₹1 (Razorpay's minimum): if the wallet would leave less, the wallet pays slightly less.
- Wallet top-ups are also confirmed by the webhook now, and are credited exactly once.

**C8 — money.** Money is still stored in PostgreSQL `numeric(10,2)` columns — an exact decimal type, not a floating-point one — and **every calculation in the server is done on whole paise (integers)** through one helper (`lib/money.ts`): cart totals, order totals, wallet debits and credits, chit amounts, Razorpay amounts, admin revenue. Product prices entered in the admin site are validated strictly (e.g. `19.999` is rejected instead of silently rounded). I deliberately did **not** change the database columns themselves to integers: that would have meant migrating every money column and rewriting every screen, with real risk of showing prices 100× wrong, and it gives no extra accuracy over exact decimals plus integer maths. If you still want integer columns, it is a separate, mechanical piece of work.

**Bugs found and fixed along the way**
- A 10-digit Indian mobile number that happens to start with "91" (for example 9123456789) was treated as already having the country code, so OTPs went to the wrong number. Fixed.
- The old code compared a time set by the server with the database's own clock in a few places; on a database not set to UTC this skews by hours. The unpaid-checkout timeout is now compared inside the database.
- Cart inputs were not validated (any quantity, any product id). Now they are.
- Admin revenue counted unpaid and cancelled orders. Now only paid orders.
- Customers' order lists were not sorted newest-first. Now they are.

---

## 1. Verdict in short

| Question | Answer |
|---|---|
| Is the code quality OK for a prototype? | **Yes — fairly good.** Clear structure, consistent style, sensible features, and the payment code is notably careful. |
| Can it go to the Play Store as it is? | **Not yet.** The stop-ship security and money problems are fixed. What is left is mostly deployment, legal/store setup and testing on real phones and real payment/SMS providers (see §3A and §4). |
| How far from production? | Originally 4–8 weeks. With the critical work done, roughly **3–5 weeks** remain: ~1–2 weeks of production infrastructure and remaining fixes (§3A, §3 H-items), plus store/legal work that can run in parallel and has waiting times. |
| Biggest single risk now? | **Nothing has run against the real providers yet** (live Razorpay, real SMS, WhatsApp) or on a real phone. The automated tests simulate Razorpay and Twilio. After that: no production hosting, backups or image storage yet. |
| Biggest business/legal risk? | The **chit plan** feature collects customers' money over months. In India this may fall under chit-fund / deposit-scheme regulation. Get legal advice **before** launch. |

Overall rating (my judgment): **Prototype/MVP quality: 8/10. Production readiness: 3/10 at the first review, about 6/10 now.**

---

## 2. What is good (keep this)

- **Sensible project layout.** A single workspace with separate customer app, admin site, API and database definitions. Easy to understand.
- **Payment verification is done carefully.** The server re-checks with Razorpay that the money was really paid, that it belongs to this user, and that the amount matches. Repeat/duplicate confirmations don't double-credit (database locks + unique payment IDs). This is the hardest part to get right and it is well done.
- **Stock is reduced safely** at the moment an order is confirmed.
- **OTP basics are right:** cryptographically random codes, expiry, one-time use, resend limit, failed SMS leaves no usable code.
- **Operational basics exist:** security headers, rate limits, request logging with trace IDs, health checks, graceful shutdown, DB retry.
- **Good end-to-end test report** ([END-TO-END-REPORT.md](END-TO-END-REPORT.md)) that honestly lists known problems.
- **Secrets are kept out of git** (`.env` is ignored; only `.env.example` is committed).

---

## 3. Problems, ranked by severity

### 🔴 CRITICAL — must fix before any real user touches it

**C1. The admin API has no login.** — ✅ FIXED
Every `/api/admin/...` route (create/edit/delete products, change order status, list all customers, view all wallets, send WhatsApp test messages, upload files) is open to anyone on the internet who knows the address. The admin website itself also has no sign-in screen.
*Fix:* add a proper admin account system (login, roles) and protect every admin route on the server.

**C2. Customer login tokens can be forged.** — ✅ FIXED
A token is just the user ID encoded in a readable format ([auth middleware](artifacts/api-server/src/middlewares/auth.ts)). Anyone can create a token for user #1, #2, #3… and act as that customer (see their orders, spend via payment flows, read their phone number).
*Fix:* use signed tokens (JWT with a secret key) or server-stored sessions, with expiry and refresh. Store the token in the phone's secure storage, not plain AsyncStorage.

✅ FIXED — **C3. Passwords were stored with plain, unsalted SHA-256** ([auth routes](artifacts/api-server/src/routes/auth.ts)). If the database ever leaks, most passwords can be cracked almost instantly.
*Fix:* use bcrypt or argon2. Migrate existing users on their next login.

**C4. Free money / fake orders through old endpoints.** — ✅ FIXED (see §0)
- `POST /api/wallet` adds any amount to a wallet **without payment** ([wallet route](artifacts/api-server/src/routes/wallet.ts)).
- `POST /api/orders` creates a "confirmed" order **without payment** ([orders route](artifacts/api-server/src/routes/orders.ts)).
*Fix:* delete both. Only the verified Razorpay routes should be able to create credits and confirmed orders.

**C5. Registration can take over someone else's account.** — ✅ FIXED (see §0)
If a phone number already exists, registering again with a fresh OTP **overwrites that account's name and password** — and the OTP is the only protection. A SIM-swap or OTP leak becomes a full takeover with no notice to the owner, and the login "forgot password" and "re-register" flows are the same thing.
*Fix:* separate "sign up", "log in" and "reset password" flows; notify the user on password change.

**C6. OTP can be brute-forced.** — ✅ FIXED (see §0)
There's no limit on how many wrong codes can be tried for one phone number (the limit is per IP only, 10/min). A 6-digit code can be guessed within its 10-minute lifetime by a patient attacker using several IPs.
*Fix:* lock after ~5 wrong attempts per phone number; rate-limit per phone, not only per IP.

**C7. Core chit-plan promises are not implemented.** — ✅ FIXED (see §0)
The app tells customers: *"Each payment adds to your wallet"* and *"Complete all payments to get a discount reward."* In the code, a chit installment is recorded as a payment and then **nothing happens**: no wallet credit, no reward, no way to redeem the saved money. The wallet balance also **cannot be used at checkout** (checkout only supports Razorpay). So customers can put money in and have no way to get value out.
*Fix:* decide the business rules (see §6), then build: redemption at checkout, reward on completion, cancellation/refund policy, payout rules. Until then, the app is showing promises the system cannot keep — this is also a consumer-protection risk.

**C8. Money is handled as decimal text and JavaScript decimals.** — ✅ FIXED (see §0)
Amounts are stored fine (numeric), but are converted with `parseFloat` and added in JavaScript in several places. This can create tiny rounding errors (₹0.01 mismatches).
*Fix:* store money as whole paise (integers) and do all maths in integers.

### 🟠 HIGH — fix before public launch

**H1. Chit plan rules are loose.** — ✅ FIXED (see section 0A)
- Anyone can create a "custom" plan with any duration/amount; there's no cap on total amount or approval.
- The monthly installment is fixed, but "pay more than EMI to finish early" isn't actually supported by the server (it only accepts exactly the EMI).
- Joining a plan has a race condition (two people can take the last seat).
- Missed payments have no consequences (no grace period, penalty, or plan lapse).
- Next due date is "one month from the payment date", not "one month from the previous due date", so it drifts.
*Fix:* define and encode the rules, use transactions for joining.

**H2. Orders: no cancellation, refund, or stock reservation.** — ✅ stock reservation FIXED; cancel/refund/invoice still open (agreed for later)
Stock isn't held while a customer pays. Two customers can pay for the last doll; one ends up with a paid order and no stock. There is no refund path, no cancel button, no returns handling, no shipping charge/tax (GST) calculation, and no invoice.

**H3. Images are saved on the server's local disk.** — ⏸ OPEN (deferred by owner)
Product photos are written to an `uploads/` folder (and some test images are even committed to git). On most hosting platforms the disk is wiped on every deploy, so product photos would vanish. The image URL saved in the database also hard-codes the server address.
*Fix:* use cloud storage (S3 / Cloudflare R2 / Cloudinary) and save only the path.

**H4. Database changes are done by "push", not migrations.** — ✅ FIXED (see section 0A and docs/DATABASE.md)
`drizzle-kit push` (and a `push-force` that can drop data) is how the schema is changed. There is no history of changes and no safe way to update a live database.
*Fix:* switch to versioned migrations, run automatically on deploy; take regular backups and test restoring one.

**H5. Reminders run inside the web server.** — ✅ FIXED (see section 0A)
The daily reminder job runs in the same process as the API. If you run two servers (normal for production), every customer gets **duplicate reminders**; if the server restarts at the wrong time, reminders are skipped. Reminders also aren't recorded, so the same one can be sent twice.
*Fix:* a separate scheduled job (or a queue) plus a "reminder sent" record.

**H6. Test endpoint left in production code.** — ✅ REMOVED
`/api/admin/test-whatsapp` sends messages and should not exist in a live system.

**H7. Mobile app still points at Replit.** — ⏸ OPEN (deferred by owner; the production-bundle crash is fixed)
App config contains Replit domains, placeholder `YOUR_EAS_PROJECT_ID`, `YOUR_PROJECT.replit.app`, and an internal-track Play submission with a missing key file. The API build also has a known module issue (`import.meta` in a CommonJS bundle). Nothing is ready to deploy as-is.

**H8. Wide-open image CORS and weak CORS list.** — ⏸ OPEN (deferred by owner)
Uploaded images are served with `Access-Control-Allow-Origin: *`, and the allow-list for API origins is built around Replit/Expo hostnames. Replace with your real domains.

**H9. The "email" field is fake.** — ✅ FIXED (email removed entirely; sign-up is by phone number only)
Users get a made-up email like `9198xxxx@dussehradolls.app`. It's unusable for receipts or account recovery, and the domain isn't yours. Either collect a real email or drop the field.

### 🟡 MEDIUM — fix soon after launch (or before, if time allows)

- **Automated tests: a good start.** An end-to-end suite now covers auth, JWT, lockouts, account flows, money, wallet checkout, refunds, chit payments and webhooks (`pnpm --filter @workspace/api-server run test:e2e`, needs a throwaway database). Still to add: unit tests for the rules files, tests for the admin screens and mobile app, and a CI pipeline that runs them on every change.
- **Input validation is better but still inconsistent.** Auth, cart, checkout, top-ups, product prices and chit enrolment are now strictly validated. The remaining admin routes (vendors, product other fields, image upload details) still trust what they are sent. Use one validation library (Zod is already installed) on every route.
- **Large files doing too much.** `payment.ts` (540 lines), `admin.ts` (556), `chits.tsx` (590), `auth.tsx` (460) mix business rules, database queries and formatting. Split into routes → services → data layer.
- **Heavy copy-paste.** Repeated `try/catch → 500`, repeated `parseFloat` conversions, repeated "check payment" blocks, repeated customer-fetch-then-notify blocks.
- **Lots of `as any` and loose types** (e.g., `authMiddleware as any`), which defeats TypeScript's safety.
- **No pagination.** Order lists, user lists and wallets load everything at once; this will slow down as you grow. (A customer's orders are now sorted newest-first.)
- **No database indexes** on commonly searched columns (user ID, phone, order status, payment date).
- **API client is hand-written in the app** (`fetch` calls scattered through screens), even though a generated client library exists in `lib/`. Pick one approach and use it everywhere.
- **Logging uses `console.log/error` in many places**, not the structured logger; no error-tracking service.
- **Phone-number logic assumes India** (+91). Fine if intended; make it explicit.
- **Documentation conflicts:** `replit.md` calls the app "Flutter" but it's React Native; several docs mention Replit-specific setup. Clean up.
- **Dead/leftover items:** unused `mockup-sandbox`, `attached_assets` (27 tracked files), `scripts/`, Replit config files, test uploads committed to git.
- **Accessibility/UX:** no empty/error states in some screens, no pull-to-refresh consistency, no loading skeletons, English only (consider Tamil/Telugu/Hindi/Kannada depending on your customers).

---

## 3A. Open items found while fixing

**Added in the high-priority round**
- **Admin cancel / refund** is still missing (agreed for later); so are invoices and shipping/GST.
- **Reminders need the worker in production.** Run one `start:worker` process and set `RUN_BACKGROUND_JOBS=false` on web servers. Real WhatsApp delivery still needs an approved sender and templates.
- **The 30-minute checkout hold** is a setting (`CHECKOUT_HOLD_MINUTES`). Shorter frees stock faster; longer is kinder to slow payers.
- **Reseller and address fields** exist but nothing uses them yet (no discounts, no address book).
- **Existing local databases must be reset once** (`Start-Local.ps1 --reset-db`) because the user id format and the chit tables changed. The migrations are a fresh baseline, intended for databases created from now on.
- **Customer sign-up now asks for first and last name.** Last name is optional on the server.
- **Missed payments have no consequence** beyond reminders and the dashboard (your decision). Revisit before launch together with the refund policy.
- **Hard deletes that remain:** admin deleting a product or vendor, cart rows after checkout. (Users, OTP codes and chit plans are soft-deleted/cancelled only.)

**From the critical round (still relevant)**

These are new or still-open points. None blocks the fixes above; they should be decided or done before launch.

**Money and orders**
1. **Admin changes to orders do not move money.** The admin can mark a paid order "cancelled", but nothing refunds the customer or restocks the item. A proper cancel/refund action (wallet and/or Razorpay) is needed.
2. **Real Razorpay behaviour is untested.** The refund-on-expiry/sold-out logic, partial payments and the webhook were tested against a simulation of Razorpay. Please run them once in Razorpay's test mode (and enable the `payment.captured` webhook).
3. **Top-up money is spendable straight away; chit money only after completion.** That is how it is built. Confirm this is the rule you want.
4. **Wallet money cannot be withdrawn**, and accounts holding any are not deletable. Decide the policy (refund to bank? usable only for shopping?).
5. **Stock is not reserved** during an online payment; the sold-out-after-payment case is now refunded automatically, but customers can still lose a race.

**Accounts and security**
6. **Customer sessions last 30 days with no refresh/revoke.** A lost phone stays signed in until the token expires (or the account is deleted/reset). Consider short-lived tokens with a refresh token and a "sign out everywhere" option.
7. **OTP codes are stored in plain text** in the database (they expire in 10 minutes). Store a hash instead.
8. **Admin has one role.** Every admin can do everything, and admin actions are not logged. Add roles (owner/staff) and an audit trail.
9. **Account deletion is in the app only.** Google Play also requires a web page/link where a customer can request deletion.
10. **A password reset replaces the account row.** Any report or export that assumes "one row per customer forever" must use the phone number or follow the deleted row's replacement.

**Data**
11. **"Nothing is hard deleted" currently applies to users and OTP codes.** Admin delete of products and vendors, clearing cart rows after checkout, and the reminder-claim row removed when a WhatsApp send fails are still real deletes. Say if you want those changed to soft deletes too.
12. **Timestamps have no time zone** (`timestamp` columns). Comparisons that matter now run inside the database, but production should run PostgreSQL in UTC, and moving to `timestamptz` is advisable.
13. **Existing test customers cannot sign in** (their old SHA-256 passwords no longer match) and cannot re-register (their number is still "registered"). They use Forgot password once. Delete test data if you prefer a clean start.

**Not yet verified**
14. **Nothing has been run on a real phone.** The mobile app and admin site were checked with the TypeScript compiler, not tapped through. Please run the new screens once: forgot password, delete account, chit plans, checkout with wallet.
15. **Real SMS and WhatsApp** (DLT registration, approved WhatsApp templates) are still outstanding, as in §4.

---

## 4. Play Store, legal and compliance checklist

This is as important as the code.

| Item | Why it matters |
|---|---|
| **Chit-plan legal review** | Collecting monthly deposits and promising rewards can be regulated in India (Chit Funds Act 1982, rules on prize chits/deposit schemes, RBI/state rules). A lawyer must confirm whether your scheme is allowed, whether it needs registration, and what the customer terms must say. This could block the feature (or the entire launch) if ignored. |
| **Privacy policy (public URL)** | Mandatory for Play Store because you collect phone numbers, names, addresses and payment info. |
| **Terms & conditions, refund/cancellation/shipping policy** | Required by Razorpay and expected by Play reviewers. Must cover chit-plan terms in plain language. |
| **Play "Data safety" form** | Declare exactly what data is collected and why. |
| **In-app account deletion** | Google requires apps with accounts to offer a way to delete the account and data (in-app and via a web link). Not built yet. |
| **Razorpay live-mode approval (KYC)** | Test keys are being used. Business verification is needed to accept real money. |
| **SMS sender registration (India DLT)** | OTP SMS in India require registered sender IDs and templates; Twilio trial can't do this. Consider a local provider (e.g., MSG91, Gupshup) or Firebase phone auth — it is also cheaper. |
| **WhatsApp Business approval** | The Twilio sandbox only works for people who opted in. Real use needs an approved WhatsApp sender and pre-approved message templates. |
| **GST / invoices** | If you are GST-registered, orders need proper tax invoices. |
| **Play developer account** | One-time fee; new personal accounts must run a **closed test with ~12 testers for 14 days** before production release; business accounts require verification. Plan this time in. |
| **App signing & release build** | Android App Bundle (AAB) via EAS, real package ID, version management, crash reporting. |
| **Content rating, store listing, screenshots** | Needed for submission. |

---

## 5. How to restructure into a production-grade system

### 5.1 Target architecture (still simple — don't over-engineer)

```
 Customer App (Android, later iOS)      Admin Website
              \                          /
               \---->  HTTPS API  <-----/       (behind a load balancer / reverse proxy)
                          |
        +-----------------+------------------+
        |                 |                  |
   PostgreSQL        Cloud file storage   Background worker
   (managed, with     (product images)    (reminders, WhatsApp/SMS,
    daily backups)                         payment reconciliation)
                          |
        Razorpay • SMS provider • WhatsApp • error tracking (Sentry)
```

A managed host such as Railway / Render / Fly.io / AWS Lightsail is enough for a long time. Use managed Postgres (Neon, Supabase, RDS) so backups and updates are handled for you.

### 5.2 Reorganise the API code into layers

Today routes contain everything. Move to:

```
api-server/src/
  modules/
    auth/        routes.ts  service.ts  schema.ts (validation)
    products/
    cart/
    orders/      (incl. stock reservation, cancellation, refunds)
    payments/    (Razorpay webhook + verification)
    wallet/      (ledger service — the only code allowed to change balances)
    chits/       (rules engine: join, pay, lapse, complete, reward)
    admin/       (split per resource; all behind admin auth)
    notifications/
  jobs/          reminders, reconciliation
  middleware/    auth, admin-auth, validate, error-handler
  config/        validated environment variables (fail fast on startup)
```

Key rules:
1. **Routes only** read input and return output. **Services** hold business rules. **One place** changes wallet/chit balances.
2. **Validate every request** with a schema.
3. **One central error handler**; throw typed errors instead of repeating `try/catch`.
4. **A proper ledger**: every money movement is an immutable row (credit/debit, reason, reference); the balance is derived or verified from it.
5. **Razorpay webhooks** as the source of truth for payment success (so a payment still counts if the customer closes the app right after paying).

### 5.3 Database

- Switch to **versioned migrations**.
- Add **indexes** and **foreign keys** with sensible delete rules.
- Store money as **integers (paise)**.
- Add tables you will need: `admin_users`, `order_items` (instead of a JSON blob), `payments`, `refunds`, `addresses`, `notification_log`, `audit_log` (who changed what in admin).
- Use **order status transitions** (pending → paid → packed → shipped → delivered / cancelled) enforced by code.
- Daily automated backups + a rehearsed restore.

### 5.4 Security baseline

- Signed, expiring tokens + refresh; secure storage on the phone.
- bcrypt/argon2 passwords; password reset flow.
- Admin login with roles (owner, staff) and an audit trail; optionally two-factor.
- OTP attempt limits, per-phone rate limits, SMS-pumping protection (limit OTP sends per day).
- Restrict CORS to your own domains; HTTPS only; secrets in the host's secret manager.
- Dependency audit (`pnpm audit`) in CI; keep Expo/React Native updated.
- Do a basic **penetration/security test** before launch.

### 5.5 Mobile app

- Remove Replit references; use a single environment config for API URL.
- Create `lib/api` client (generated or hand-written, but **one**) with automatic auth header, error handling, and retry.
- Break the large screens (`chits`, `auth`, `wallet`, `razorpay-payment`) into smaller components and hooks.
- Use secure token storage (`expo-secure-store`).
- Add crash/error reporting (Sentry), basic analytics, and an "update required" check.
- Handle poor networks and offline states gracefully.
- Test on several real Android devices (low-end ones too — your customers likely use them).
- Add account deletion, support/contact screen, terms & privacy links.

### 5.6 Admin website

- Login page + role-based access.
- Search, filters, pagination and CSV export for orders/customers/chits.
- Order detail with printable invoice/packing slip; refund and cancel actions.
- Chit management: see overdue customers, send manual reminders, record offline (cash) payments, approve completions/payouts.
- Audit log of every change.

### 5.7 Quality, testing and delivery

- **Automated tests** (priority order): payments & wallet ledger → chit rules → stock/orders → auth → everything else.
- **CI pipeline** (GitHub Actions): type-check, lint, tests, build on every change.
- **Environments:** local → staging (test Razorpay keys, real phone testing) → production (live keys).
- **Monitoring:** uptime check on `/readyz`, error tracking, alerts for failed payments or failed SMS/WhatsApp.
- **Release process:** versioned releases, staged rollout on Play Store (e.g., 10% → 50% → 100%).
- **Runbook:** one page explaining what to do if payments fail, the database is down, or a customer disputes a charge.

---

## 6. Business decisions needed before the developers can finish

The code can't be completed until these are decided (they're business choices, not technical ones):

1. **What exactly is a chit plan here?** Is it a personal savings plan redeemable only on your dolls? A group chit with lucky-draw/auction? (Group chits are heavily regulated; a simple "save and redeem against our products" plan is far simpler.)
2. **What does the customer get at the end?** A specific bonus percentage? A discount? Store credit? Cash back?
3. **Can money be withdrawn/refunded?** If a customer stops paying or cancels, what happens to what they've paid?
4. **What if a customer misses payments?** Grace period, penalty, plan cancelled?
5. **Where can wallet money be spent?** Only at checkout? Can it be mixed with other payment methods? Does it expire?
6. **Shipping, taxes, returns:** delivery charges, areas served, GST, return/damage policy.
7. **Who operates the admin site?** One owner or several staff with different permissions?
8. **Languages and regions** for the first launch.

---

## 7. Suggested roadmap

### Phase 0 — Decide (1 week, in parallel with Phase 1)
Legal review of chit plans; answer §6; open Razorpay live KYC, Play Console account, SMS/WhatsApp provider registrations (these have waiting times — start now).

### Phase 1 — Stop-ship fixes — ✅ mostly DONE
C1–C8 are done (admin login, JWT, bcrypt, free-money endpoints removed, safe registration/reset/delete, lockouts, wallet checkout, integer money maths) and the payment webhook is added. Left from this phase: remove `/api/admin/test-whatsapp` (H6).

### Phase 1B — High-priority round — ✅ DONE (except H3, H7 and H8, deferred)
User ids, chit approval flow, stock reservation, migrations, tracked reminders + dashboard.

### Phase 2 — Complete the product (≈1–2 weeks left)
Done: chit rules, wallet redemption at checkout, reward on completion, account deletion, money in paise. Left: admin order cancel/refund (§3A-1), stock reservation, cloud image storage, receipts/invoices, pagination, validation on the remaining admin routes.

### Phase 3 — Production foundations (≈1–2 weeks)
Migrations, backups, staging/production environments, CI, tests for money paths, error tracking, background worker for reminders, config cleanup (remove Replit leftovers).

### Phase 4 — Store launch (≈2–3 weeks incl. waiting)
Privacy policy/terms, Data-safety form, release build, closed testing (14 days), fixes, staged rollout, monitor closely for the first two weeks.

### Phase 5 — After launch
Admin reporting, iOS version, push notifications, referral/festival offers, regional languages, analytics.

---

## 8. Quick wins you can do this week

1. ~~Delete `POST /api/wallet` and `POST /api/orders`.~~ ✅ Done.
2. Delete `/api/admin/test-whatsapp`. *(open)*
3. ~~Add an admin guard.~~ ✅ Done properly (real admin login).
4. Remove committed test images from `artifacts/api-server/uploads` and add the folder to `.gitignore`. *(open)*
5. Fix the contradictory docs (`replit.md` says Flutter). *(open)*
6. ~~Hide or reword the app's chit-plan promises.~~ ✅ The promises are now true (locked savings, bonus on completion, wallet purchases).
7. ~~Add a first set of tests for the payment code.~~ ✅ Done (end-to-end suite).

---

## 9. Final assessment

DollDime has a **solid foundation and a good idea**: the product catalogue, ordering, and payment-verification pieces are in good shape, and the structure is easy to build on. What's missing is not polish — it is **security, the finishing of the chit/wallet business logic, deployment infrastructure, and legal/store compliance**. None of these are exceptionally hard, but all of them are required. Update after the high-priority round: the approval flow, stock safety, migrations and reminder tracking are in and tested. What remains is image storage (H3), deployment and Replit leftovers (H7), CORS (H8), admin cancel/refund, real-provider testing, hosting with backups, and the legal/store work. Earlier update: the security and money-handling gaps are closed and proven by tests. The remaining work is the unglamorous part of launching: real-provider testing, hosting and backups, image storage, the admin refund flow, legal sign-off on chit plans, and the Play Store process. A safe, compliant launch is now realistic in roughly **one to two months**, mostly bounded by the Play Store closed-test period and provider approvals rather than by code.
