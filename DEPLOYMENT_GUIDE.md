# Production Deployment Guide

## Problem Summary

Your migration journal was out of sync with your actual migration files, and your database already has some migrations applied. I've created a safe deployment solution.

## What I Fixed

1. ✅ Fixed the migration journal ([`_journal.json`](src/api/v1/drizzle/migrations/meta/_journal.json)):
   - Corrected migration 0005: `lame_spacker_dave` → `numeric_ids_for_expense_cash_sending`
   - Corrected migration 0012: `closed_slayback` → `ready_product_to_production_stock`
   - Added migrations 0013 and 0014

2. ✅ Removed empty template file `0012_closed_slayback.sql`

3. ✅ Created a **safe production migration** ([`0015_safe_production_migration.sql`](src/api/v1/drizzle/migrations/0015_safe_production_migration.sql))

4. ✅ Created a **migration tracking setup script** ([`setup-migration-tracking.js`](setup-migration-tracking.js))

## Deployment Steps

### Step 1: Backup Your Database ⚠️ CRITICAL

```bash
# Export your production database
pg_dump $DATABASE_URL > production_backup_$(date +%Y%m%d_%H%M%S).sql

# Or use pg_dump with custom format (recommended)
pg_dump -Fc -f production_backup.dump $DATABASE_URL
```

### Step 2: Apply Safe Migration to Database

Run the safe migration SQL file directly on your production database:

```bash
# Using psql
psql $DATABASE_URL -f src/api/v1/drizzle/migrations/0015_safe_production_migration.sql

# Or using node
node -e "require('pg').Client().connect().then(c => c.query(require('fs').readFileSync('src/api/v1/drizzle/migrations/0015_safe_production_migration.sql', 'utf8')).then(() => c.end()))"
```

**This migration:**
- ✅ Renames `ready_product` → `production_house_stock` (if not already done)
- ✅ Renames all related columns to new names
- ✅ Adds `committed_quantity` column (if missing)
- ✅ Removes `available_quantity` columns (cleanup)
- ✅ Creates `stock_edit_history` table (if missing)
- ✅ Uses IF EXISTS/IF NOT EXISTS everywhere - **SAFE to run multiple times**
- ✅ Preserves all existing data

### Step 3: Verify Migration Success

Run these queries to verify:

```sql
-- Check that production_house_stock exists and has data
SELECT COUNT(*) FROM production_house_stock;

-- Verify committed_quantity column exists
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'production_house_stock'
  AND column_name = 'committed_quantity';

-- Check stock_edit_history was created
SELECT COUNT(*) FROM stock_edit_history;

-- Verify old table name doesn't exist (should error)
-- SELECT COUNT(*) FROM ready_product;  -- Should fail: table does not exist
```

### Step 4: Setup Migration Tracking

Run the tracking setup script to mark migrations as applied:

```bash
node setup-migration-tracking.js
```

This will:
- Create the `__drizzle_migrations` table if it doesn't exist
- Mark all existing migrations (0000-0015) as applied
- Allow you to use `drizzle:migrate` for future migrations

### Step 5: Deploy Your Application

```bash
# Build the application
npm run build

# Start the application
npm start
```

### Step 6: Smoke Test

Test critical endpoints:
```bash
# Test health endpoint
curl http://localhost:8081/health

# Test API endpoints
curl http://localhost:8081/api/v1/products
```

## Verification Checklist

Before considering deployment complete:

- [ ] Database backup created successfully
- [ ] Safe migration SQL applied without errors
- [ ] `production_house_stock` table exists with data
- [ ] `committed_quantity` column exists
- [ ] `stock_edit_history` table exists
- [ ] Old table names (`ready_product`, `ready_product_allocation`) don't exist
- [ ] Migration tracking setup completed
- [ ] Application starts without errors
- [ ] Critical API endpoints respond correctly

## Rollback Plan (If Needed)

If something goes wrong:

```bash
# Restore from backup
pg_restore -d $DATABASE_URL production_backup.dump

# Or if you used plain SQL backup
psql $DATABASE_URL < production_backup_YYYYMMDD_HHMMSS.sql
```

## Future Migrations

After this setup, you can use standard Drizzle migrations:

```bash
# Generate new migration from schema changes
pnpm run drizzle:generate

# Apply migrations (safe - checks what's already applied)
pnpm run drizzle:migrate
```

## Files Created/Modified

1. [`src/api/v1/drizzle/migrations/meta/_journal.json`](src/api/v1/drizzle/migrations/meta/_journal.json) - Fixed migration journal
2. [`src/api/v1/drizzle/migrations/0015_safe_production_migration.sql`](src/api/v1/drizzle/migrations/0015_safe_production_migration.sql) - Safe production migration
3. [`setup-migration-tracking.js`](setup-migration-tracking.js) - Migration tracking setup script

## Important Notes

⚠️ **The `ready_product` table was NOT removed** - it was renamed to `production_house_stock`
- All your data is preserved
- The table name changed but the data remains
- If you have queries referencing `ready_product`, update them to use `production_house_stock`

⚠️ **Column Changes Summary:**
- `quantity_in_main_unit` → `total_quantity`
- `probable_remaining_quantity` → `available_quantity` (then removed)
- `allocated_quantity_in_main_unit` → `allocated_quantity`
- `sent_quantity_in_main_unit` → `sent_quantity`

⚠️ **New Additions:**
- `committed_quantity` column (tracks pending shipments)
- `stock_edit_history` table (full audit trail)

## Support

If you encounter issues:
1. Check the migration SQL file for detailed comments
2. Review the verification queries
3. Check application logs for schema-related errors
4. Use `npm run drizzle:studio` to visually inspect the database
