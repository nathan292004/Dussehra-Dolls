# Workspace

## Overview

DollDime — a full-stack e-commerce + chit savings platform for selling festive dolls during the Dussehra festival. The system consists of a Flutter Mobile App (Expo React Native), an Express backend API, and a PostgreSQL database.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo / React Native with Expo Router

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── admin/              # React+Vite admin portal (at /admin/)
│   └── mobile/             # Expo React Native mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

### Mobile App (`artifacts/mobile`)
- **Shop**: Browse festive doll products, search, filter by category
- **Cart**: Add/remove items, adjust quantities, view total
- **Checkout**: Enter address, select payment method, place order
- **Orders**: View order history and track status
- **Chit Plans**: Join savings chit groups, view enrollments
- **Wallet**: Check balance, add funds, view transactions
- **Profile**: User account, sign in/register, logout

### Admin Portal (`artifacts/admin`) — at `/admin/`
- **Dashboard** — Stats cards (total orders, revenue, active products, low stock alerts), recent orders table, quick action links
- **Inventory Management** — Full product table with images, stock levels (red warning if < 5 units), Featured badges. Add new products via modal form, edit any product details/stock inline, delete products with confirmation
- **Order Management** — All customer orders in a filterable table (filter by status: pending/confirmed/processing/shipped/delivered/cancelled). Status dropdown to update order stage. Click to expand row for full order items, shipping address, and payment info
- Changes made in the admin portal write directly to the shared PostgreSQL database, so the customer mobile app instantly sees updated product info, stock levels, and order statuses

### API Server (`artifacts/api-server`)
- `GET/POST /api/auth/register` — User registration
- `POST /api/auth/login` — User login
- `GET /api/auth/me` — Get current user
- `GET /api/products` — List products (filter by category/search)
- `GET /api/products/:id` — Get single product
- `GET/POST /api/cart` — View/update shopping cart
- `PUT/DELETE /api/cart/:productId` — Modify cart item
- `GET/POST /api/orders` — List/create orders
- `GET /api/orders/:id` — Get order detail
- `GET /api/chits` — List chit plans
- `GET /api/chits/my` — User's enrollments
- `POST /api/chits` — Join a chit plan
- `GET/POST /api/wallet` — Wallet balance, add funds
- `POST /api/payment/create-wallet-payment` + `verify-wallet-payment` — Razorpay wallet top-up
- `GET /api/healthz` — Liveness probe (uptime + timestamp)
- `GET /api/readyz` — Readiness probe (DB + memory checks)

### Production Hardening
- **Security headers**: helmet.js (HSTS, X-Content-Type-Options, X-Frame-Options, CORP, COOP)
- **CORS**: Restricted to Replit/Expo domains (regex-based allowlist)
- **Rate limiting**: 100 req/min global, 10 req/min on auth endpoints (express-rate-limit)
- **Structured JSON logging**: Every request logged as JSON with traceId, method, path, status, latency, IP
- **Trace IDs**: UUID v4 trace ID on every request (X-Trace-Id header), propagated from client if present
- **Graceful shutdown**: SIGTERM/SIGINT handler drains HTTP connections + DB pool (30s timeout)
- **DB connection retry**: Exponential backoff (5 attempts) on startup before accepting traffic
- **Input validation**: Auth endpoints validate phone format, name length, password strength, OTP format
- **Health endpoints**: `/healthz` (liveness) + `/readyz` (readiness with DB/memory checks)
- **Global error handler**: Catches unhandled errors, returns traceId for debugging, hides stack in production
- **404 handler**: Returns JSON error for unknown routes
- **Body size limits**: JSON/urlencoded bodies capped at 1MB
- **Env docs**: `.env.example` documents all required/optional environment variables

## WhatsApp Notifications (via Twilio)
- **Library**: `artifacts/api-server/src/lib/twilio.ts` — `sendWhatsApp(to, body)`
- **Service**: `artifacts/api-server/src/lib/whatsapp-notifications.ts` — message templates
- **Triggers**:
  - Order confirmed → WhatsApp sent to buyer's phone
  - Chit EMI paid → WhatsApp confirmation sent
  - Wallet topped up → WhatsApp confirmation sent
  - Daily scheduler (`chit-reminder-scheduler.ts`) → reminders 3 days and 1 day before due, plus overdue alerts (up to 7 days past due)
- **Env vars**: `TWILIO_WHATSAPP_FROM` (set to Twilio sandbox `+14155238886`)
- **Sandbox setup**: Users must opt-in by messaging the Twilio sandbox number with the join keyword first

## Database Schema (Drizzle + PostgreSQL)
- `users` — authentication, profile
- `products` — festive doll catalog
- `cart_items` — shopping cart per user
- `orders` — order history with items JSON
- `chit_plans` — savings plans
- `chit_enrollments` — user plan enrollments
- `wallets` — user wallet balances
- `transactions` — wallet transaction history

## Color Scheme — "Artisan Bazaar" Theme
- Background: Parchment `#F0EDE8`
- Surface: White `#FFFFFF`
- Cream: `#FAFAF8` (tab bar, alt surfaces)
- Border: Warm `#EDE9E3`, Strong `#D8D4CE`
- Text: Ink `#1A1A1A`, Secondary `#6B6560`, Muted `#9C968F`
- Accent: Forest Green `#2E8B57` (CTA, active states)
- Accent Light: `#EAF3DE` (badges, tint backgrounds)
- Danger Light: `#FBEAE6` (overdue states)
- **Admin fonts**: Playfair Display (headings/display), DM Sans (body) — via Google Fonts in index.css
- **Admin styling**: `rounded-2xl` cards, `bg-parchment` table headers, `text-ink` headings, `border-warm-border` dividers
- **Mobile**: Uses Ionicons only (no MaterialCommunityIcons/expo-symbols — crashes Android)
- **Mobile CTA**: Primary buttons use Ink `#1A1A1A` bg; accent uses Forest Green

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Development Commands

- `pnpm --filter @workspace/api-server run dev` — run the API dev server
- `pnpm --filter @workspace/mobile run dev` — run Expo dev server
- `pnpm --filter @workspace/db run push` — push DB schema
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
