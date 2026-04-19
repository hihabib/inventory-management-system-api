#!/usr/bin/env python3
"""
Safe Production Migration Script
Checks current database state and applies migrations accordingly.
This handles multiple scenarios:
1. Tables need to be created from scratch
2. Tables exist with old names (ready_product, ready_product_allocation)
3. Tables already exist with new names (just need column updates)
"""

import psycopg2
import urllib.parse
import sys

# Production database from .env
DATABASE_URL = "postgresql://postgres:x&e-Gg66e-P8P9H@31.97.190.136:5432/atif_agro_v2"

def parse_db_url(url):
    parsed = urllib.parse.urlparse(url)
    return {
        'host': parsed.hostname or 'localhost',
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password
    }

def get_existing_tables(cursor):
    """Get all existing tables."""
    cursor.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """)
    return [row[0] for row in cursor.fetchall()]

def migrate_production():
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        print("=" * 70)
        print("🚀 PRODUCTION MIGRATION - Safe & Idempotent")
        print("=" * 70)
        print(f"📍 Database: {db_config['host']}:{db_config['port']}/{db_config['database']}")

        # Check current state
        print("\n🔍 Checking current database state...")
        existing_tables = get_existing_tables(cursor)

        print(f"   Found {len(existing_tables)} tables")

        # Check for relevant tables
        has_production_house_stock = 'production_house_stock' in existing_tables
        has_ready_product = 'ready_product' in existing_tables
        has_stock_allocation_audit = 'stock_allocation_audit' in existing_tables
        has_ready_product_allocation = 'ready_product_allocation' in existing_tables
        has_stock_config = 'stock_config' in existing_tables
        has_stock_edit_history = 'stock_edit_history' in existing_tables

        print(f"\n📊 Current State:")
        print(f"   production_house_stock: {'✅' if has_production_house_stock else '❌'}")
        print(f"   ready_product: {'✅' if has_ready_product else '❌'}")
        print(f"   stock_allocation_audit: {'✅' if has_stock_allocation_audit else '❌'}")
        print(f"   ready_product_allocation: {'✅' if has_ready_product_allocation else '❌'}")
        print(f"   stock_config: {'✅' if has_stock_config else '❌'}")
        print(f"   stock_edit_history: {'✅' if has_stock_edit_history else '❌'}")

        print("\n" + "=" * 70)
        print("🔧 Applying Migrations")
        print("=" * 70)

        # =====================================================
        # STEP 1: Handle production_house_stock table
        # =====================================================
        print("\n📋 STEP 1: Setting up production_house_stock table...")

        if has_ready_product:
            print("   🔄 Found ready_product - renaming to production_house_stock")
            cursor.execute('ALTER TABLE "ready_product" RENAME TO "production_house_stock";')

            # Rename columns if they exist
            try:
                cursor.execute('ALTER TABLE "production_house_stock" RENAME COLUMN "quantity_in_main_unit" TO "total_quantity";')
                print("   ✅ Renamed quantity_in_main_unit → total_quantity")
            except psycopg2.errors.UndefinedColumn:
                print("   ⚠️  Column quantity_in_main_unit doesn't exist (may already be renamed)")

            try:
                cursor.execute('ALTER TABLE "production_house_stock" RENAME COLUMN "probable_remaining_quantity" TO "available_quantity";')
                print("   ✅ Renamed probable_remaining_quantity → available_quantity")
            except psycopg2.errors.UndefinedColumn:
                print("   ⚠️  Column probable_remaining_quantity doesn't exist")

            has_production_house_stock = True

        elif not has_production_house_stock:
            print("   ✨ Creating production_house_stock table from scratch")
            cursor.execute("""
                CREATE TABLE "production_house_stock" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    product_id uuid NOT NULL,
                    total_quantity numeric(10,3) NOT NULL DEFAULT 0,
                    committed_quantity numeric(10,3) NOT NULL DEFAULT 0,
                    note text,
                    is_deleted boolean NOT NULL DEFAULT false,
                    created_by uuid NOT NULL,
                    updated_by uuid,
                    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                );
            """)
            print("   ✅ Table created")
            has_production_house_stock = True
        else:
            print("   ✅ production_house_stock already exists")

        # Add missing columns to production_house_stock
        if has_production_house_stock:
            # Check for committed_quantity
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'production_house_stock' AND column_name = 'committed_quantity';
            """)
            if not cursor.fetchone():
                print("   ➕ Adding committed_quantity column")
                cursor.execute('ALTER TABLE "production_house_stock" ADD COLUMN "committed_quantity" numeric(10,3) NOT NULL DEFAULT 0;')

            # Remove available_quantity if it exists
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'production_house_stock' AND column_name = 'available_quantity';
            """)
            if cursor.fetchone():
                print("   🗑️  Removing available_quantity column")
                cursor.execute('ALTER TABLE "production_house_stock" DROP COLUMN IF EXISTS "available_quantity";')

        # =====================================================
        # STEP 2: Handle stock_allocation_audit table
        # =====================================================
        print("\n📋 STEP 2: Setting up stock_allocation_audit table...")

        if has_ready_product_allocation:
            print("   🔄 Found ready_product_allocation - renaming to stock_allocation_audit")
            cursor.execute('ALTER TABLE "ready_product_allocation" RENAME TO "stock_allocation_audit";')

            # Rename columns
            try:
                cursor.execute('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "allocated_quantity_in_main_unit" TO "allocated_quantity";')
                print("   ✅ Renamed allocated_quantity_in_main_unit → allocated_quantity")
            except psycopg2.errors.UndefinedColumn:
                print("   ⚠️  Column already renamed or doesn't exist")

            try:
                cursor.execute('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "ready_product_id" TO "stock_id";')
                print("   ✅ Renamed ready_product_id → stock_id")
            except psycopg2.errors.UndefinedColumn:
                print("   ⚠️  Column already renamed or doesn't exist")

            has_stock_allocation_audit = True

        elif not has_stock_allocation_audit:
            print("   ✨ Creating stock_allocation_audit table from scratch")
            cursor.execute("""
                CREATE TABLE "stock_allocation_audit" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    delivery_history_id uuid NOT NULL,
                    stock_id uuid NOT NULL,
                    allocated_quantity numeric(10,3) NOT NULL DEFAULT 0,
                    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                );
            """)
            print("   ✅ Table created")
            has_stock_allocation_audit = True
        else:
            print("   ✅ stock_allocation_audit already exists")

        # Add new columns to stock_allocation_audit
        if has_stock_allocation_audit:
            new_columns = {
                'allocation_type': 'text NOT NULL DEFAULT \'ship\'',
                'was_auto_created': 'boolean NOT NULL DEFAULT false',
                'auto_added_quantity': 'numeric(10,3) DEFAULT 0',
                'total_quantity_before': 'numeric(10,3) NOT NULL DEFAULT 0',
                'sent_quantity': 'numeric(10,3) DEFAULT 0'
            }

            for col_name, col_def in new_columns.items():
                cursor.execute(f"""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'stock_allocation_audit' AND column_name = '{col_name}';
                """)
                if not cursor.fetchone():
                    print(f"   ➕ Adding {col_name} column")
                    cursor.execute(f'ALTER TABLE "stock_allocation_audit" ADD COLUMN "{col_name}" {col_def};')

            # Remove old column if exists
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'stock_allocation_audit' AND column_name = 'created_new_ready_product_row';
            """)
            if cursor.fetchone():
                print("   🗑️  Removing created_new_ready_product_row column")
                cursor.execute('ALTER TABLE "stock_allocation_audit" DROP COLUMN "created_new_ready_product_row";')

        # =====================================================
        # STEP 3: Create stock_config table
        # =====================================================
        print("\n📋 STEP 3: Setting up stock_config table...")

        if not has_stock_config:
            print("   ✨ Creating stock_config table")
            cursor.execute("""
                CREATE TABLE "stock_config" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    key text NOT NULL UNIQUE,
                    value text NOT NULL,
                    description text,
                    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                );
            """)
            print("   ✅ Table created")
        else:
            print("   ✅ stock_config already exists")

        # =====================================================
        # STEP 4: Create stock_edit_history table
        # =====================================================
        print("\n📋 STEP 4: Setting up stock_edit_history table...")

        if not has_stock_edit_history:
            print("   ✨ Creating stock_edit_history table")
            cursor.execute("""
                CREATE TABLE "stock_edit_history" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    stock_id uuid NOT NULL,
                    edited_by uuid NOT NULL,
                    edited_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    field_changed text NOT NULL,
                    old_value text,
                    new_value text,
                    old_numeric numeric(10,3),
                    new_numeric numeric(10,3),
                    change_reason text
                );
            """)
            print("   ✅ Table created")

            # Add foreign keys
            try:
                print("   ➕ Adding foreign keys...")
                cursor.execute('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_stock" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE;')
                cursor.execute('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_user" FOREIGN KEY ("edited_by") REFERENCES "users"("id");')
                print("   ✅ Foreign keys added")
            except Exception as e:
                print(f"   ⚠️  Could not add foreign keys: {e}")
        else:
            print("   ✅ stock_edit_history already exists")

        # =====================================================
        # STEP 5: Add foreign keys (idempotent)
        # =====================================================
        print("\n📋 STEP 5: Setting up foreign keys...")

        # production_house_stock foreign keys
        try:
            cursor.execute("""
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'production_house_stock'
                AND constraint_name = 'production_house_stock_product_id_fkey';
            """)
            if not cursor.fetchone():
                print("   ➕ Adding FK: production_house_stock.product_id → product.id")
                cursor.execute('ALTER TABLE "production_house_stock" ADD CONSTRAINT "production_house_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id");')
        except Exception as e:
            print(f"   ⚠️  Could not add product FK: {e}")

        # stock_allocation_audit foreign keys
        try:
            cursor.execute("""
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'stock_allocation_audit'
                AND constraint_name = 'stock_allocation_audit_stock_id_fkey';
            """)
            if not cursor.fetchone():
                print("   ➕ Adding FK: stock_allocation_audit.stock_id → production_house_stock.id")
                cursor.execute('ALTER TABLE "stock_allocation_audit" ADD CONSTRAINT "stock_allocation_audit_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE;')
        except Exception as e:
            print(f"   ⚠️  Could not add stock_id FK: {e}")

        try:
            cursor.execute("""
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = 'stock_allocation_audit'
                AND constraint_name = 'stock_allocation_audit_delivery_history_id_fkey';
            """)
            if not cursor.fetchone():
                print("   ➕ Adding FK: stock_allocation_audit.delivery_history_id → delivery_history.id")
                cursor.execute('ALTER TABLE "stock_allocation_audit" ADD CONSTRAINT "stock_allocation_audit_delivery_history_id_fkey" FOREIGN KEY ("delivery_history_id") REFERENCES "delivery_history"("id");')
        except Exception as e:
            print(f"   ⚠️  Could not add delivery_history FK: {e}")

        # =====================================================
        # COMMIT AND VERIFY
        # =====================================================
        print("\n" + "=" * 70)
        print("💾 Committing Changes...")
        print("=" * 70)

        conn.commit()
        print("✅ Migration committed successfully!")

        # Verification
        print("\n📊 Verifying final state...")
        cursor.execute("SELECT COUNT(*) FROM production_house_stock WHERE is_deleted = false;")
        prod_count = cursor.fetchone()[0]
        print(f"   production_house_stock: {prod_count} active rows")

        cursor.execute("SELECT COUNT(*) FROM stock_allocation_audit;")
        audit_count = cursor.fetchone()[0]
        print(f"   stock_allocation_audit: {audit_count} rows")

        cursor.execute("SELECT COUNT(*) FROM stock_config;")
        config_count = cursor.fetchone()[0]
        print(f"   stock_config: {config_count} rows")

        cursor.execute("SELECT COUNT(*) FROM stock_edit_history;")
        edit_count = cursor.fetchone()[0]
        print(f"   stock_edit_history: {edit_count} rows")

        print("\n" + "=" * 70)
        print("🎉 MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("🔄 Rolling back all changes...")
        conn.rollback()
        sys.exit(1)

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    try:
        migrate_production()
    except KeyboardInterrupt:
        print("\n\n⚠️  Migration interrupted by user")
        sys.exit(1)
