import pg from 'pg'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

export const pool = new pg.Pool({ connectionString: url })
