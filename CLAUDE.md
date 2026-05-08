# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev               # nodemon + tsx hot-reload (src/index.ts → port from .env)
pnpm build             # clean dist + tsc + tsc-alias (resolves path aliases)
pnpm start             # run compiled dist/src/index.js

pnpm drizzle:generate  # generate migration files from schema changes
pnpm drizzle:migrate   # apply pending migrations to the database
pnpm drizzle:push      # push schema directly (dev only, no migration file)
pnpm drizzle:studio    # open Drizzle Studio GUI at localhost:4983
```

**Required env vars**: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`

Swagger UI is available at `/api-docs` when the server is running.

## Architecture

### Layered structure (strict — do not skip layers)

```
Route → Controller → Service → Drizzle ORM
```

- `src/api/v1/routes/` — Express routers, all registered in `routes/index.ts`, mounted under `/api/v1`
- `src/api/v1/controller/` — Request parsing and validation only; calls service methods and uses `sendResponse`
- `src/api/v1/service/` — All business logic; static class methods operating directly on `db`
- `src/api/v1/drizzle/schema/` — One file per domain entity; exports table + inferred `$inferSelect`/`$inferInsert` types

### Key utilities

**`requestHandler`** (`utils/requestHandler.ts`) — Wrap every controller method with this to forward async errors to `errorHandler` automatically. Controllers should not need try/catch for service errors.

**`sendResponse`** (`utils/response.ts`) — The only way to send responses: `sendResponse(res, statusCode, message, data?)`. Returns `{ success, message, statusCode, data }`.

**`AppError`** (`utils/AppError.ts`) — Throw `new AppError(message, statusCode)` from services for operational errors. The `errorHandler` middleware catches these and uses `sendResponse`.

**`filterWithPaginate`** (`utils/filterWithPaginate.ts`) — Generic paginated query builder. Accepts the main table, optional joins, filters, orderBy, groupBy, and a custom `select` map. Parse query params with `getFilterAndPaginationFromRequest(req)`. Filter keys support `relation.column` dot notation and `column[from]`/`column[to]` date ranges.

**`getSummary`** (`utils/summary.ts`) — Companion to `filterWithPaginate` for computing aggregate totals (e.g., `SUM`) across the same filtered dataset.

### The `maintains` domain

`maintains` is the central scoping entity — it represents a physical branch, either `'Outlet'` or `'Production'`. Almost all business data (stocks, sales, expenses, deliveries, customers) is scoped to a `maintainsId`. The `maintainsTable.stockCash` column tracks cash on hand at the outlet.

### Stock and batch model

Stock is tracked per product/unit/batch:
- `stock_batch` — one record per inbound shipment; soft-deleted via `deleted: boolean`
- `stock` — one row per (product, unit, stockBatch, maintains); holds `quantity` and `pricePerQuantity`

When a sale is processed, `StockBatchService.processMultiBatchSale` reduces stock quantities inside a transaction. Canceling a payment calls `StockBatchService.revertMultiBatchSale` to restore them.

`daily_stock_record` stores end-of-day snapshots used for historical reporting.

### Date and timezone conventions

All timestamps are stored as UTC with timezone. Reports use **Dhaka timezone (Asia/Dhaka, UTC+6)**. Business day starts at 04:00 AM Dhaka = 22:00 UTC previous day. Use the helpers in `utils/timezone.ts` (`getDayStartUtc`, `buildDayList`, `getBusinessDayRangeUtc`, `getSegmentIntersection`) for any date-range report logic.

### TypeScript config

`strict: false` — `noImplicitAny`, `strictNullChecks`, and other strict checks are all off. `noEmitOnError: false` means the build always emits JS even with type errors.

## Adding a new domain

1. Create `src/api/v1/drizzle/schema/<entity>.ts` — export the table and its inferred types
2. `pnpm drizzle:generate` then `pnpm drizzle:migrate`
3. Create `<entity>.service.ts` (static class) with business logic
4. Create `<entity>.controller.ts` — use `requestHandler`, `sendResponse`, and `AuthRequest` for protected routes
5. Create `<entity>.route.ts`
6. Register in `src/api/v1/routes/index.ts` with `[authMiddleware]` if protected

## Auth

`authMiddleware` (`middleware/auth.ts`) validates `Authorization: Bearer <token>`, decodes the JWT, and attaches `req.user: { id, username, email, roleId }`. Use `AuthRequest` (from `middleware/auth.ts`) instead of `Request` in any protected controller.

Public routes (no auth): `/api/v1/users`, `/api/v1/roles`, `/api/v1/customer-due`, `/api/v1/user-meta`
