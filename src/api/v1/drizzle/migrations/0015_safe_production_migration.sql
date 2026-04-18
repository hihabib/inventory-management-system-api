-- Safe Production Migration
-- Based on ACTUAL current database state
-- Date: 2026-04-18
--
-- Current state:
-- - ready_product exists (needs rename to production_house_stock)
-- - ready_product_allocation exists (needs rename to stock_allocation_audit)
-- - Column names are old (quantity_in_main_unit, etc)
-- - committed_quantity column missing
-- - stock_edit_history table missing
-- - stock_config table missing

BEGIN;

-- =====================================================
-- STEP 1: Rename ready_product → production_house_stock
-- =====================================================

ALTER TABLE "ready_product" RENAME TO "production_house_stock";

-- Rename columns in production_house_stock
ALTER TABLE "production_house_stock" RENAME COLUMN "quantity_in_main_unit" TO "total_quantity";
ALTER TABLE "production_house_stock" RENAME COLUMN "probable_remaining_quantity" TO "available_quantity";

-- Add committed_quantity column
ALTER TABLE "production_house_stock"
ADD COLUMN "committed_quantity" numeric(10,3) DEFAULT 0 NOT NULL;

-- =====================================================
-- STEP 2: Rename ready_product_allocation → stock_allocation_audit
-- =====================================================

ALTER TABLE "ready_product_allocation" RENAME TO "stock_allocation_audit";

-- Rename columns in stock_allocation_audit
ALTER TABLE "stock_allocation_audit" RENAME COLUMN "allocated_quantity_in_main_unit" TO "allocated_quantity";
ALTER TABLE "stock_allocation_audit" RENAME COLUMN "ready_product_id" TO "stock_id";

-- Add new columns to stock_allocation_audit
ALTER TABLE "stock_allocation_audit"
ADD COLUMN "allocation_type" text NOT NULL DEFAULT 'ship',
ADD COLUMN "was_auto_created" boolean NOT NULL DEFAULT false,
ADD COLUMN "auto_added_quantity" numeric(10,3) DEFAULT 0,
ADD COLUMN "total_quantity_before" numeric(10,3) NOT NULL DEFAULT 0,
ADD COLUMN "sent_quantity" numeric(10,3) DEFAULT 0;

-- =====================================================
-- STEP 3: Create stock_config table
-- =====================================================

CREATE TABLE "stock_config" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "key" text NOT NULL UNIQUE,
    "value" text NOT NULL,
    "description" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

-- =====================================================
-- STEP 4: Create stock_edit_history table
-- =====================================================

CREATE TABLE "stock_edit_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "stock_id" uuid NOT NULL,
    "edited_by" uuid NOT NULL,
    "edited_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    "field_changed" text NOT NULL,
    "old_value" text,
    "new_value" text,
    "old_numeric" numeric(10,3),
    "new_numeric" numeric(10,3),
    "change_reason" text
);

-- Add foreign keys to stock_edit_history
ALTER TABLE "stock_edit_history"
ADD CONSTRAINT "fk_stock_edit_history_stock"
    FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE,
ADD CONSTRAINT "fk_stock_edit_history_user"
    FOREIGN KEY ("edited_by") REFERENCES "users"("id");

-- Create indexes for stock_edit_history
CREATE INDEX "idx_stock_edit_history_stock_id" ON "stock_edit_history"("stock_id");
CREATE INDEX "idx_stock_edit_history_edited_by" ON "stock_edit_history"("edited_by");
CREATE INDEX "idx_stock_edit_history_edited_at" ON "stock_edit_history"("edited_at" DESC);

-- =====================================================
-- STEP 5: Remove available_quantity columns (cleanup)
-- =====================================================

ALTER TABLE "production_house_stock" DROP COLUMN IF EXISTS "available_quantity";

-- =====================================================
-- STEP 6: Drop old column (replaced by was_auto_created)
-- =====================================================

ALTER TABLE "stock_allocation_audit" DROP COLUMN IF EXISTS "created_new_ready_product_row";

-- =====================================================
-- STEP 7: Add comments
-- =====================================================

COMMENT ON TABLE "production_house_stock" IS 'Stock available at production house ready to be sent to outlets';
COMMENT ON TABLE "stock_allocation_audit" IS 'Audit trail for all quantity changes to production house stock';
COMMENT ON TABLE "stock_config" IS 'Configuration for stock system behavior';
COMMENT ON TABLE "stock_edit_history" IS 'Full audit trail for manual edits to production house stock records';
COMMENT ON COLUMN "production_house_stock"."committed_quantity" IS 'Quantity committed to Order-Shipped deliveries that are not yet Order-Completed';

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES - Run these to verify success
-- =====================================================

-- Should show production_house_stock exists
-- SELECT COUNT(*) FROM production_house_stock;

-- Should show old table doesn't exist (will error)
-- SELECT COUNT(*) FROM ready_product;

-- Verify columns
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'production_house_stock'
-- ORDER BY column_name;

-- Verify stock_edit_history exists
-- SELECT COUNT(*) FROM stock_edit_history;
