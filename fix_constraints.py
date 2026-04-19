#!/usr/bin/env python3
"""
Fix missing foreign key constraints and verify table structure.
"""

import psycopg2
import urllib.parse

DATABASE_URL = "postgresql://postgres:root@127.0.0.1:5432/atif_19_apr_2026"

def parse_db_url(url):
    parsed = urllib.parse.urlparse(url)
    return {
        'host': parsed.hostname or 'localhost',
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password
    }

def fix_constraints():
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        print("🔍 Checking current table structure...")

        # Check stock_allocation_audit foreign keys
        cursor.execute("""
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                confrelid::regclass AS foreign_table_name
            FROM pg_constraint
            WHERE conrelid = 'stock_allocation_audit'::regclass
            AND contype = 'f';
        """)
        fk_constraints = cursor.fetchall()
        print(f"\n📋 Current foreign keys on stock_allocation_audit:")
        for fk in fk_constraints:
            print(f"   - {fk[0]}: {fk[1]} -> {fk[2]}")

        # Check if the foreign key to production_house_stock exists
        has_stock_fk = any('stock_id' in fk[0].lower() for fk in fk_constraints)

        if not has_stock_fk:
            print("\n⚠️  Missing foreign key: stock_allocation_audit.stock_id -> production_house_stock.id")
            print("🔧 Adding foreign key constraint...")

            # First, check if there are any orphaned records
            cursor.execute("""
                SELECT COUNT(*)
                FROM stock_allocation_audit s
                LEFT JOIN production_house_stock p ON s.stock_id = p.id
                WHERE p.id IS NULL;
            """)
            orphaned_count = cursor.fetchone()[0]

            if orphaned_count > 0:
                print(f"⚠️  Found {orphaned_count} orphaned records in stock_allocation_audit")
                print("🗑️  Deleting orphaned records...")

                cursor.execute("""
                    DELETE FROM stock_allocation_audit
                    WHERE stock_id NOT IN (SELECT id FROM production_house_stock);
                """)
                print(f"   Deleted {cursor.rowcount} orphaned records")

            # Add the foreign key
            cursor.execute("""
                ALTER TABLE stock_allocation_audit
                ADD CONSTRAINT fk_stock_allocation_audit_stock
                FOREIGN KEY (stock_id)
                REFERENCES production_house_stock(id)
                ON DELETE CASCADE;
            """)
            print("✅ Foreign key constraint added!")
        else:
            print("\n✅ Foreign key constraint exists")

        # Check production_house_stock foreign keys
        cursor.execute("""
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                confrelid::regclass AS foreign_table_name
            FROM pg_constraint
            WHERE conrelid = 'production_house_stock'::regclass
            AND contype = 'f';
        """)
        prod_fks = cursor.fetchall()
        print(f"\n📋 Current foreign keys on production_house_stock:")
        for fk in prod_fks:
            print(f"   - {fk[0]}: {fk[1]} -> {fk[2]}")

        # Check if product foreign key exists
        has_product_fk = any('product' in fk[0].lower() and fk[2] == 'product' for fk in prod_fks)
        has_user_fk_created = any('created_by' in fk[0].lower() or 'user' in fk[0].lower() for fk in prod_fks)
        has_user_fk_updated = any('updated_by' in fk[0].lower() for fk in prod_fks)

        # Add missing foreign keys for production_house_stock
        if not has_product_fk:
            print("\n⚠️  Missing foreign key: production_house_stock.product_id -> product.id")
            print("🔧 Adding foreign key constraint...")

            # Check for orphaned records
            cursor.execute("""
                SELECT COUNT(*)
                FROM production_house_stock p
                LEFT JOIN product pr ON p.product_id = pr.id
                WHERE pr.id IS NULL AND p.is_deleted = false;
            """)
            orphaned = cursor.fetchone()[0]

            if orphaned > 0:
                print(f"⚠️  Found {orphaned} records with invalid product_id")

            cursor.execute("""
                ALTER TABLE production_house_stock
                ADD CONSTRAINT fk_production_house_stock_product
                FOREIGN KEY (product_id)
                REFERENCES product(id);
            """)
            print("✅ Product foreign key added!")

        if not has_user_fk_created:
            print("\n⚠️  Missing foreign key: production_house_stock.created_by -> users.id")
            print("🔧 Adding foreign key constraint...")

            cursor.execute("""
                ALTER TABLE production_house_stock
                ADD CONSTRAINT fk_production_house_stock_created_by
                FOREIGN KEY (created_by)
                REFERENCES users(id);
            """)
            print("✅ Created_by foreign key added!")

        if not has_user_fk_updated:
            print("\n⚠️  Missing foreign key: production_house_stock.updated_by -> users.id")
            print("🔧 Adding foreign key constraint...")

            cursor.execute("""
                ALTER TABLE production_house_stock
                ADD CONSTRAINT fk_production_house_stock_updated_by
                FOREIGN KEY (updated_by)
                REFERENCES users(id);
            """)
            print("✅ Updated_by foreign key added!")

        conn.commit()
        print("\n✅ All constraints fixed successfully!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

def verify_data():
    """Verify that the data is correct."""
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()

    try:
        print("\n📊 Verifying data integrity...")

        # Check production_house_stock
        cursor.execute("SELECT COUNT(*) FROM production_house_stock WHERE is_deleted = false;")
        prod_count = cursor.fetchone()[0]
        print(f"   production_house_stock: {prod_count} active rows")

        # Check stock_allocation_audit
        cursor.execute("SELECT COUNT(*) FROM stock_allocation_audit;")
        audit_count = cursor.fetchone()[0]
        print(f"   stock_allocation_audit: {audit_count} rows")

        # Check for any null stock_ids
        cursor.execute("SELECT COUNT(*) FROM stock_allocation_audit WHERE stock_id IS NULL;")
        null_stock_ids = cursor.fetchone()[0]
        if null_stock_ids > 0:
            print(f"   ⚠️  Found {null_stock_ids} records with NULL stock_id")
        else:
            print(f"   ✅ No NULL stock_id values")

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🔧 Fixing Foreign Key Constraints")
    print("=" * 60)

    fix_constraints()
    verify_data()

    print("\n✅ Done! Try the API again.")
