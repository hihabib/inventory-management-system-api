/**
 * Setup Migration Tracking Script
 *
 * This script creates/updates the drizzle migration tracking table
 * to mark existing migrations as applied. Run this AFTER running the
 * safe_production_migration.sql file on your database.
 *
 * Usage:
 *   node setup-migration-tracking.js
 */

import { pgTable, serial, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const { Client } = pg;

// Migration tracking table definition
const migrationTable = '__drizzle_migrations';

async function setupMigrationTracking() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('✓ Connected to database');

        // Create migration table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS "${migrationTable}" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL UNIQUE,
                created_at bigint NOT NULL
            );
        `);
        console.log('✓ Migration table created/verified');

        // Get current migrations from the journal
        const { entries } = await import('./src/api/v1/drizzle/migrations/meta/_journal.json', {
            assert: { type: 'json' },
        });

        console.log(`\nFound ${entries.length} migrations in journal`);

        // Mark all migrations as applied
        let appliedCount = 0;
        for (const entry of entries) {
            const hash = entry.tag;
            const createdAt = entry.when;

            try {
                await client.query(
                    `INSERT INTO "${migrationTable}" (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING`,
                    [hash, createdAt]
                );
                appliedCount++;
                console.log(`  ✓ Marked ${hash} as applied`);
            } catch (error) {
                console.error(`  ✗ Failed to mark ${hash}: ${error.message}`);
            }
        }

        // Also mark the new safe migration
        try {
            await client.query(
                `INSERT INTO "${migrationTable}" (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING`,
                ['0015_safe_production_migration', Date.now() * 1000]
            );
            console.log(`  ✓ Marked 0015_safe_production_migration as applied`);
            appliedCount++;
        } catch (error) {
            console.error(`  ✗ Failed to mark 0015_safe_production_migration: ${error.message}`);
        }

        // Verify the setup
        const result = await client.query(`SELECT COUNT(*) as count FROM "${migrationTable}"`);
        console.log(`\n✓ Migration tracking setup complete!`);
        console.log(`  Total migrations tracked: ${result.rows[0].count}`);

        console.log('\n✓ You can now use "pnpm run drizzle:migrate" for future migrations');

    } catch (error) {
        console.error('✗ Error:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

setupMigrationTracking();
