import pg from 'pg'
import { parse as parsePgConn } from 'pg-connection-string'
import 'dotenv/config'

/**
 * Expand Render's bare internal host `dpg-xxxxx-a` to a public DNS name.
 * We avoid `new URL()` here: passwords may contain `#`, which starts a URL fragment
 * and produces bogus hostnames like `base` (ENOTFOUND).
 */
function expandBareRenderPostgresHost(connectionString: string): string {
  const region = process.env.RENDER_DATABASE_REGION?.toLowerCase().trim()
  if (!region) return connectionString
  return connectionString.replace(
    /@(dpg-[a-z0-9]+-a)(?=[/:?]|$)/gi,
    `@$1.${region}-postgres.render.com`,
  )
}

const rawUrl = process.env.DATABASE_EXTERNAL_URL ?? process.env.DATABASE_URL
const url = rawUrl ? expandBareRenderPostgresHost(rawUrl) : null
if (!url) {
  console.error('Missing DATABASE_URL (or DATABASE_EXTERNAL_URL)')
  process.exit(1)
}

function sslOption(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  try {
    const { host } = parsePgConn(connectionString)
    if (host === 'localhost' || host === '127.0.0.1' || host === 'db') {
      return false
    }
  } catch {
    /* fall through */
  }
  return { rejectUnauthorized: false }
}

export const pool = new pg.Pool({
  connectionString: url,
  ssl: sslOption(url),
})
