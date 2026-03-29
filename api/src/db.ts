import pg from 'pg'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

function sslOption(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'))
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === 'db') {
      return false
    }
  } catch {
    /* fall through */
  }
  // Render and most cloud Postgres URLs require TLS; CA may not be in default trust store.
  return { rejectUnauthorized: false }
}

export const pool = new pg.Pool({
  connectionString: url,
  ssl: sslOption(url),
})
