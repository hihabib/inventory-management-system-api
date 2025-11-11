require('dotenv').config();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString: databaseUrl });

async function convertUuidPkToIntegerIdentity({ tableName }) {
  console.log(`\n➡️ Converting UUID PK to integer identity for table: ${tableName}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check current data type of id column
    const colRes = await client.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'`,
      [tableName]
    );
    if (colRes.rows.length === 0) {
      throw new Error(`Table ${tableName} or column id not found`);
    }
    const dataType = colRes.rows[0].data_type;
    if (dataType === 'integer') {
      console.log(`✅ Table ${tableName} already uses integer id — skipping`);
      await client.query('ROLLBACK');
      return;
    }
    if (dataType !== 'uuid') {
      throw new Error(`Unexpected id type for ${tableName}: ${dataType}. Expected uuid.`);
    }

    console.log(`📦 Adding temporary integer column id_int and backfilling with row_number()`);
    await client.query(`ALTER TABLE ${tableName} ADD COLUMN id_int integer`);
    await client.query(
      `UPDATE ${tableName} t SET id_int = rn.num FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id::text) AS num FROM ${tableName}
        ) rn WHERE t.id = rn.id`
    );

    console.log(`🔑 Dropping old PK and replacing id column`);
    await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_pkey`);
    await client.query(`ALTER TABLE ${tableName} DROP COLUMN id`);
    await client.query(`ALTER TABLE ${tableName} RENAME COLUMN id_int TO id`);
    await client.query(`ALTER TABLE ${tableName} ADD PRIMARY KEY (id)`);

    console.log(`⚙️ Adding identity to id column`);
    await client.query(`ALTER TABLE ${tableName} ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY`);

    await client.query('COMMIT');
    console.log(`✅ Conversion complete for ${tableName}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Conversion failed for ${tableName}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🚀 Starting ID conversion migration (uuid -> integer identity)');
    await convertUuidPkToIntegerIdentity({ tableName: 'expenses' });
    await convertUuidPkToIntegerIdentity({ tableName: 'cash_sending' });
    console.log('🎉 Migration completed successfully');
  } catch (err) {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { convertUuidPkToIntegerIdentity };