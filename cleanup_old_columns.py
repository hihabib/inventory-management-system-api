#!/usr/bin/env python3
"""Clean up old columns that should have been removed."""

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

def cleanup():
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        print("🔧 Cleaning up old columns...\n")

        # Remove available_quantity from production_house_stock
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'production_house_stock'
            AND column_name = 'available_quantity';
        """)
        if cursor.fetchone():
            print("   🗑️  Dropping available_quantity from production_house_stock")
            cursor.execute("ALTER TABLE production_house_stock DROP COLUMN IF EXISTS available_quantity;")
            print("   ✅ Dropped")

        # Remove created_new_ready_product_row from stock_allocation_audit
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'stock_allocation_audit'
            AND column_name = 'created_new_ready_product_row';
        """)
        if cursor.fetchone():
            print("   🗑️  Dropping created_new_ready_product_row from stock_allocation_audit")
            cursor.execute("ALTER TABLE stock_allocation_audit DROP COLUMN IF EXISTS created_new_ready_product_row;")
            print("   ✅ Dropped")

        conn.commit()
        print("\n✅ Cleanup complete!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🧹 Cleaning Up Old Columns")
    print("=" * 60)
    cleanup()
