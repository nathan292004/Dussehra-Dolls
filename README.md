# DollDime – E-Commerce & Chit Savings Platform

DollDime is a full-stack platform designed for handcrafted Dussehra (Golu) doll sales, integrated monthly chit fund savings, and order fulfillment. The repository is organized as a unified monorepo workspace.

---

## Workspace Architecture

| Directory | Type | Description |
|---|---|---|
| `artifacts/mobile` | React Native / Expo SDK 54 | Customer-facing mobile application (iOS, Android, and Web preview) |
| `artifacts/admin` | React / Vite / Tailwind | Back-office dashboard for inventory, orders, vendor ops, and chit approvals |
| `artifacts/api-server` | Express (Node.js / TypeScript) | Central backend API serving customer and admin applications |
| `artifacts/mockup-sandbox` | React | Interactive sandbox environment for visual UI mockups |
| `lib/db` | PostgreSQL / Drizzle ORM | Database schema definitions, migrations, and Drizzle query client |
| `lib/api-spec` | OpenAPI / Zod | Shared API specifications and type-safe schema contracts |
| `scripts` | Node.js utilities | Local setup, seed data scripts, and verification tools |

---

## 9 High-Priority Requirements Verification Status

| No. | Requirement | Status | Summary |
|---|---|:---:|---|
| **1** | **Chit Cancellation** | ❌ **Not Implemented** | No customer-initiated cancellation or refund workflow exists for active paid chits. |
| **2** | **Version Migration** | ✅ **Completed** | Production-ready Drizzle migration pipeline (`0000_initial_schema.sql` through `0004_add_customer_addresses.sql`). Tracked via schema journal without data loss. |
| **3** | **Automated Tests** | ✅ **Completed** | Full test coverage with fast unit tests (`test:unit`) and 13 end-to-end integration sections (`test:e2e`) against PostgreSQL. |
| **4** | **Document Generation** | ❌ **Not Implemented** | No PDF invoice/receipt generation or download workflow exists for orders or chit completions. |
| **5** | **Pagination & Optimization** | ❌ **Not Implemented** | API endpoints return full unpaginated record sets without cursor or page query parameters. |
| **6** | **Error Handling & Logs** | ✅ **Completed** | Centralized structured JSON error logging with `traceId`. Phone numbers masked in logs (`maskPhone`). Silent mobile catch blocks replaced with UI feedback and retries. |
| **7** | **Google Play Account Deletion** | ✅ **Completed** | Compliant with Google Play Data Safety policy: public web deletion portal at `/delete-account`, API endpoint `/api/auth/web-delete-account`, in-app deletion modal, automated PII scrubbing, and statutory data retention disclosures. |
| **8** | **User Details API** | ✅ **Completed** | `GET /api/auth/me` with JWT authentication, strictly scoped to the authenticated caller with sanitized public fields. |
| **9** | **Reseller Functionality** | ❌ **Not Implemented** | Only `is_reseller` and `reseller_code` flags exist in schema. No reseller dashboard, pricing, or commission logic. |

**Current Scorecard:**
- **Completed:** 5 / 9 (56%)
- **Partially Completed:** 0 / 9 (0%)
- **Not Implemented:** 4 / 9 (44%)

---

## Completed Implementations & Verification

### 1. Automated Tests & Unit Test Suite (Requirement 3)
- **Unit Tests:** Located in `artifacts/api-server/src/tests/unit.test.ts`. Tests money arithmetic, chit business rules, user ID format, lockout timing, and PII masking.
  ```powershell
  pnpm --filter @workspace/api-server run test:unit
  ```
- **End-to-End Tests:** Located in `artifacts/api-server/src/tests/e2e.ts`. Tests full flows across all 13 sections against embedded PostgreSQL.
  ```powershell
  $env:TEST_DATABASE_URL = "postgresql://dolldime:4a1e6fb8eb1dc559382047ca872e4a525715260c1e8abbeb@127.0.0.1:5433/dolldime_test"
  pnpm --filter @workspace/api-server run test:e2e
  ```

### 2. Error Handling & Log Security (Requirement 6)
- **PII Redaction:** `maskPhone()` in `artifacts/api-server/src/lib/twilio.ts` masks phone numbers in all outgoing Twilio SMS and WhatsApp logs (`+********3210`).
- **Structured Error Handling:** All route errors in `auth.ts`, `products.ts`, `cart.ts`, `orders.ts`, `chits.ts`, and `wallet.ts` delegate to `next(err)`, producing uniform JSON logs with `traceId`, `timestamp`, and sanitized client error responses (`{ error, traceId }`).
- **Mobile Resilience:** Silent `catch { /* ignore */ }` blocks in `orders.tsx`, `checkout.tsx`, and `razorpay-payment.tsx` have been replaced with proper error state tracking and retry mechanisms.

### 3. Google Play Account Deletion Compliance (Requirement 7)
- **Public Web Deletion Portal:** Mounted at `/delete-account` and `/account-deletion` in `artifacts/api-server/src/routes/account-deletion.ts`. Users can review retention policies and initiate account deletion from any browser without installing the app.
- **Web API Endpoint:** `POST /api/auth/web-delete-account` processes web-initiated deletion requests.
- **PII Scrubbing:** When an account is soft-deleted:
  - User records in `users` have personal data scrubbed (`fname = 'Deleted'`, `lname = 'User'`, `address = null`, `resellerCode = null`).
  - Saved delivery addresses are purged from `customer_addresses`.
  - Active items in `cart_items` are removed.
- **Data Retention Disclosure:** Clear statutory notice in the web portal and in-app modal (`profile.tsx`) explaining that personal data is deleted while completed financial and tax records are retained under the Companies Act / GST regulations.

### 4. Database Version Migration (Requirement 2)
- Built with Drizzle ORM and Drizzle Kit migrations located in `lib/db/migrations/`.
- Schema integrity is continuously validated against migrations via `verify-schema-matches-migrations.ts`.

### 5. User Details API (Requirement 8)
- Authenticated endpoint `GET /api/auth/me` verifies bearer JWT tokens and returns sanitized user data.

---

## Remaining Work Roadmap (Unimplemented Features)

1. **Chit Cancellation (Req 1):** Add an endpoint and admin approval flow allowing customers to request cancellation of active chits, calculating allowable refunds according to chit scheme terms.
2. **Document Generation (Req 4):** Integrate a PDF generation library (e.g., `pdfkit` or `puppeteer`) to dynamically generate downloadable order invoices, payment receipts, and annual chit completion statements.
3. **Pagination & Query Optimization (Req 5):** Add cursor-based or offset pagination (`page`, `pageSize`, `limit`, `offset`) to list endpoints (`/api/products`, `/api/orders`, `/api/admin/orders`) and add database indexing for frequent queries.
4. **Reseller Functionality (Req 9):** Implement reseller registration, unique referral/coupon code generation, commission calculation engines, and a dedicated reseller analytics dashboard.

---

## Getting Started Locally (Windows)

### Prerequisites
- Node.js v24+
- pnpm (corepack enabled or local `.tools` pnpm)
- PowerShell 5.1+

### Quick Start
```powershell
# 1. Install workspace dependencies
pnpm install

# 2. Start PostgreSQL, apply migrations, and launch local servers
.\Start-Local.ps1

# Optional: Run customer app in web preview mode
.\Start-Local.ps1 --web
```

### URLs
- **Admin Dashboard:** `http://localhost:5173/admin/`
- **API Server:** `http://localhost:3001/api/readyz`
- **Account Deletion Portal:** `http://localhost:3001/delete-account`
- **Expo Dev Server:** `http://localhost:8081`

### Running Verification
```powershell
# Run full workspace typecheck
pnpm run typecheck

# Run unit tests
pnpm --filter @workspace/api-server run test:unit

# Run full end-to-end integration test suite
$env:TEST_DATABASE_URL = "postgresql://dolldime:4a1e6fb8eb1dc559382047ca872e4a525715260c1e8abbeb@127.0.0.1:5433/dolldime_test"
pnpm --filter @workspace/api-server run test:e2e
```
