# What changed in this round (medium-priority fixes)

Two parts: **Part 1** explains each change in plain business terms. **Part 2** lists the technical changes and the logic behind them.

---

## Part 1 — In business terms

**Faster, tidier lists.** Orders, products, customers, vendors, wallets and chit plans no longer load all at once. Staff see 25 at a time with search, filters and Next/Previous. In the app, products, orders and wallet history load as the customer scrolls. This keeps the system quick as the customer base grows.

**Safer data entry.** Forms now reject wrong input with a clear message (a negative price, a bad email, a 5-digit pincode, a missing flat number) instead of failing silently or saving bad data.

**Customers can sign up from other countries.** The phone box has a country selector, with India (+91) chosen by default. The system checks that the number has the right length for the chosen country.

**Better security for customers.**
- SMS codes are no longer stored readably. Even if the database leaked, no code could be read from it.
- A customer who has not opened the app for **60 days** is signed out. Any use in between keeps them signed in.

**Better control of the admin site.**
- Only **one admin account** and **one active login** at a time. Signing in on a second computer signs out the first, and the first sees a message explaining why.
- A new **Audit Log** page shows who signed in and what they changed, and when. Passwords are never recorded.

**Wallet opens only after chit payments are complete.** A customer with an approved chit plan cannot spend their wallet until their last payment (August) is made. Then it opens automatically. The wallet screen and checkout explain this, and staff can see "Released / Closed" on the Wallets page. They can still pay for orders online in the meantime. Chit cancellation is not built yet, as agreed.

**Proper delivery addresses.** Customers pick the spot on Google Maps and then fill in flat number, building, street, locality, landmark, city, state and pincode. Staff see the full address and a **"Open in Google Maps" link** on each order and customer. Checkout now uses a saved address, so every order has complete delivery details.

**Pull to refresh.** Pull down on any main app screen, or on the admin site (touch screens, or the Refresh button), to reload the latest data.

**Indian time everywhere.** All dates and times are shown in IST.

**Not done (by your choice):** the CI pipeline and resellers. Hard deletes (products, vendors, cart rows) were already how it worked, so nothing changed there.

---

## Part 2 — Technical changes and logic

### Database (migrations 0002, 0003)
- All timestamps become `timestamptz`. The connection runs in UTC and the apps format to IST.
- `users`: `address_link`, `last_active_at`.
- `wallets`: `is_released` (default true), `released_at`. The migration closes wallets of customers with an approved, active plan.
- `otp_verifications`: `otp` removed, `otp_hash` added. Unused codes are deleted.
- `admin_users.session_id`; new table `admin_audit_log`.
- `customer_addresses`: flat, building, street, locality, landmark, city, state, pincode, `address_link`. `orders.address_link`.

### API logic
- **Pagination:** `lib/pagination.ts` reads `page` and `pageSize` (capped at 100) and `q` for search, and search text is escaped so `%` and `_` match literally. Admin lists return `{items, total, page, pageSize, totalPages}`. Customer lists return plain arrays.
- **Validation:** Zod helpers in `lib/validate.ts`. A thrown `HttpError` is turned into the right response by one global handler in `app.ts`. Malformed JSON gives 400.
- **Route split:** `admin.ts` now only mounts `admin-products`, `admin-vendors`, `admin-orders` and `admin-customers`, plus the existing chit and ops routers.
- **Phone:** `lib/phone.ts` holds the country table and length rules. A leading `+` sets the country, 10 digits default to India, and a longer number is treated as already having the code.
- **OTP:** `lib/otp.ts` stores HMAC-SHA256(secret, purpose|phone|code). Wrong-guess and expiry rules are unchanged.
- **60-day session:** the JWT is now long-lived (1 year). `authMiddleware` rejects a customer whose `last_active_at` is more than 60 days old (code `SESSION_INACTIVE`) and refreshes it at most once an hour.
- **Single admin session:** login writes a random `session_id` into the admin row and the token (`sid`). `requireAdmin` rejects any token whose `sid` no longer matches (code `SESSION_REPLACED`). `POST /admin/auth/logout` clears it. `create-admin` refuses a second username.
- **Audit:** `auditAdminChanges` records every admin POST/PUT/PATCH/DELETE after the response is sent (action, item, status code, redacted body, IP). Logins, failed logins and lockouts are recorded explicitly. `GET /admin/auth/audit-log` is paged and searchable.
- **Wallet release:** approving a chit plan sets `is_released=false` in the same transaction. `applyChitPayment` sets it back to true on completion, but only if the customer has no other approved active plan. `create-order` refuses `useWallet` while closed (409 `WALLET_LOCKED`). Deleting an account that cancels an unpaid approved plan also reopens the wallet.
- **Addresses:** `lib/address.ts` builds one readable address line and the Maps link from the pin. `syncUserAddress` copies the default address into `users.address` and `users.address_link` inside the same transaction. `create-order` takes an `addressId` (it must belong to the caller), and the order stores the full text, coordinates and link. A password reset now also moves the customer's saved addresses to the new account row.

### Admin site
- Shared pieces: `usePaged` (search, filters and page sent to the server, debounced), `Pager`, `usePullToRefresh`, `formatIST`.
- Every list page uses them. New Audit Log page, a Released/Closed column on Wallets, and an address link on Users and Orders.
- Signed-out reasons are shown on the login page. Logout calls the server.

### Mobile app
- New `PhoneInput` and `constants/countries.ts`, used on sign in, register and forgot password.
- New `useRefreshControl`, added to the main screens. Infinite scroll on home and orders, and a "Show older transactions" button on the wallet.
- The addresses screen is now a detailed form with edit, which pre-fills fields from the map result. Checkout lets the customer choose a saved address, and hides the wallet switch with an explanation while the wallet is closed.

### Tests
The end-to-end suite went from 85 to 94 checks. It now covers hashed OTPs, countries, 60-day logout, pagination, validation, addresses, wallet release, and single admin session plus audit log.
