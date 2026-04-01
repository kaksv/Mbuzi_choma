import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export type AdminRole = 'owner' | 'ops_manager' | 'delivery_person'

export type AdminSession = {
  userId: string
  email: string
  fullName?: string
  role: AdminRole
}

const PERMISSIONS: Record<AdminRole, Set<string>> = {
  owner: new Set(['*']),
  ops_manager: new Set([
    'overview:read',
    'products:read',
    'products:write',
    'orders:read',
    'orders:write',
  ]),
  delivery_person: new Set(['overview:read', 'orders:read', 'orders:status:delivery']),
}

export function hasPermission(session: AdminSession, permission: string): boolean {
  const perms = PERMISSIONS[session.role]
  return perms.has('*') || perms.has(permission)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${derived}`
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expected] = parts
  const actual = scryptSync(password, salt, 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  if (actual.byteLength != expectedBuf.byteLength) return false
  return timingSafeEqual(actual, expectedBuf)
}

type TokenPayload = {
  sub: string
  email: string
  role: AdminRole
  name?: string
  exp: number
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '')
  return Buffer.from(b64, 'base64')
}

export function signAdminToken(session: AdminSession, secret: string, ttlSeconds = 60 * 60 * 24): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload: TokenPayload = {
    sub: session.userId,
    email: session.email,
    role: session.role,
    name: session.fullName,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const h = b64url(JSON.stringify(header))
  const p = b64url(JSON.stringify(payload))
  const body = `${h}.${p}`
  const sig = createHmac('sha256', secret).update(body).digest()
  return `${body}.${b64url(sig)}`
}

export function verifyAdminToken(token: string, secret: string): AdminSession | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const body = `${h}.${p}`
  const expected = createHmac('sha256', secret).update(body).digest()
  const got = fromB64url(s)
  if (expected.byteLength !== got.byteLength) return null
  if (!timingSafeEqual(expected, got)) return null

  let payload: TokenPayload
  try {
    payload = JSON.parse(fromB64url(p).toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  if (!payload?.sub || !payload?.email || !payload?.role || !payload?.exp) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    fullName: payload.name,
  }
}
