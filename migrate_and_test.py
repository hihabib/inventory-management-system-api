#!/usr/bin/env python3
"""
Migration script to execute the production house stock migration
and test the APIs.
"""

import psycopg2
import urllib.parse
import json
import urllib.request
import time
import sys

# Database connection from .env
DATABASE_URL = "postgresql://postgres:root@127.0.0.1:5432/atif_19_apr_2026"
API_BASE_URL = "http://localhost:8081"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2MjBmYTQ1LTQyYjEtNGNkMi04OWVmLWNlYzM3OGEzODE5OCIsInVzZXJuYW1lIjoiYXRpZm1hbmFnZXIiLCJlbWFpbCI6ImF0aWZtYW5hZ2VyQGdtYWlsLmNvbSIsInJvbGVJZCI6ImYyY2RlZDM0LWZiMWMtNDM5ZS1iNGMzLTQ5OTk0NTc1NTAyMCIsImlhdCI6MTc3NjU1OTQ0NH0.bpi8ySykon_bW8ug1n1jNbAPOtFAH13QzFc7TD1u_MM"

def parse_db_url(url):
    """Parse DATABASE_URL into components."""
    parsed = urllib.parse.urlparse(url)
    return {
        'host': parsed.hostname or 'localhost',
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password
    }

def execute_migration():
    """Execute the production house stock migration."""
    db_config = parse_db_url(DATABASE_URL)

    print("🔄 Connecting to database...")
    print(f"   Host: {db_config['host']}")
    print(f"   Port: {db_config['port']}")
    print(f"   Database: {db_config['database']}")

    conn = psycopg2.connect(**db_config)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        print("\n📋 Executing migration...")

        # Start transaction
        cursor.execute("BEGIN;")

        # Check if production_house_stock already exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'production_house_stock'
            );
        """)
        table_exists = cursor.fetchone()[0]

        if table_exists:
            print("   ⚠️  production_house_stock table already exists")
            print("   📊 Checking columns...")

            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'production_house_stock'
                ORDER BY column_name;
            """)
            columns = [row[0] for row in cursor.fetchall()]
            print(f"   Existing columns: {columns}")
            print("   ✅ Skipping table creation")
        else:
            # Check if ready_product exists (for rename)
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'ready_product'
                );
            """)
            ready_product_exists = cursor.fetchone()[0]

            if ready_product_exists:
                print("   🔄 Renaming ready_product → production_house_stock")
                cursor.execute('ALTER TABLE "ready_product" RENAME TO "production_house_stock";')

                # Rename columns
                cursor.execute('ALTER TABLE "production_house_stock" RENAME COLUMN "quantity_in_main_unit" TO "total_quantity";')
                cursor.execute('ALTER TABLE "production_house_stock" RENAME COLUMN "probable_remaining_quantity" TO "available_quantity";')

                # Add committed_quantity column
                cursor.execute('ALTER TABLE "production_house_stock" ADD COLUMN "committed_quantity" numeric(10,3) DEFAULT 0 NOT NULL;')
            else:
                print("   ✨ Creating production_house_stock table from scratch")
                cursor.execute("""
                    CREATE TABLE "production_house_stock" (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        product_id uuid NOT NULL REFERENCES "product"("id"),
                        total_quantity numeric(10,3) NOT NULL DEFAULT 0,
                        committed_quantity numeric(10,3) NOT NULL DEFAULT 0,
                        note text,
                        is_deleted boolean NOT NULL DEFAULT false,
                        created_by uuid NOT NULL REFERENCES "users"("id"),
                        updated_by uuid REFERENCES "users"("id"),
                        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                    );
                """)

        # Check and create stock_allocation_audit if needed
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'stock_allocation_audit'
            );
        """)
        audit_exists = cursor.fetchone()[0]

        if not audit_exists:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'ready_product_allocation'
                );
            """)
            ready_allocation_exists = cursor.fetchone()[0]

            if ready_allocation_exists:
                print("   🔄 Renaming ready_product_allocation → stock_allocation_audit")
                cursor.execute('ALTER TABLE "ready_product_allocation" RENAME TO "stock_allocation_audit";')
                cursor.execute('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "allocated_quantity_in_main_unit" TO "allocated_quantity";')
                cursor.execute('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "ready_product_id" TO "stock_id";')
            else:
                print("   ✨ Creating stock_allocation_audit table")
                cursor.execute("""
                    CREATE TABLE "stock_allocation_audit" (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        stock_id uuid NOT NULL REFERENCES "production_house_stock"("id") ON DELETE CASCADE,
                        delivery_history_id uuid REFERENCES "delivery_history"("id") ON DELETE CASCADE,
                        allocated_quantity numeric(10,3) NOT NULL DEFAULT 0,
                        allocation_type text NOT NULL DEFAULT 'ship',
                        was_auto_created boolean NOT NULL DEFAULT false,
                        auto_added_quantity numeric(10,3) DEFAULT 0,
                        total_quantity_before numeric(10,3) NOT NULL DEFAULT 0,
                        sent_quantity numeric(10,3) NOT NULL DEFAULT 0,
                        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                        updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
                        CONSTRAINT "fk_stock_allocation_audit_stock" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE,
                        CONSTRAINT "fk_stock_allocation_audit_delivery" FOREIGN KEY ("delivery_history_id") REFERENCES "delivery_history"("id") ON DELETE CASCADE
                    );
                """)

        # Check and create stock_config table
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'stock_config'
            );
        """)
        config_exists = cursor.fetchone()[0]

        if not config_exists:
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

        # Check and create stock_edit_history table
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'stock_edit_history'
            );
        """)
        edit_history_exists = cursor.fetchone()[0]

        if not edit_history_exists:
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

            # Add foreign keys
            try:
                cursor.execute('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_stock" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE;')
                cursor.execute('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_user" FOREIGN KEY ("edited_by") REFERENCES "users"("id");')
            except psycopg2.errors.UndefinedTable:
                print("   ⚠️  Some referenced tables don't exist yet, skipping FK constraints")

        # Commit transaction
        cursor.execute("COMMIT;")
        print("\n✅ Migration completed successfully!")

        # Verification queries
        print("\n📊 Verifying tables...")
        cursor.execute("SELECT COUNT(*) FROM production_house_stock;")
        prod_count = cursor.fetchone()[0]
        print(f"   production_house_stock: {prod_count} rows")

        cursor.execute("SELECT COUNT(*) FROM stock_allocation_audit;")
        audit_count = cursor.fetchone()[0]
        print(f"   stock_allocation_audit: {audit_count} rows")

        cursor.execute("SELECT COUNT(*) FROM stock_config;")
        config_count = cursor.fetchone()[0]
        print(f"   stock_config: {config_count} rows")

        cursor.execute("SELECT COUNT(*) FROM stock_edit_history;")
        edit_count = cursor.fetchone()[0]
        print(f"   stock_edit_history: {edit_count} rows")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        cursor.execute("ROLLBACK;")
        raise
    finally:
        cursor.close()
        conn.close()

def test_api_1():
    """Test POST to delivery-histories."""
    print("\n🧪 Testing API 1: POST /api/v1/delivery-histories")

    payload = [{
        "unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8",
        "maintainsId": "60d1b6b0-c58f-4a91-a6b8-374480c99b6e",
        "productId": "1b12b930-9fba-4100-a3a2-33d6d0ef3d0c",
        "pricePerQuantity": 280,
        "sentQuantity": 2,
        "receivedQuantity": 0,
        "orderedQuantity": 0,
        "status": "Order-Shipped",
        "orderedUnit": "kg",
        "orderNote": "",
        "neededAt": "2026-04-19T00:00:00+06:00",
        "latestUnitPriceData": [{"unitId": "c3a66d06-a6b9-4942-9d9b-5f4cffb5d1a8", "pricePerQuantity": 280}]
    }]

    req = urllib.request.Request(
        f"{API_BASE_URL}/api/v1/delivery-histories",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {JWT_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.load(response)
            print(f"   ✅ Success! Response: {json.dumps(data, indent=2)[:200]}...")
            return True
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')[:500]}")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_api_2():
    """Test GET to production-house-stock."""
    print("\n🧪 Testing API 2: GET /api/v1/production-house-stock")

    req = urllib.request.Request(
        f"{API_BASE_URL}/api/v1/production-house-stock?page=1&limit=1000",
        headers={
            'Authorization': f'Bearer {JWT_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.load(response)
            print(f"   ✅ Success! Response: {json.dumps(data, indent=2)[:200]}...")
            return True
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')[:500]}")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def wait_for_server():
    """Wait for the server to be ready."""
    print("\n⏳ Waiting for server to be ready...")
    for i in range(30):
        try:
            req = urllib.request.Request(f"{API_BASE_URL}/api/v1/health", method='GET')
            with urllib.request.urlopen(req, timeout=2):
                print("   ✅ Server is ready!")
                return True
        except:
            time.sleep(1)
            print(f"   ⏳ Waiting... ({i+1}/30)")
    print("   ⚠️  Server not ready after 30 seconds")
    return False

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Production House Stock Migration & API Test")
    print("=" * 60)

    try:
        # Step 1: Execute migration
        execute_migration()

        # Step 2: Wait for server and test APIs
        if wait_for_server():
            print("\n" + "=" * 60)
            print("📡 Testing APIs")
            print("=" * 60)

            api1_success = test_api_1()
            api2_success = test_api_2()

            print("\n" + "=" * 60)
            print("📊 Test Results")
            print("=" * 60)
            print(f"   API 1 (POST delivery-histories): {'✅ PASS' if api1_success else '❌ FAIL'}")
            print(f"   API 2 (GET production-house-stock): {'✅ PASS' if api2_success else '❌ FAIL'}")

            if api1_success and api2_success:
                print("\n🎉 All tests passed!")
                sys.exit(0)
            else:
                print("\n⚠️  Some tests failed")
                sys.exit(1)
        else:
            print("\n⚠️  Could not connect to server")
            print("   Please start the server and run this script again")
            sys.exit(1)

    except Exception as e:
        print(f"\n💥 Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
