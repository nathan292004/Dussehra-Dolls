# Workspace

## Overview

Dussehra Dolls — a full-stack e-commerce + chit savings platform for selling festive dolls during the Dussehra festival. The system consists of a Flutter Mobile App (Expo React Native), an Express backend API, and a PostgreSQL database.

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

## Database Schema (Drizzle + PostgreSQL)
- `users` — authentication, profile
- `products` — festive doll catalog
- `cart_items` — shopping cart per user
- `orders` — order history with items JSON
- `chit_plans` — savings plans
- `chit_enrollments` — user plan enrollments
- `wallets` — user wallet balances
- `transactions` — wallet transaction history

## Color Scheme
- Primary: Terracotta `#C84B1A` (saffron-orange)
- Gold accent: `#D4A017`
- Background: Warm cream `#FFF9F0`
- Festive Indian festival aesthetic

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
