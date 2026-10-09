# DollDime end-to-end verification

Date: 5 October 2026 (Asia/Calcutta).

The local customer app, admin and API pass the tested browser flows and Razorpay sandbox payments after the fixes below. Full SMS-backed registration remains blocked by Twilio sender configuration. Physical phone behavior and production readiness are not established by these tests.

## Provider configuration

Credentials are stored in the ignored `artifacts/api-server/.env`. No supplied secrets are included in this report or tracked configuration.

- **Razorpay:** test credentials authenticate successfully. Actual Razorpay Checkout test payments completed through the provider's documented mock bank page; the app received and verified the provider-generated signatures. No real bank payment was made.
- **Twilio:** API key credentials authenticate, and the supplied Account SID matches the account. The account is active and is a Trial account. Its phone-number API returned **zero SMS-capable sender numbers**. The application cannot deliver an OTP without an assigned sender.
- **WhatsApp:** delivery was not tested. No WhatsApp notification was sent to an unapproved recipient. Notification tests require sandbox enrollment or an approved WhatsApp sender, plus a designated test recipient.

API-key authentication uses the key SID/secret with the parent Account SID, as described in [Twilio's API authentication documentation](https://www.twilio.com/docs/usage/requests-to-twilio). Razorpay sandbox completion used the [documented mock-bank test flow](https://razorpay.com/docs/server-integration/python/test-app/).

## Results

| Flow | Result | Evidence |
| --- | --- | --- |
| PostgreSQL and API readiness | Pass | Readiness reports database OK |
| Admin product creation and image upload | Pass | Browser form creates the product; uploaded image returns HTTP 200 |
| Catalog listing visibility | Pass | Admin Hide/List changes the customer products API |
| Customer registration logic | Pass with fixture | Valid OTP was seeded in the test database; real SMS delivery is excluded |
| Customer login | Pass | Browser signs in through the Profile screen; wrong password returns 401 |
| Product details and cart | Pass | Browser adds the product; server cart total and quantity match |
| Purchase checkout and payment | Pass | Real provider test order and mock-bank payment; app shows confirmed order |
| Inventory after purchase | Pass | Test stock changes from 8 to 7 for one purchased unit |
| Wallet payment | Pass | Sandbox payment credits exactly ₹10 |
| Chit installment payment | Pass | Sandbox payment records exactly ₹100 against the enrollment |
| Payment verification retries | Pass | Repeated and concurrent requests do not duplicate ledger entries, credits or inventory decrements |
| Invalid payment signature | Pass | Returns 400; wallet is unchanged and a paid purchase remains paid |
| Wallet screen refresh | Pass | Returning to the mounted screen fetches the latest balance |
| Admin vendors | Pass | Create, update, list and delete tested through API |
| Admin shipping status | Pass | Admin update to shipped is visible in the customer's order API |
| Admin navigation | Pass | Inventory, orders, vendors, users, wallets, chit plans and subscriptions render |
| Consumed OTP reuse | Pass after fix | Already-used code returns 400 |
| Failed OTP send cleanup | Pass after fix | Failed delivery leaves no newly valid OTP record |
| Real OTP SMS delivery | Blocked | No Twilio SMS sender; send request returns a failure |
| Workspace TypeScript checks | Pass | All packages typecheck |
| Android bundle | Pass | Expo exports the final Hermes bundle |
| Physical Android/iOS device | Not tested | Browser automation and bundling do not establish native runtime behavior |

## Fixes made during testing

- Added Twilio API-key authentication; an API key SID is not an Account SID.
- Prevented failed SMS sends from leaving usable OTP records, rejected consumed codes, corrected the one-minute resend query for the local database timezone, and used a cryptographic OTP generator.
- Bound each purchase invoice to its Razorpay order and checked the paid provider amount and ownership before recording payment.
- Added unique payment identifiers and database transactions/locks so wallet and chit verification retries cannot apply a payment twice.
- Made purchase confirmation, inventory reduction, cart clearing and the ledger update atomic. Rejects checkout quantities exceeding current inventory.
- Invalid verification requests no longer mark an already-paid purchase as failed.
- Refreshed wallet, chit, cart and catalog data when returning to their screens; cart data also refreshes when authentication changes.

The new nullable payment-reference columns and their unique constraints were applied to the local database. Historical transactions without payment references are not automatically reconciled by these changes.

## Remaining configuration and production issues

**To finish SMS testing:** configure an SMS-capable Twilio sender belonging to this account as `TWILIO_FROM_NUMBER`, then rerun OTP delivery and registration with an approved recipient. The old Replit sender was not substituted because it is not assigned to the supplied Twilio account.

The following existing code paths also require work before live deployment:

- Admin API routes have no admin authentication. The anonymous admin browser test could create and change inventory.
- Customer tokens encode a user ID without a cryptographic signature, and passwords use unsalted SHA-256. Authentication needs stronger session and password handling.
- Legacy `POST /api/wallet` can credit a wallet from the requested amount without payment verification; legacy `POST /api/orders` creates confirmed orders without the Razorpay flow. These paths need to be removed or restricted.
- Stock is checked at checkout and decremented atomically at confirmation, but it is not reserved while a customer is in the external checkout. A paid order that loses a stock race requires explicit reconciliation/refund handling.
- The existing production API build has a CommonJS/`import.meta` issue, and mobile deployment configuration still contains Replit/EAS placeholders; see `README-LOCAL.md`.

## Cleanup and local access

Synthetic test customers, products, orders, wallets, transactions, vendors, chit plans/enrollments and uploaded test images are removed after verification. Existing user data is preserved. Razorpay sandbox orders/payments remain in the provider's test history.

The local application remains available at:

- Admin: http://localhost:5173/admin/
- Customer browser preview: http://localhost:8081/

Diagnostic scripts, provider results and screenshots are in the ignored `.local/e2e` directory. Its saved browser session and fixture files may contain test tokens and payment signatures; keep them local.
