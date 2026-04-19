#!/usr/bin/env node
/**
 * Safe Production Migration Script for Node.js
 * Run with: node migrate-production-safe.js
 */

const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres:x&e-Gg66e-P8P9H@31.97.190.136:5432/atif_agro_v2";

async function getExistingTables(client) {
    const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    `);
    return result.rows.map(row => row.table_name);
}

async function columnExists(client, tableName, columnName) {
    const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_name = $2;
    `, [tableName, columnName]);
    return result.rows.length > 0;
}

async function constraintExists(client, tableName, constraintName) {
    const result = await client.query(`
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = $1
        AND constraint_name = $2;
    `, [tableName, constraintName]);
    return result.rows.length > 0;
}

async function migrateProduction() {
    const client = new Client({
        connectionString: DATABASE_URL
    });

    try {
        console.log('='.repeat(70));
        console.log('🚀 PRODUCTION MIGRATION - Safe & Idempotent');
        console.log('='.repeat(70));

        await client.connect();
        console.log('✅ Connected to database');

        // Check current state
        console.log('\n🔍 Checking current database state...');
        const existingTables = await getExistingTables(client);
        console.log(`   Found ${existingTables.length} tables`);

        const has = {
            production_house_stock: existingTables.includes('production_house_stock'),
            ready_product: existingTables.includes('ready_product'),
            stock_allocation_audit: existingTables.includes('stock_allocation_audit'),
            ready_product_allocation: existingTables.includes('ready_product_allocation'),
            stock_config: existingTables.includes('stock_config'),
            stock_edit_history: existingTables.includes('stock_edit_history')
        };

        console.log('\n📊 Current State:');
        console.log(`   production_house_stock: ${has.production_house_stock ? '✅' : '❌'}`);
        console.log(`   ready_product: ${has.ready_product ? '✅' : '❌'}`);
        console.log(`   stock_allocation_audit: ${has.stock_allocation_audit ? '✅' : '❌'}`);
        console.log(`   ready_product_allocation: ${has.ready_product_allocation ? '✅' : '❌'}`);
        console.log(`   stock_config: ${has.stock_config ? '✅' : '❌'}`);
        console.log(`   stock_edit_history: ${has.stock_edit_history ? '✅' : '❌'}`);

        console.log('\n' + '='.repeat(70));
        console.log('🔧 Applying Migrations');
        console.log('='.repeat(70));

        await client.query('BEGIN;');

        // =====================================================
        // STEP 1: Handle production_house_stock table
        // =====================================================
        console.log('\n📋 STEP 1: Setting up production_house_stock table...');

        if (has.ready_product) {
            console.log('   🔄 Found ready_product - renaming to production_house_stock');
            await client.query('ALTER TABLE "ready_product" RENAME TO "production_house_stock";');

            // Try to rename columns (may fail if already renamed)
            try {
                await client.query('ALTER TABLE "production_house_stock" RENAME COLUMN "quantity_in_main_unit" TO "total_quantity";');
                console.log('   ✅ Renamed quantity_in_main_unit → total_quantity');
            } catch (e) {
                if (e.message.includes('column') || e.message.includes('does not exist')) {
                    console.log('   ⚠️  Column quantity_in_main_unit doesn\'t exist (may already be renamed)');
                } else {
                    throw e;
                }
            }

            try {
                await client.query('ALTER TABLE "production_house_stock" RENAME COLUMN "probable_remaining_quantity" TO "available_quantity";');
                console.log('   ✅ Renamed probable_remaining_quantity → available_quantity');
            } catch (e) {
                if (e.message.includes('column') || e.message.includes('does not exist')) {
                    console.log('   ⚠️  Column probable_remaining_quantity doesn\'t exist');
                } else {
                    throw e;
                }
            }

            has.production_house_stock = true;
        } else if (!has.production_house_stock) {
            console.log('   ✨ Creating production_house_stock table from scratch');
            await client.query(`
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
            `);
            console.log('   ✅ Table created');
            has.production_house_stock = true;
        } else {
            console.log('   ✅ production_house_stock already exists');
        }

        // Add/update columns in production_house_stock
        if (has.production_house_stock) {
            const hasCommittedQuantity = await columnExists(client, 'production_house_stock', 'committed_quantity');
            if (!hasCommittedQuantity) {
                console.log('   ➕ Adding committed_quantity column');
                await client.query('ALTER TABLE "production_house_stock" ADD COLUMN "committed_quantity" numeric(10,3) NOT NULL DEFAULT 0;');
            }

            const hasAvailableQuantity = await columnExists(client, 'production_house_stock', 'available_quantity');
            if (hasAvailableQuantity) {
                console.log('   🗑️  Removing available_quantity column');
                await client.query('ALTER TABLE "production_house_stock" DROP COLUMN IF EXISTS "available_quantity";');
            }
        }

        // =====================================================
        // STEP 2: Handle stock_allocation_audit table
        // =====================================================
        console.log('\n📋 STEP 2: Setting up stock_allocation_audit table...');

        if (has.ready_product_allocation) {
            console.log('   🔄 Found ready_product_allocation - renaming to stock_allocation_audit');
            await client.query('ALTER TABLE "ready_product_allocation" RENAME TO "stock_allocation_audit";');

            // Try to rename columns
            try {
                await client.query('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "allocated_quantity_in_main_unit" TO "allocated_quantity";');
                console.log('   ✅ Renamed allocated_quantity_in_main_unit → allocated_quantity');
            } catch (e) {
                if (e.message.includes('column') || e.message.includes('does not exist')) {
                    console.log('   ⚠️  Column already renamed or doesn\'t exist');
                } else {
                    throw e;
                }
            }

            try {
                await client.query('ALTER TABLE "stock_allocation_audit" RENAME COLUMN "ready_product_id" TO "stock_id";');
                console.log('   ✅ Renamed ready_product_id → stock_id');
            } catch (e) {
                if (e.message.includes('column') || e.message.includes('does not exist')) {
                    console.log('   ⚠️  Column already renamed or doesn\'t exist');
                } else {
                    throw e;
                }
            }

            has.stock_allocation_audit = true;
        } else if (!has.stock_allocation_audit) {
            console.log('   ✨ Creating stock_allocation_audit table from scratch');
            await client.query(`
                CREATE TABLE "stock_allocation_audit" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    delivery_history_id uuid NOT NULL,
                    stock_id uuid NOT NULL,
                    allocated_quantity numeric(10,3) NOT NULL DEFAULT 0,
                    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                );
            `);
            console.log('   ✅ Table created');
            has.stock_allocation_audit = true;
        } else {
            console.log('   ✅ stock_allocation_audit already exists');
        }

        // Add new columns to stock_allocation_audit
        if (has.stock_allocation_audit) {
            const newColumns = {
                allocation_type: 'text NOT NULL DEFAULT \'ship\'',
                was_auto_created: 'boolean NOT NULL DEFAULT false',
                auto_added_quantity: 'numeric(10,3) DEFAULT 0',
                total_quantity_before: 'numeric(10,3) NOT NULL DEFAULT 0',
                sent_quantity: 'numeric(10,3) DEFAULT 0'
            };

            for (const [colName, colDef] of Object.entries(newColumns)) {
                const exists = await columnExists(client, 'stock_allocation_audit', colName);
                if (!exists) {
                    console.log(`   ➕ Adding ${colName} column`);
                    await client.query(`ALTER TABLE "stock_allocation_audit" ADD COLUMN "${colName}" ${colDef};`);
                }
            }

            const hasOldColumn = await columnExists(client, 'stock_allocation_audit', 'created_new_ready_product_row');
            if (hasOldColumn) {
                console.log('   🗑️  Removing created_new_ready_product_row column');
                await client.query('ALTER TABLE "stock_allocation_audit" DROP COLUMN "created_new_ready_product_row";');
            }
        }

        // =====================================================
        // STEP 3: Create stock_config table
        // =====================================================
        console.log('\n📋 STEP 3: Setting up stock_config table...');

        if (!has.stock_config) {
            console.log('   ✨ Creating stock_config table');
            await client.query(`
                CREATE TABLE "stock_config" (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    key text NOT NULL UNIQUE,
                    value text NOT NULL,
                    description text,
                    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
                    updated_at timestamp with time zone NOT NULL DEFAULT NOW()
                );
            `);
            console.log('   ✅ Table created');
        } else {
            console.log('   ✅ stock_config already exists');
        }

        // =====================================================
        // STEP 4: Create stock_edit_history table
        // =====================================================
        console.log('\n📋 STEP 4: Setting up stock_edit_history table...');

        if (!has.stock_edit_history) {
            console.log('   ✨ Creating stock_edit_history table');
            await client.query(`
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
            `);
            console.log('   ✅ Table created');

            // Add foreign keys
            try {
                console.log('   ➕ Adding foreign keys...');
                await client.query('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_stock" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE;');
                await client.query('ALTER TABLE "stock_edit_history" ADD CONSTRAINT "fk_stock_edit_history_user" FOREIGN KEY ("edited_by") REFERENCES "users"("id");');
                console.log('   ✅ Foreign keys added');
            } catch (e) {
                console.log(`   ⚠️  Could not add foreign keys: ${e.message}`);
            }
        } else {
            console.log('   ✅ stock_edit_history already exists');
        }

        // =====================================================
        // STEP 5: Add foreign keys (idempotent)
        // =====================================================
        console.log('\n📋 STEP 5: Setting up foreign keys...');

        // production_house_stock foreign keys
        const hasProductFK = await constraintExists(client, 'production_house_stock', 'production_house_stock_product_id_fkey');
        if (!hasProductFK) {
            console.log('   ➕ Adding FK: production_house_stock.product_id → product.id');
            try {
                await client.query('ALTER TABLE "production_house_stock" ADD CONSTRAINT "production_house_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id");');
            } catch (e) {
                console.log(`   ⚠️  Could not add product FK: ${e.message}`);
            }
        }

        // stock_allocation_audit foreign keys
        const hasStockFK = await constraintExists(client, 'stock_allocation_audit', 'stock_allocation_audit_stock_id_fkey');
        if (!hasStockFK) {
            console.log('   ➕ Adding FK: stock_allocation_audit.stock_id → production_house_stock.id');
            try {
                await client.query('ALTER TABLE "stock_allocation_audit" ADD CONSTRAINT "stock_allocation_audit_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "production_house_stock"("id") ON DELETE CASCADE;');
            } catch (e) {
                console.log(`   ⚠️  Could not add stock_id FK: ${e.message}`);
            }
        }

        const hasDHFk = await constraintExists(client, 'stock_allocation_audit', 'stock_allocation_audit_delivery_history_id_fkey');
        if (!hasDHFk) {
            console.log('   ➕ Adding FK: stock_allocation_audit.delivery_history_id → delivery_history.id');
            try {
                await client.query('ALTER TABLE "stock_allocation_audit" ADD CONSTRAINT "stock_allocation_audit_delivery_history_id_fkey" FOREIGN KEY ("delivery_history_id") REFERENCES "delivery_history"("id");');
            } catch (e) {
                console.log(`   ⚠️  Could not add delivery_history FK: ${e.message}`);
            }
        }

        // =====================================================
        // COMMIT AND VERIFY
        // =====================================================
        console.log('\n' + '='.repeat(70));
        console.log('💾 Committing Changes...');
        console.log('='.repeat(70));

        await client.query('COMMIT;');
        console.log('✅ Migration committed successfully!');

        // Verification
        console.log('\n📊 Verifying final state...');

        const prodResult = await client.query('SELECT COUNT(*) FROM production_house_stock WHERE is_deleted = false;');
        console.log(`   production_house_stock: ${prodResult.rows[0].count} active rows`);

        const auditResult = await client.query('SELECT COUNT(*) FROM stock_allocation_audit;');
        console.log(`   stock_allocation_audit: ${auditResult.rows[0].count} rows`);

        const configResult = await client.query('SELECT COUNT(*) FROM stock_config;');
        console.log(`   stock_config: ${configResult.rows[0].count} rows`);

        const editResult = await client.query('SELECT COUNT(*) FROM stock_edit_history;');
        console.log(`   stock_edit_history: ${editResult.rows[0].count} rows`);

        console.log('\n' + '='.repeat(70));
        console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('🔄 Rolling back all changes...');
        try {
            await client.query('ROLLBACK;');
            console.log('✅ Rolled back');
        } catch (rollbackError) {
            console.error('❌ Rollback failed:', rollbackError.message);
        }
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run the migration
migrateProduction().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
