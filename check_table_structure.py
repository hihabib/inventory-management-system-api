#!/usr/bin/env python3
"""Check actual table structure."""

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

def check_structure():
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()

    try:
        print("🔍 Checking stock_allocation_audit structure...\n")

        # Get actual column names
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'stock_allocation_audit'
            ORDER BY ordinal_position;
        """)
        columns = cursor.fetchall()

        print("📋 Actual columns in stock_allocation_audit:")
        for col in columns:
            print(f"   - {col[0]}: {col[1]} (nullable: {col[2]})")

        print("\n🔍 Checking production_house_stock structure...\n")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'production_house_stock'
            ORDER BY ordinal_position;
        """)
        prod_columns = cursor.fetchall()

        print("📋 Actual columns in production_house_stock:")
        for col in prod_columns:
            print(f"   - {col[0]}: {col[1]} (nullable: {col[2]})")

        # Check for missing columns in stock_allocation_audit
        expected_cols = ['allocation_type', 'was_auto_created', 'auto_added_quantity', 'total_quantity_before', 'sent_quantity']
        actual_cols = [col[0] for col in columns]

        missing = set(expected_cols) - set(actual_cols)
        if missing:
            print(f"\n⚠️  Missing columns: {missing}")
            print("🔧 Adding missing columns...")

            for col_name in missing:
                if col_name == 'allocation_type':
                    cursor.execute("""
                        ALTER TABLE stock_allocation_audit
                        ADD COLUMN allocation_type text NOT NULL DEFAULT 'ship';
                    """)
                    print(f"   ✅ Added allocation_type")
                elif col_name == 'was_auto_created':
                    cursor.execute("""
                        ALTER TABLE stock_allocation_audit
                        ADD COLUMN was_auto_created boolean NOT NULL DEFAULT false;
                    """)
                    print(f"   ✅ Added was_auto_created")
                elif col_name == 'auto_added_quantity':
                    cursor.execute("""
                        ALTER TABLE stock_allocation_audit
                        ADD COLUMN auto_added_quantity numeric(10,3) DEFAULT 0;
                    """)
                    print(f"   ✅ Added auto_added_quantity")
                elif col_name == 'total_quantity_before':
                    cursor.execute("""
                        ALTER TABLE stock_allocation_audit
                        ADD COLUMN total_quantity_before numeric(10,3) NOT NULL DEFAULT 0;
                    """)
                    print(f"   ✅ Added total_quantity_before")
                elif col_name == 'sent_quantity':
                    cursor.execute("""
                        ALTER TABLE stock_allocation_audit
                        ADD COLUMN sent_quantity numeric(10,3) DEFAULT 0;
                    """)
                    print(f"   ✅ Added sent_quantity")

            conn.commit()
            print("\n✅ All missing columns added!")
        else:
            print("\n✅ All expected columns exist")

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🔍 Checking Table Structure")
    print("=" * 60)
    check_structure()
    print("\n✅ Done!")
