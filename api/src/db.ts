import pg from 'pg'
import 'dotenv/config'

/**
 * Blueprint `connectionString` often uses a bare internal host `dpg-xxxxx-a` with no
 * dots. That name does not resolve over public DNS (ENOTFOUND) from many web runtimes.
 * Render's external hostname is `dpg-xxxxx-a.<region>-postgres.render.com`.
 *
 * Set RENDER_DATABASE_REGION to the same slug as your Postgres region (e.g. frankfurt,
 * oregon). DATABASE_EXTERNAL_URL (full URL from the dashboard) still wins and skips this.
 */
function expandBareRenderPostgresHost(connectionString: string): string {
  try {
    const asHttp = connectionString.replace(/^postgresql:\/\//i, 'http://').replace(/^postgres:\/\//i, 'http://')
    const u = new URL(asHttp)
    const host = u.hostname
    if (host.includes('.') || !/^dpg-[a-z0-9]+-a$/i.test(host)) {
      return connectionString
    }
    const region = process.env.RENDER_DATABASE_REGION?.toLowerCase().trim()
    if (!region) return connectionString
    u.hostname = `${host}.${region}-postgres.render.com`
    return u.href.replace(/^http:\/\//i, 'postgresql://')
  } catch {
    return connectionString
  }
}

const rawUrl = process.env.DATABASE_EXTERNAL_URL ?? process.env.DATABASE_URL
const url = rawUrl ? expandBareRenderPostgresHost(rawUrl) : null
if (!url) {
  console.error('Missing DATABASE_URL (or DATABASE_EXTERNAL_URL)')
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
