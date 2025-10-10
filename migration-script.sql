-- Migration Script for Stock Batch System Implementation
-- This script safely migrates existing data to the new batch system
-- Execute this script AFTER running the drizzle migration

-- Step 1: Create stock_batch table (if not already created by drizzle)
CREATE TABLE IF NOT EXISTS "stock_batch" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "product_id" uuid NOT NULL,
    "maintains_id" uuid NOT NULL,
    "batch_number" varchar NOT NULL,
    "production_date" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "stock_batch_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action,
    CONSTRAINT "stock_batch_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action
);

-- Step 2: Create unit_conversion table (if not already created by drizzle)
CREATE TABLE IF NOT EXISTS "unit_conversion" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "product_id" uuid NOT NULL,
    "unit_id" uuid NOT NULL,
    "conversion_factor" numeric NOT NULL DEFAULT 1,
    CONSTRAINT "unit_conversion_product_id_unit_id_pk" UNIQUE("product_id","unit_id"),
    CONSTRAINT "unit_conversion_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "unit_conversion_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action
);

-- Step 3: Add stock_batch_id column to stock table (if not already added by drizzle)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock' AND column_name = 'stock_batch_id'
    ) THEN
        ALTER TABLE "stock" ADD COLUMN "stock_batch_id" uuid;
        ALTER TABLE "stock" ADD CONSTRAINT "stock_stock_batch_id_stock_batch_id_fk" 
            FOREIGN KEY ("stock_batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END $$;

-- Step 4: Create default unit conversions for existing product-unit combinations
-- This ensures all existing product-unit relationships have a conversion factor of 1
INSERT INTO "unit_conversion" ("product_id", "unit_id", "conversion_factor", "created_at", "updated_at")
SELECT DISTINCT 
    uip."product_id",
    uip."unit_id",
    1.0 as conversion_factor,
    now() as created_at,
    now() as updated_at
FROM "unit_in_product" uip
WHERE NOT EXISTS (
    SELECT 1 FROM "unit_conversion" uc 
    WHERE uc."product_id" = uip."product_id" 
    AND uc."unit_id" = uip."unit_id"
)
ON CONFLICT ("product_id", "unit_id") DO NOTHING;

-- Step 5: Create default batches for existing stock entries
-- Group existing stock by product_id and maintains_id to create batches
INSERT INTO "stock_batch" ("product_id", "maintains_id", "batch_number", "production_date", "created_at", "updated_at")
SELECT DISTINCT 
    s."product_id",
    s."maintains_id",
    CONCAT('LEGACY-', s."product_id", '-', s."maintains_id") as batch_number,
    COALESCE(MIN(s."created_at"), now()) as production_date,
    now() as created_at,
    now() as updated_at
FROM "stock" s
WHERE s."stock_batch_id" IS NULL
GROUP BY s."product_id", s."maintains_id"
ON CONFLICT DO NOTHING;

-- Step 6: Link existing stock entries to their corresponding batches
UPDATE "stock" 
SET "stock_batch_id" = sb."id"
FROM "stock_batch" sb
WHERE "stock"."product_id" = sb."product_id" 
    AND "stock"."maintains_id" = sb."maintains_id"
    AND "stock"."stock_batch_id" IS NULL
    AND sb."batch_number" LIKE 'LEGACY-%';

-- Step 7: Verify data integrity
-- Check that all stock entries now have a batch_id
DO $$
DECLARE
    orphaned_stock_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_stock_count
    FROM "stock" 
    WHERE "stock_batch_id" IS NULL;
    
    IF orphaned_stock_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % stock entries without batch_id found', orphaned_stock_count;
    END IF;
    
    RAISE NOTICE 'Migration completed successfully. All stock entries have been linked to batches.';
END $$;

-- Step 8: Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_stock_batch_product_maintains" ON "stock_batch" ("product_id", "maintains_id");
CREATE INDEX IF NOT EXISTS "idx_stock_batch_id" ON "stock" ("stock_batch_id");
CREATE INDEX IF NOT EXISTS "idx_unit_conversion_product_unit" ON "unit_conversion" ("product_id", "unit_id");

-- Step 9: Update statistics for query optimization
ANALYZE "stock_batch";
ANALYZE "unit_conversion";
ANALYZE "stock";


-- Migration Summary:
-- 1. Created stock_batch and unit_conversion tables
-- 2. Added stock_batch_id column to stock table
-- 3. Created default unit conversions (factor = 1) for all existing product-unit combinations
-- 4. Created legacy batches for existing stock grouped by product and maintains
-- 5. Linked all existing stock entries to their corresponding batches
-- 6. Added performance indexes
-- 7. Verified data integrity

COMMIT;