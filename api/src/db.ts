import pg from 'pg'
import 'dotenv/config'

/**
 * Parse postgres:// URLs without the WHATWG URL parser.
 * `pg` and `pg-connection-string` use `new URL(str, 'postgres://base')`; a `#` in the
 * password is treated as a fragment and yields hostname `base` → ENOTFOUND.
 *
 * Uses libpq-style rules: credentials are everything before the last `@`, then
 * `user:password` split on the first `:` (password may contain `:`).
 */
function parsePostgresUrl(str: string): {
  user?: string
  password?: string
  host: string
  port: number
  database?: string
} {
  const prefix = str.match(/^postgres(?:ql)?:\/\//i)
  if (!prefix) {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://')
  }
  let rest = str.slice(prefix[0].length)

  let user: string | undefined
  let password: string | undefined
  const at = rest.lastIndexOf('@')
  if (at !== -1) {
    const userpass = rest.slice(0, at)
    rest = rest.slice(at + 1)
    const colon = userpass.indexOf(':')
    if (colon === -1) {
      user = safeDecode(userpass)
    } else {
      user = safeDecode(userpass.slice(0, colon))
      password = safeDecode(userpass.slice(colon + 1))
    }
  }

  const q = rest.indexOf('?')
  const main = q >= 0 ? rest.slice(0, q) : rest

  const slash = main.indexOf('/')
  const hostPort = slash >= 0 ? main.slice(0, slash) : main
  const database = slash >= 0 ? safeDecode(main.slice(slash + 1)) : undefined

  const colon = hostPort.lastIndexOf(':')
  const host = colon >= 0 ? hostPort.slice(0, colon) : hostPort
  const port = colon >= 0 ? parseInt(hostPort.slice(colon + 1), 10) : 5432

  if (!host || Number.isNaN(port)) {
    throw new Error('Invalid host or port in DATABASE_URL')
  }

  return { user, password, host, port, database }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function expandBareRenderHost(host: string): string {
  if (host.includes('.') || !/^dpg-[a-z0-9]+-a$/i.test(host)) {
    return host
  }
  const region = process.env.RENDER_DATABASE_REGION?.toLowerCase().trim()
  if (!region) return host
  return `${host}.${region}-postgres.render.com`
}

function sslForHost(host: string): boolean | { rejectUnauthorized: boolean } {
  if (host === 'localhost' || host === '127.0.0.1' || host === 'db') {
    return false
  }
  return { rejectUnauthorized: false }
}

const rawUrl = process.env.DATABASE_EXTERNAL_URL ?? process.env.DATABASE_URL
if (!rawUrl) {
  console.error('Missing DATABASE_URL (or DATABASE_EXTERNAL_URL)')
  process.exit(1)
}

let poolConfig: pg.PoolConfig
try {
  const parsed = parsePostgresUrl(rawUrl)
  const host = expandBareRenderHost(parsed.host)
  poolConfig = {
    user: parsed.user,
    password: parsed.password,
    host,
    port: parsed.port,
    database: parsed.database,
    ssl: sslForHost(host),
  }
} catch (e) {
  console.error('Invalid DATABASE_URL:', e instanceof Error ? e.message : e)
  process.exit(1)
}

export const pool = new pg.Pool(poolConfig)
