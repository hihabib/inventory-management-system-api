import 'dotenv/config'
import { Pool } from 'pg'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const preview = await client.query(`
      SELECT COUNT(*)::int AS to_update
      FROM cash_sending
      WHERE EXTRACT(HOUR FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
        AND EXTRACT(MINUTE FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
        AND EXTRACT(SECOND FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
    `)
    console.log('Rows to update', preview.rows[0]?.to_update ?? 0)
    const res = await client.query(`
      UPDATE cash_sending
      SET cash_of = (
        (date_trunc('day', cash_of AT TIME ZONE 'Asia/Dhaka') + interval '4 hours')
        AT TIME ZONE 'Asia/Dhaka'
      )
      WHERE EXTRACT(HOUR FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
        AND EXTRACT(MINUTE FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
        AND EXTRACT(SECOND FROM (cash_of AT TIME ZONE 'Asia/Dhaka')) = 0
    `)
    console.log('Rows updated', res.rowCount ?? 0)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Failed', e)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()

