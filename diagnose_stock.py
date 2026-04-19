#!/usr/bin/env python3
"""Diagnose stock_id issues in stock_allocation_audit."""

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

def diagnose():
    db_config = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()

    try:
        print("🔍 Diagnosing stock_id issues...\n")

        # Get some sample stock_allocation_audit records with their stock_id
        cursor.execute("""
            SELECT id, stock_id, delivery_history_id, allocation_type
            FROM stock_allocation_audit
            ORDER BY created_at DESC
            LIMIT 5;
        """)
        audit_records = cursor.fetchall()

        print("📋 Recent stock_allocation_audit records:")
        for record in audit_records:
            audit_id, stock_id, dh_id, alloc_type = record
            print(f"   Audit ID: {audit_id}")
            print(f"   Stock ID: {stock_id}")

            # Check if this stock_id exists in production_house_stock
            cursor.execute("SELECT id FROM production_house_stock WHERE id = %s;", (stock_id,))
            stock_exists = cursor.fetchone()

            if stock_exists:
                print(f"   ✅ Stock exists in production_house_stock")
            else:
                print(f"   ❌ Stock NOT FOUND in production_house_stock!")

                # Try to find what this stock_id might be referencing
                cursor.execute("""
                    SELECT id FROM delivery_history WHERE id = %s;
                """, (stock_id,))
                is_dh = cursor.fetchone()
                if is_dh:
                    print(f"   ⚠️  This looks like a delivery_history ID, not a stock_id!")

            print()

        # Check if there are any records with stock_id that doesn't exist
        cursor.execute("""
            SELECT COUNT(*)
            FROM stock_allocation_audit s
            LEFT JOIN production_house_stock p ON s.stock_id = p.id
            WHERE p.id IS NULL;
        """)
        orphaned_count = cursor.fetchone()[0]

        if orphaned_count > 0:
            print(f"\n⚠️  Found {orphaned_count} orphaned records in stock_allocation_audit\n")

            # Get details of orphaned records
            cursor.execute("""
                SELECT s.id, s.stock_id, s.delivery_history_id, s.allocation_type
                FROM stock_allocation_audit s
                LEFT JOIN production_house_stock p ON s.stock_id = p.id
                WHERE p.id IS NULL
                LIMIT 10;
            """)
            orphaned = cursor.fetchall()

            print("🔍 Orphaned records:")
            for record in orphaned:
                print(f"   Audit ID: {record[0]}")
                print(f"   Stock ID (invalid): {record[1]}")
                print(f"   Delivery History ID: {record[2]}")
                print(f"   Allocation Type: {record[3]}")
                print()

            # Check if these stock_ids match delivery_history_ids
            print("🔍 Checking if these stock_ids are actually delivery_history_ids...")
            for record in orphaned:
                cursor.execute("SELECT id FROM delivery_history WHERE id = %s;", (record[1],))
                if cursor.fetchone():
                    print(f"   ⚠️  {record[1]} is a delivery_history_id, not a stock_id!")

            # Fix: Update orphaned records by finding correct stock_id
            print("\n🔧 Attempting to fix orphaned records...")

            # For each delivery_history_id, find the correct stock_id
            cursor.execute("""
                UPDATE stock_allocation_audit s
                SET stock_id = (
                    SELECT p.id
                    FROM production_house_stock p
                    JOIN delivery_history dh ON dh.product_id = p.product_id
                    WHERE dh.id = s.delivery_history_id
                    AND p.is_deleted = false
                    LIMIT 1
                )
                WHERE s.stock_id IN (
                    SELECT s2.stock_id
                    FROM stock_allocation_audit s2
                    LEFT JOIN production_house_stock p ON s2.stock_id = p.id
                    WHERE p.id IS NULL
                )
                AND EXISTS (
                    SELECT 1 FROM production_house_stock p
                    JOIN delivery_history dh ON dh.product_id = p.product_id
                    WHERE dh.id = s.delivery_history_id
                    AND p.is_deleted = false
                );
            """)
            fixed_count = cursor.rowcount
            print(f"   Fixed {fixed_count} orphaned records by matching product_id")

            conn.commit()
        else:
            print("\n✅ No orphaned records found!")

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🔍 Diagnosing stock_id Issues")
    print("=" * 60)
    diagnose()
    print("\n✅ Done!")
