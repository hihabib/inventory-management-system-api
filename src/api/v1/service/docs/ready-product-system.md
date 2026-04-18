# Ready Product System - Comprehensive Documentation

> **Last Updated:** April 2026
> **Module:** Inventory Management System - Ready Product Tracking & Allocation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Business Requirements](#2-business-requirements)
3. [Database Schema](#3-database-schema)
4. [Code Architecture](#4-code-architecture)
5. [Service Layer - ReadyProductService](#5-service-layer---readyproductservice)
6. [Service Layer - ReadyProductAllocationService](#6-service-layer---readyproductallocationservice)
7. [API Endpoints](#7-api-endpoints)
8. [Allocation Flow & State Machine](#8-allocation-flow--state-machine)
9. [Auto-Creation Logic](#9-auto-creation-logic)
10. [Sync System](#10-sync-system)
11. [Integration Points](#11-integration-points)
12. [Configuration System](#12-configuration-system)
13. [Utility Scripts](#13-utility-scripts)
14. [Data Integrity Rules](#14-data-integrity-rules)

---

## 1. Overview

The **Ready Product System** tracks finished products available at the production house that are ready to be sent to outlets. It serves as a bridge between production output and outlet inventory, ensuring accurate stock visibility before, during, and after product transfers.

### Core Purpose

- **Track ready product stock** at the production house in real-time
- **Manage product allocation** when products are sent from production house to outlets
- **Maintain audit trail** of every quantity change with before/after snapshots
- **Support manual and automatic entry** of ready product data
- **Reconcile data** between ready product records and delivery history

### Key Concepts

| Concept | Description |
|---|---|
| **quantityInMainUnit** | Total physical stock available at the production house (in the product's main unit) |
| **probableRemainingQuantity** | Expected stock after accounting for shipped-but-not-yet-completed orders |
| **Allocation** | A recorded event that changed ready product quantities (ship, complete, cancel, return, etc.) |
| **Auto-Creation** | System automatically adds stock when insufficient quantity exists during shipping |

---

## 2. Business Requirements

### Problem Statement

When products are manufactured and ready at the production house, the system needs to:
1. Know how much stock is physically available
2. Track how much is committed to pending shipments
3. Prevent over-allocation of stock to multiple outlets
4. Provide an audit trail for all stock movements
5. Allow manual stock entry (e.g., from physical count) and automatic entry (triggered by delivery operations)

### Business Rules

| # | Rule | Description |
|---|---|---|
| BR-1 | **Dual Quantity Tracking** | Maintain both total quantity and probable remaining quantity to distinguish between physical stock and available-for-allocation stock |
| BR-2 | **Single Active Row Per Product** | Only one non-deleted `ready_product` row per product at any time (enforced by application logic with `FOR UPDATE` locks) |
| BR-3 | **Auto-Creation on Ship** | When shipping insufficient stock, the system can auto-add the shortfall if configured (see config `auto_create_on_ship`) |
| BR-4 | **Manual Entry Required** | If `force_manual_entry` is enabled and auto-creation is disabled, shipping is blocked until stock is manually entered |
| BR-5 | **Allocation Audit Trail** | Every quantity change must be recorded in `ready_product_allocation` with before-state snapshots |
| BR-6 | **Non-Negative Quantities** | Neither `quantityInMainUnit` nor `probableRemainingQuantity` can be negative |
| BR-7 | **Probable <= Quantity** | `probableRemainingQuantity` must always be <= `quantityInMainUnit` |
| BR-8 | **Stable State Equality** | When no pending shipments exist, `quantityInMainUnit == probableRemainingQuantity` |
| BR-9 | **Unit Conversion** | All quantities are stored in the product's main unit; conversions happen at allocation time |
| BR-10 | **Soft Delete** | Ready product rows use soft delete (`isDeleted` flag) to preserve audit history |

### Entry Types

| Type | Trigger | Description |
|---|---|---|
| **Manual** | User via API/UI | User explicitly creates or updates ready product quantities |
| **Automatic (Ship)** | Delivery status -> `Order-Shipped` | System auto-adds stock when insufficient for shipping (if configured) |
| **Automatic (Sync)** | Sync endpoint | System reconciles ready product state from delivery history |
| **Automatic (Return)** | Delivery status -> `Return-Completed` | Products returned to production house increase stock |

---

## 3. Database Schema

### 3.1 Table: `ready_product`

Tracks the current stock of each product at the production house.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `product_id` | UUID | NO | - | FK -> `product.id` |
| `quantity_in_main_unit` | NUMERIC(,3) | NO | `0` | Total stock available in product's main unit |
| `probable_remaining_quantity` | NUMERIC(,3) | NO | `0` | Stock minus pending shipments |
| `note` | TEXT | YES | `NULL` | Optional note |
| `is_deleted` | BOOLEAN | NO | `false` | Soft delete flag |
| `created_by` | UUID | NO | - | FK -> `user.id` |
| `updated_by` | UUID | YES | `NULL` | FK -> `user.id` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | Last update timestamp |

**Schema File:** `src/api/v1/drizzle/schema/readyProduct.ts`

**Relationships:**
- `product_id` -> `product.id` (Many-to-One: one product can have multiple ready_product rows over time)
- `created_by` -> `user.id` (Many-to-One)
- `updated_by` -> `user.id` (Many-to-One)

---

### 3.2 Table: `ready_product_allocation`

Audit trail for all quantity changes to ready products. Every allocation event creates a row here.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `delivery_history_id` | UUID | NO | - | FK -> `delivery_history.id` |
| `ready_product_id` | UUID | NO | - | FK -> `ready_product.id` |
| `allocated_quantity_in_main_unit` | NUMERIC(,3) | NO | - | Quantity change (positive or negative) |
| `allocation_type` | TEXT | NO | `'ship'` | Type: `ship`, `complete`, `cancel`, `return`, `manual_add`, `auto_add` |
| `was_auto_created` | BOOLEAN | NO | `false` | Whether this allocation involved auto-creation of stock |
| `auto_added_quantity` | NUMERIC(,3) | YES | `0` | Amount auto-added to cover shortfall |
| `quantity_before` | NUMERIC(,3) | NO | `0` | `quantityInMainUnit` snapshot before this allocation |
| `probable_before` | NUMERIC(,3) | NO | `0` | `probableRemainingQuantity` snapshot before this allocation |
| `sent_quantity_in_main_unit` | NUMERIC(,3) | YES | `0` | Sent quantity in main unit (for ship allocations) |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | Last update timestamp |

**Schema File:** `src/api/v1/drizzle/schema/readyProductAllocation.ts`

**Relationships:**
- `delivery_history_id` -> `delivery_history.id` (Many-to-One)
- `ready_product_id` -> `ready_product.id` (Many-to-One)

**Allocation Types:**

| Type | When Created | Quantity Effect |
|---|---|---|
| `ship` | Delivery status -> `Order-Shipped` | Reduces `probableRemainingQuantity` by `sentQty` |
| `complete` | Delivery status -> `Order-Completed` | Reduces `quantityInMainUnit` by `sentQty` |
| `cancel` | Delivery status -> `Order-Cancelled` (from shipped) | Restores both quantities |
| `return` | Delivery status -> `Return-Completed` | Increases both quantities |
| `manual_add` | Manual entry via API | Increases both quantities |
| `auto_add` | Auto-created during ship when insufficient | Increases both quantities |

---

### 3.3 Table: `ready_product_config`

Key-value configuration store controlling ready product system behavior.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `key` | TEXT | NO | - | Unique config key |
| `value` | TEXT | NO | - | Config value |
| `description` | TEXT | YES | `NULL` | Optional description of the config |
| `updated_by` | UUID | YES | `NULL` | FK -> `user.id` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` | Last update timestamp |

**Schema File:** `src/api/v1/drizzle/schema/readyProductConfig.ts`

**Constraint:** `key` is UNIQUE

**Relationships:**
- `updated_by` -> `user.id` (Many-to-One)

---

### 3.4 Entity Relationship Diagram

```
┌──────────────────┐       ┌────────────────────────┐       ┌──────────────────────┐
│     product      │       │     ready_product       │       │        user          │
├──────────────────┤       ├────────────────────────┤       ├──────────────────────┤
│ id (PK)          │◄──┐   │ id (PK)                │   ┌──►│ id (PK)              │
│ name             │   │   │ product_id (FK) ───────┘   │   │ ...                  │
│ main_unit_id     │   │   │ quantity_in_main_unit       │   └──────────────────────┘
│ ...              │   │   │ probable_remaining_quantity          ▲
└──────────────────┘   │   │ note                                │
                       │   │ is_deleted                          │
                       │   │ created_by (FK) ────────────────────┘
                       │   │ updated_by (FK) ────────────────────┘
                       │   │ created_at / updated_at
                       │   └──────────────┬─────────┐
                       │                  │
                       │                  ▼
                       │   ┌────────────────────────────────┐
                       │   │   ready_product_allocation      │
                       │   ├────────────────────────────────┤
                       │   │ id (PK)                        │
                       │   │ delivery_history_id (FK) ──────┼──► delivery_history
                       │   │ ready_product_id (FK) ─────────┘   (id)
                       │   │ allocated_quantity_in_main_unit
                       │   │ allocation_type
                       │   │ was_auto_created
                       │   │ auto_added_quantity
                       │   │ quantity_before / probable_before
                       │   │ sent_quantity_in_main_unit
                       │   │ created_at / updated_at
                       │   └────────────────────────────────┘
                       │
                       │   ┌────────────────────────────┐
                       │   │   ready_product_config      │
                       │   ├────────────────────────────┤
                       │   │ id (PK)                    │
                       │   │ key (UNIQUE)               │
                       │   │ value                      │
                       │   │ description                │
                       │   │ updated_by (FK) ───────────┼──► user (id)
                       │   │ created_at / updated_at    │
                       │   └────────────────────────────┘
```

---

## 4. Code Architecture

### File Structure

```
inventory-management-system-api/src/
├── api/v1/
│   ├── drizzle/schema/
│   │   ├── readyProduct.ts                  # Table definition + types
│   │   ├── readyProductAllocation.ts        # Table definition + types
│   │   └── readyProductConfig.ts            # Table definition + types
│   ├── service/
│   │   ├── readyProduct.service.ts          # Core CRUD + sync operations
│   │   ├── readyProductAllocation.service.ts # Allocation handlers for delivery transitions
│   │   └── deliveryHistory.service.ts       # Integration point (calls allocation service)
│   ├── controller/
│   │   └── readyProduct.controller.ts       # HTTP request handlers
│   ├── routes/
│   │   └── readyProduct.route.ts            # Express route definitions
│   └── middleware/
│       └── auth.ts                          # JWT auth (applied to all ready product routes)
├── test-scripts/
│   └── reset-ready-products.ts              # Emergency reset utility
└── ...
```

### Class Hierarchy

```
ReadyProductController          ReadyProductAllocationService
├── createOrUpdateReadyProducts ├── getOrCreateReadyProduct()
├── updateReadyProducts         ├── getConfig()
├── deleteReadyProducts         ├── convertToMainUnit()
├── getReadyProducts            ├── getProductName()
├── getReadyProductById         ├── recordAllocation()
├── getReadyProductDetails      ├── handleOrderShipped()
├── syncReadyProducts           ├── handleOrderCompleted()
├── getConfig                   ├── handleOrderCancelled()
├── updateConfig                ├── handleRevertToPlaced()
└── getAllocations              └── handleReturnCompleted()

ReadyProductService
├── createOrUpdateBulk()
├── updateBulk()
├── deleteBulk()
├── getReadyProducts()
├── getReadyProductById()
├── getReadyProductDetails()
└── syncReadyProducts()
```

---

## 5. Service Layer - ReadyProductService

**File:** `src/api/v1/service/readyProduct.service.ts`

Handles CRUD operations and data reconciliation for ready products.

### 5.1 `createOrUpdateBulk(items, userId)`

**Purpose:** Bulk create or add to existing ready product entries.

**Parameters:**
- `items: Array<NewReadyProduct & { id?: string }>` - Array of ready product data. If `id` is provided, adds to existing row; otherwise creates new.
- `userId: string` - Authenticated user ID.

**Logic:**
1. Wraps all operations in a database transaction
2. For each item:
   - Validates `quantityInMainUnit` is positive
   - Validates `probableRemainingQuantity` is non-negative and <= `quantityInMainUnit`
   - If `probableRemainingQuantity` not provided, defaults to `quantityInMainUnit`
3. If `id` is provided (update existing):
   - Fetches existing row, validates it exists
   - Validates product ID matches
   - **Adds** the new quantity to existing `quantityInMainUnit` (additive, not replacement)
   - Updates `probableRemainingQuantity` (if provided, uses it; otherwise keeps existing)
   - Validates `probable <= quantity` after addition
4. If `id` is not provided (create new):
   - Inserts new row with provided data
5. Returns array of created/updated rows

**Validation Rules:**
- `quantityInMainUnit > 0` (strictly positive)
- `probableRemainingQuantity >= 0` (non-negative)
- `probableRemainingQuantity <= quantityInMainUnit`

---

### 5.2 `updateBulk(items, userId)`

**Purpose:** Bulk update (replace) existing ready product values.

**Parameters:**
- `items: Array<{ id: string } & Partial<NewReadyProduct>>` - Array with `id` and fields to update.
- `userId: string` - Authenticated user ID.

**Logic:**
1. Transaction-wrapped operations
2. For each item:
   - Fetches existing row, validates it exists
   - Uses provided values or falls back to existing values
   - **Replaces** values (unlike `createOrUpdateBulk` which adds)
   - Validates same quantity constraints
3. Returns array of updated rows

**Key Difference from `createOrUpdateBulk`:** This method **replaces** quantity values rather than adding to them.

---

### 5.3 `deleteBulk(items, userId)`

**Purpose:** Bulk delete ready product entries.

**Parameters:**
- `items: Array<{ id: string; hardDelete?: boolean }>` - Array of items to delete.
- `userId: string` - Authenticated user ID.

**Logic:**
- **Soft delete (default):** Sets `isDeleted = true`
- **Hard delete:** If `hardDelete: true`, permanently removes the row
- All operations are transaction-safe

---

### 5.4 `getReadyProducts(pagination, filter)`

**Purpose:** List ready products aggregated by product with pagination.

**Logic:**
1. Counts distinct products (not rows) for accurate pagination
2. Aggregates quantities per product using `GROUP BY`:
   - `quantityInMainUnit`: `SUM` of all active rows for the product
   - `probableRemainingQuantity`: `SUM` of all active rows for the product
3. Joins with `product` table for product name
4. Orders by product name ascending
5. Returns paginated result with list and pagination metadata

**Response Shape:**
```json
{
  "list": [
    {
      "productId": "uuid",
      "productName": "Product Name",
      "quantityInMainUnit": 100.000,
      "probableRemainingQuantity": 75.000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "totalCount": 48
  }
}
```

---

### 5.5 `getReadyProductById(id)`

**Purpose:** Fetch a single ready product row by ID.

**Logic:**
- Selects from `ready_product` where `id` matches and `isDeleted = false`
- Returns the row or `undefined` if not found

---

### 5.6 `getReadyProductDetails(productId)`

**Purpose:** Get a comprehensive view of ready product for a specific product.

**Logic:**
1. Fetches all active (`isDeleted = false`) rows for the product
2. Fetches product name from `product` table
3. Fetches last 20 allocation records for the first matching ready_product row
4. Aggregates total `quantityInMainUnit` and `probableRemainingQuantity` across all rows
5. Returns combined details

**Response Shape:**
```json
{
  "productId": "uuid",
  "productName": "Product Name",
  "quantityInMainUnit": 100.000,
  "probableRemainingQuantity": 75.000,
  "rows": [...],
  "allocations": [...]
}
```

---

### 5.7 `syncReadyProducts(options)` *(Complex)*

**Purpose:** Reconcile ready product quantities with delivery history. Recalculates correct state from source of truth (delivery_history).

**Parameters:**
```typescript
{
  productId?: string;      // Filter by specific product
  maintainsId?: string;    // Filter by outlet/maintains
  fromDate?: Date;         // Filter start date
  toDate?: Date;           // Filter end date
  dryRun?: boolean;        // Preview changes without applying
}
```

**Algorithm:**
1. Fetches all matching delivery histories ordered by `createdAt` ascending (chronological)
2. For each delivery:
   - Looks up the product and its unit conversions
   - Converts sent/received quantities to main unit
   - Maintains a running state per product (`quantityInMainUnit`, `probableRemainingQuantity`)
3. Processes deliveries by status:
   - **Order-Shipped:**
     - If `quantityInMainUnit < sentQty`, auto-adds the shortfall (bumps qty = sentQty)
     - Decreases `probableRemainingQuantity` by `sentQty`
   - **Order-Completed:**
     - Decreases `quantityInMainUnit` by `sentQty`
     - `probableRemainingQuantity` unchanged (already reduced at ship time)
   - **Order-Cancelled:**
     - Restores `probableRemainingQuantity` by `sentQty`
     - Caps `probable <= quantity`
4. Clamps both values to non-negative
5. Compares calculated state with current database state
6. Reports discrepancies (expected vs actual)
7. If not dry-run, applies corrections:
   - If no existing rows: inserts new ready_product row
   - If existing rows: updates first row with correction delta
8. Returns summary with discrepancy details

**Response Shape:**
```json
{
  "productsAnalyzed": 25,
  "discrepanciesFound": 3,
  "correctionsApplied": 3,
  "dryRun": false,
  "details": [
    {
      "productId": "uuid",
      "productName": "Product Name",
      "expectedQty": 100.000,
      "expectedProbable": 75.000,
      "actualQty": 95.000,
      "actualProbable": 70.000,
      "qtyDifference": 5.000,
      "probableDifference": 5.000,
      "currentRowsCount": 1,
      "deliveriesProcessed": 12
    }
  ]
}
```

---

## 6. Service Layer - ReadyProductAllocationService

**File:** `src/api/v1/service/readyProductAllocation.service.ts`

Handles all ready product quantity changes triggered by delivery history status transitions. This is the **automatic** side of the system - called by `DeliveryHistoryService` whenever a delivery status changes.

### Key Invariants (documented in source)

- One active row per product in `ready_product` table
- Stable state: `quantityInMainUnit == probableRemainingQuantity` (when no pending shipments)
- Neither field can be negative
- `probable = qty - sum(pending shipped amounts)`

---

### 6.1 `getOrCreateReadyProduct(tx, productId, userId)`

**Purpose:** Get the active ready_product row for a product, or create one with zero quantities if it doesn't exist.

**Logic:**
1. Selects active rows (`isDeleted = false`) for the product with `FOR UPDATE` row lock
2. If found, returns the first row
3. If not found, creates a new row with `quantityInMainUnit = 0` and `probableRemainingQuantity = 0`
4. Returns the created row

**Concurrency:** Uses `FOR UPDATE` lock to prevent concurrent modifications within the same transaction.

---

### 6.2 `getConfig(tx, key, defaultValue)`

**Purpose:** Read a configuration value from `ready_product_config`.

**Parameters:**
- `tx` - Database transaction
- `key: string` - Config key to look up
- `defaultValue: string` - Default if key not found (default: `"false"`)

---

### 6.3 `convertToMainUnit(tx, productId, unitId, quantity)`

**Purpose:** Convert a quantity from any unit to the product's main unit.

**Logic:**
1. Fetches product's `mainUnitId`
2. If `unitId == mainUnitId`, returns quantity as-is
3. Otherwise, fetches all unit conversions for the product
4. Calculates: `quantity * (mainConv.conversionFactor / sentConv.conversionFactor)`
5. Returns result rounded to 3 decimal places

---

### 6.4 `getProductName(tx, productId)`

**Purpose:** Helper to get product name for error messages. Returns product name or the productId as fallback.

---

### 6.5 `recordAllocation(tx, data)`

**Purpose:** Create an allocation audit trail record.

**Parameters:**
```typescript
{
  deliveryHistoryId: string;
  readyProductId: string;
  allocatedQuantityInMainUnit: number;
  allocationType: string;
  wasAutoCreated?: boolean;
  autoAddedQuantity?: number;
  quantityBefore: number;
  probableBefore: number;
  sentQuantityInMainUnit?: number;
}
```

Inserts a row into `ready_product_allocation` with current timestamps.

---

### 6.6 `handleOrderShipped(tx, deliveryHistory, userId)`

**Purpose:** Handle the transition TO `Order-Shipped` status.

**Logic Flow:**
```
1. Convert sentQuantity to main unit
2. If sentMainQty <= 0, skip
3. Get or create ready_product row (with FOR UPDATE lock)
4. Check if current stock is sufficient:
   ┌─ currentQty >= sentMainQty
   │  → Proceed to ship allocation
   │
   └─ currentQty < sentMainQty (INSUFFICIENT STOCK)
      ├─ Check config: force_manual_entry + !auto_create_on_ship
      │  → THROW ERROR: "Manual entry required before shipping"
      │
      ├─ Check config: !auto_create_on_ship
      │  → THROW ERROR: "Insufficient ready product stock"
      │
      └─ auto_create_on_ship = true
         → Calculate shortfall = sentMainQty - currentQty
         → Record "auto_add" allocation
         → Update ready_product: qty += shortfall, probable += shortfall
5. Re-fetch ready_product (with lock) to get current values
6. Decrease probableRemainingQuantity by sentMainQty
7. Validate new probable >= 0 (throw error if would go negative)
8. Update ready_product row
9. Record "ship" allocation with snapshot
```

**Error Cases:**
- `400` - Insufficient stock with manual entry required
- `400` - Insufficient stock with auto-creation disabled
- `500` - Probable quantity would go negative (data inconsistency)

---

### 6.7 `handleOrderCompleted(tx, deliveryHistory, userId)`

**Purpose:** Handle the transition TO `Order-Completed` status.

**Logic Flow:**
```
1. Find the "ship" allocation for this delivery
   └─ If not found, skip (delivery created before this feature)
2. Get sentMainQty and autoAdded from ship allocation
3. Get ready_product row (with FOR UPDATE lock)
4. Auto-add correction (if applicable):
   └─ If autoAdded > 0 AND receivedQuantity exists:
      ├─ Convert receivedQuantity to main unit
      ├─ If received < sent:
      │  → correction = min(autoAdded, sent - received)
      │  → Reduce currentQty by correction (retroactively adjust auto-add)
      └─ If received >= sent: no correction needed
5. Calculate deductionQty = sentMainQty - correction
6. newQty = currentQty - deductionQty
7. Validate newQty >= 0 (throw if negative)
8. Update ready_product: quantityInMainUnit = newQty
   (probableRemainingQuantity unchanged - already reduced at ship time)
9. Record "complete" allocation
```

**Key Insight:** When an order completes, `quantityInMainUnit` decreases by the sent amount. If the product was auto-added and received less than sent, the auto-add is partially reversed. This ensures the final state accurately reflects what was actually received at the outlet.

---

### 6.8 `handleOrderCancelled(tx, deliveryHistory, userId)`

**Purpose:** Handle transition from `Order-Shipped` to `Order-Cancelled`.

**Logic Flow:**
```
1. Find the "ship" allocation for this delivery
   └─ If not found, skip
2. Get sentMainQty and autoAdded from ship allocation
3. Get ready_product row (with FOR UPDATE lock)
4. Restore probable: newProbable = probableBefore + sentMainQty
5. Reverse auto-add (if any):
   └─ If autoAdded > 0:
      → newQty = qtyBefore - autoAdded
      → newProbable -= autoAdded
6. Clamp both values to >= 0
7. Update ready_product row
8. Record "cancel" allocation (with negative allocatedQuantity for audit)
```

---

### 6.9 `handleRevertToPlaced(tx, deliveryHistoryId, userId)`

**Purpose:** Handle transition from `Order-Shipped` back to `Order-Placed`.

**Logic:** Identical to `handleOrderCancelled` - reverses the ship allocation and any auto-add.

---

### 6.10 `handleReturnCompleted(tx, deliveryHistory, userId)`

**Purpose:** Handle product returns from outlet to production house.

**Logic Flow:**
```
1. Convert receivedQuantity (return amount) to main unit
2. If returnMainQty <= 0, skip
3. Get or create ready_product row
4. newQty = qtyBefore + returnMainQty
5. newProbable = probableBefore + returnMainQty
6. Update ready_product row (both quantities increase equally)
7. Record "return" allocation
```

---

## 7. API Endpoints

**Base Path:** `/api/v1/ready-products`
**Auth:** All endpoints require JWT authentication (`Authorization: Bearer <token>`)

| Method | Path | Handler | Description |
|---|---|---|---|
| `POST` | `/` | `createOrUpdateReadyProducts` | Bulk create or add to ready products |
| `PUT` | `/` | `updateReadyProducts` | Bulk update (replace) ready product values |
| `DELETE` | `/` | `deleteReadyProducts` | Bulk delete ready products |
| `GET` | `/` | `getReadyProducts` | List ready products (aggregated by product, paginated) |
| `GET` | `/product/:productId/details` | `getReadyProductDetails` | Detailed view for a specific product |
| `GET` | `/:id` | `getReadyProductById` | Get single ready product row |
| `GET` | `/:id/allocations` | `getAllocations` | Get allocation history for a ready product |
| `POST` | `/sync` | `syncReadyProducts` | Reconcile with delivery history |
| `GET` | `/config` | `getConfig` | Get all configuration values |
| `PUT` | `/config` | `updateConfig` | Update configuration values |

### Endpoint Details

#### `POST /api/v1/ready-products`

**Request Body:**
```json
[
  {
    "productId": "uuid",
    "quantityInMainUnit": 50.000,
    "probableRemainingQuantity": 50.000,
    "note": "Manual entry from physical count"
  },
  {
    "id": "existing-uuid",
    "productId": "uuid",
    "quantityInMainUnit": 25.000,
    "note": "Adding more stock"
  }
]
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Ready products processed successfully",
  "data": [...]
}
```

#### `PUT /api/v1/ready-products`

**Request Body:**
```json
[
  {
    "id": "uuid",
    "quantityInMainUnit": 100.000,
    "probableRemainingQuantity": 80.000,
    "note": "Updated after recount"
  }
]
```

**Response:** `200 OK`

#### `DELETE /api/v1/ready-products`

**Request Body:**
```json
[
  { "id": "uuid" },
  { "id": "uuid", "hardDelete": true }
]
```

**Response:** `200 OK`

#### `GET /api/v1/ready-products`

**Query Parameters:** `page`, `limit`

**Response:** `200 OK` (see `getReadyProducts` response shape above)

#### `GET /api/v1/ready-products/product/:productId/details`

**Response:** `200 OK` (see `getReadyProductDetails` response shape above)

#### `POST /api/v1/ready-products/sync`

**Query Parameters:**
- `productId` (optional) - Filter by product
- `maintainsId` (optional) - Filter by outlet
- `fromDate` (optional) - Start date
- `toDate` (optional) - End date
- `dryRun` (optional) - `"true"` to preview without applying

**Response:** `200 OK` (see `syncReadyProducts` response shape above)

#### `PUT /api/v1/ready-products/config`

**Request Body:**
```json
[
  { "key": "auto_create_on_ship", "value": "true" },
  { "key": "force_manual_entry", "value": "false" }
]
```

**Response:** `200 OK`

---

## 8. Allocation Flow & State Machine

### Delivery Status Lifecycle

```
                    ┌──────────────┐
                    │ Order-Placed │
                    └──────┬───────┘
                           │ (no ready product effect)
                           ▼
                    ┌──────────────┐
              ┌─────│ Order-Shipped│─────┐
              │     └──────┬───────┘     │
              │            │             │
              │            ▼             │
              │     ┌───────────────┐    │
              │     │Order-Completed│    │
              │     └───────────────┘    │
              │                          │
              ▼                          ▼
       ┌───────────────┐       ┌────────────────┐
       │ Order-Placed  │       │Order-Cancelled │
       │ (revert)      │       │                │
       └───────────────┘       └────────────────┘

                    ┌─────────────────┐
                    │Return-Completed │ (products returned to production house)
                    └─────────────────┘
```

### Quantity State Transitions

```
Initial State:    qty=0, probable=0

Manual Add:       qty+=X, probable+=X        → qty=100, probable=100
                   (allocation_type: manual_add)

Order-Shipped:    probable-=sentQty           → qty=100, probable=75
                   (allocation_type: ship)       [sentQty=25]

Order-Shipped     qty+=shortfall,             → qty=125, probable=100
(with auto-add):  probable+=shortfall,           [shortfall=25]
                   probable-=sentQty               [sentQty=25]
                   (allocations: auto_add + ship)

Order-Completed:  qty-=sentQty                → qty=75, probable=75
                   (allocation_type: complete)   [stable state: qty==probable]

Order-Cancelled:  probable+=sentQty,          → qty=100, probable=100
(from Shipped):   reverse auto-add if any        [full reversal]
                   (allocation_type: cancel)

Return-Completed: qty+=returnQty,             → qty=125, probable=125
                   probable+=returnQty
                   (allocation_type: return)
```

### Complete Example Flow

```
Step 1: Manual Entry
  qty=200, probable=200  [200 units of Product A at production house]

Step 2: Ship 50 units to Outlet X
  qty=200, probable=150  [50 units in transit, still counted in total]

Step 3: Ship 30 units to Outlet Y
  qty=200, probable=120  [80 units in transit total]

Step 4: Outlet X receives 50 (Order-Completed)
  qty=150, probable=120  [50 units removed from production house]

Step 5: Outlet Y's order cancelled
  qty=150, probable=150  [30 units restored, stable state: qty==probable]
```

---

## 9. Auto-Creation Logic

The auto-creation feature allows the system to automatically add stock when there isn't enough for a shipment. This is controlled by configuration keys.

### Decision Flow

```
Order-Shipped event received
         │
         ▼
┌─────────────────────┐
│ currentQty >= sentQty│─── YES ──► Proceed with normal ship
└─────────┬───────────┘
          │ NO (insufficient stock)
          ▼
┌─────────────────────────────┐
│ Read config:                │
│ auto_create_on_ship = ?     │
│ force_manual_entry = ?      │
└─────────┬───────────────────┘
          │
    ┌─────┴──────────────────────┐
    │                            │
    ▼                            ▼
auto=true                 auto=false
    │                            │
    ▼                     ┌──────┴──────┐
  Auto-add               force=true?   │
  shortfall              │             │
  (new row or            ▼             ▼
   add to existing)    ERROR:        ERROR:
    │                  "Manual       "Insufficient
    ▼                  entry          stock"
  Continue             required"
  with ship

```

### Configuration Matrix

| `auto_create_on_ship` | `force_manual_entry` | Insufficient Stock Behavior |
|---|---|---|
| `true` | `false` | Auto-add shortfall and proceed |
| `true` | `true` | Auto-add shortfall and proceed (force_manual_entry ignored when auto is on) |
| `false` | `false` | Throw error: "Insufficient ready product stock" |
| `false` | `true` | Throw error: "Manual entry required before shipping" |

---

## 10. Sync System

The sync system is a reconciliation tool that recalculates ready product state from the source of truth (delivery history) and corrects any discrepancies.

### When to Use

- After data migrations or imports
- When manual corrections caused inconsistencies
- After system errors that left data in an inconsistent state
- Periodic maintenance checks

### How It Works

1. **Fetches** all delivery histories matching the filter criteria, ordered chronologically
2. **Replays** each delivery event in order, maintaining running totals per product
3. **Compares** the calculated state with current database state
4. **Reports** discrepancies with expected vs actual values
5. **Applies** corrections (unless in dry-run mode)

### Sync vs Allocation Service

| Aspect | Sync (ReadyProductService) | Allocation (ReadyProductAllocationService) |
|---|---|---|
| **Trigger** | Manual (API call) | Automatic (delivery status change) |
| **Purpose** | Fix data inconsistencies | Real-time quantity tracking |
| **Scope** | Can process all products at once | Handles one delivery at a time |
| **Data Source** | Replays all delivery history | Responds to current event |
| **Risk** | Low (has dry-run mode) | Medium (modifies live data) |

---

## 11. Integration Points

### 11.1 Delivery History Service Integration

**File:** `src/api/v1/service/deliveryHistory.service.ts`

The `DeliveryHistoryService` calls `ReadyProductAllocationService` at specific status transition points:

#### On Create Delivery History

```typescript
// After creating delivery history records:
for (const created of createdDeliveryHistories) {
    if (created.status === "Order-Shipped" && created.sentQuantity > 0) {
        await ReadyProductAllocationService.handleOrderShipped(tx, created, userId);
    }
    if (created.status === 'Order-Completed') {
        await ReadyProductAllocationService.handleOrderCompleted(tx, created, userId);
    }
    if (created.status === 'Return-Completed') {
        await ReadyProductAllocationService.handleReturnCompleted(tx, created, userId);
    }
}
```

#### On Update Delivery History (single)

```typescript
// Status transition checks:
Order-Placed/Order-Completed/Order-Cancelled → Order-Shipped:  handleOrderShipped()
* → Order-Completed:                                         handleOrderCompleted()
Order-Shipped → Order-Cancelled:                             handleOrderCancelled()
Order-Shipped → Order-Placed:                                handleRevertToPlaced()
* → Return-Completed:                                        handleReturnCompleted()
```

#### On Bulk Update Delivery History

```typescript
// Similar transition handling per-item:
receivedQty > 0:                     handleOrderCompleted()
Order-Shipped (from non-shipped):    handleOrderShipped()
Order-Placed (from Shipped):         handleRevertToPlaced()
Order-Cancelled (from Shipped):      handleOrderCancelled()
Return-Completed:                    handleReturnCompleted()
```

### 11.2 Stock Management Integration

When an order completes (`Order-Completed`):
- Ready product `quantityInMainUnit` decreases (product leaves production house)
- Outlet stock increases (separate stock management system)
- These operations share the same database transaction for atomicity

### 11.3 Product & Unit Conversion

- All ready product quantities are stored in the product's **main unit**
- The `unitConversionTable` provides conversion factors between units
- Conversion formula: `mainQty = qty * (mainConv.conversionFactor / sourceConv.conversionFactor)`

---

## 12. Configuration System

### Config Keys

| Key | Default | Description |
|---|---|---|
| `auto_create_on_ship` | `"true"` | When `true`, automatically adds stock if insufficient during shipping. When `false`, shipping fails if stock is insufficient. |
| `force_manual_entry` | `"false"` | When `true` AND `auto_create_on_ship` is `false`, provides a more specific error message instructing the user to enter stock manually before shipping. |

### Managing Config

**Get all configs:** `GET /api/v1/ready-products/config`

**Update configs:**
```json
PUT /api/v1/ready-products/config
[
  { "key": "auto_create_on_ship", "value": "false" }
]
```

Config updates are audited with `updatedBy` tracking who made the change.

---

## 13. Utility Scripts

### reset-ready-products.ts

**File:** `src/test-scripts/reset-ready-products.ts`
**Run:** `npx tsx src/test-scripts/reset-ready-products.ts`

**Purpose:** Emergency reset utility to rebuild ready product state from delivery history.

**Process:**
1. Hard-deletes ALL rows from `ready_product_allocation`
2. Hard-deletes ALL rows from `ready_product`
3. For each product with `Order-Shipped` deliveries:
   - Creates a new `ready_product` row with:
     - `quantityInMainUnit` = sum of all sent quantities
     - `probableRemainingQuantity` = 0 (all shipped quantities are in transit)
   - Creates `ship` allocation records for each delivery

**When to Use:**
- Data corruption recovery
- After major system changes
- When sync cannot fix the inconsistencies
- Development/testing environment reset

**Warning:** This is a destructive operation. All existing ready product data and allocation history will be permanently lost. Use with caution in production.

---

## 14. Data Integrity Rules

### Invariants (must always hold)

| # | Invariant | Enforced By |
|---|---|---|
| INV-1 | `quantityInMainUnit >= 0` | Service validation + database clamping |
| INV-2 | `probableRemainingQuantity >= 0` | Service validation + error on negative |
| INV-3 | `probableRemainingQuantity <= quantityInMainUnit` | Service validation on every write |
| INV-4 | Single active row per product | Application logic with `FOR UPDATE` lock |
| INV-5 | Stable state: `qty == probable` when no pending shipments | Delivery lifecycle ensures this |
| INV-6 | All quantities in main unit | Conversion at entry/allocation time |
| INV-7 | Scale precision: 3 decimal places | NUMERIC type with scale=3 |

### Transaction Safety

- All multi-step operations are wrapped in database transactions
- Row-level locks (`FOR UPDATE`) prevent concurrent modifications
- If any step fails, the entire transaction rolls back

### Error Handling

| Error Code | Condition | Message Pattern |
|---|---|---|
| `400` | Invalid quantity | "quantityInMainUnit must be a positive number" |
| `400` | Invalid probable | "probableRemainingQuantity must be a non-negative number" |
| `400` | Probable > quantity | "probableRemainingQuantity cannot be greater than quantityInMainUnit" |
| `400` | Row not found | "Ready product row with ID '{id}' not found" |
| `400` | Product mismatch | "Row ID '{id}' does not contain product '{name}'" |
| `400` | Insufficient stock | "Insufficient ready product stock for {name}. Available: {qty}, Requested: {sent}" |
| `400` | Manual entry required | "...Manual entry required before shipping." |
| `404` | Ready product not found | "Ready product not found" |
| `404` | Ready product row missing | "Ready product row not found: {id}" |
| `500` | Negative quantity | "Ready product quantity would go negative...This indicates a data inconsistency." |
| `500` | Negative probable | "Ready product probable quantity would go negative...This indicates a data inconsistency." |

### Audit Trail

Every allocation event records:
- **Before state:** `quantityBefore` and `probableBefore` (snapshot before change)
- **Change details:** `allocatedQuantityInMainUnit`, `allocationType`, `sentQuantityInMainUnit`
- **Auto-creation info:** `wasAutoCreated`, `autoAddedQuantity`
- **References:** `deliveryHistoryId`, `readyProductId`
- **Timestamps:** `createdAt`, `updatedAt`

This allows full reconstruction of ready product state at any point in time by replaying allocation records chronologically.
