import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { v2 as cloudinary } from 'cloudinary'
import {
  hasPermission,
  hashPassword,
  signAdminToken,
  verifyAdminToken,
  verifyPassword,
  type AdminRole,
  type AdminSession,
} from './adminAuth.js'
import { pool } from './db.js'
import {
  getPesapalTransactionStatus,
  pesapalConfigured,
  submitPesapalOrder,
} from './pesapal.js'
import {
  getProductById,
  orderToJson,
  productToJson,
  type OrderRow,
  type ProductRow,
} from './types.js'

const MAX_QTY = 20
const FULFILLMENT_TYPES = ['pickup', 'delivery', 'delivery_pending'] as const
const PAYMENT_METHODS = ['pesapal', 'cash_on_delivery'] as const
const ORDER_STATUSES = ['pending', 'processing', 'delivered', 'confirmed', 'cancelled'] as const
const DELIVERY_STATUSES = ['unassigned', 'assigned', 'out_for_delivery', 'delivered', 'not_delivered'] as const
const VERIFICATION_STATUSES = ['pending_verification', 'verified_delivered', 'verified_failed'] as const

type OrderStatus = (typeof ORDER_STATUSES)[number]

type AdminProductRow = ProductRow & {
  active: boolean
  updated_at: Date
  deleted_at: Date | null
}

type AdminOrderRow = OrderRow & {
  package_title: string
}

type AdminUserRow = {
  id: string
  email: string
  full_name: string
  password_hash: string
  role: AdminRole
  active: boolean
  created_at: Date
  updated_at: Date
}

function adminProductToJson(p: AdminProductRow) {
  return {
    ...productToJson(p),
    active: p.active,
    updatedAtISO: p.updated_at.toISOString(),
    deletedAtISO: p.deleted_at ? p.deleted_at.toISOString() : null,
  }
}

function isProbablyPhoneUG(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}

function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v)
}

function isDeliveryStatus(v: string): v is (typeof DELIVERY_STATUSES)[number] {
  return (DELIVERY_STATUSES as readonly string[]).includes(v)
}

function isVerificationStatus(v: string): v is (typeof VERIFICATION_STATUSES)[number] {
  return (VERIFICATION_STATUSES as readonly string[]).includes(v)
}

function isFulfillmentType(v: string): v is (typeof FULFILLMENT_TYPES)[number] {
  return (FULFILLMENT_TYPES as readonly string[]).includes(v)
}

function isPaymentMethod(v: string): v is (typeof PAYMENT_METHODS)[number] {
  return (PAYMENT_METHODS as readonly string[]).includes(v)
}

function deliveryFeeUgx(): number {
  const n = Number(process.env.DELIVERY_FEE_UGX ?? '5000')
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5000
}

function computeDeliveryFee(fulfillment: (typeof FULFILLMENT_TYPES)[number]): number {
  if (fulfillment === 'delivery') return deliveryFeeUgx()
  return 0
}

function splitCustomerName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Customer', lastName: '-' }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '-' }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}

function maybeUuid(v: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
    ? v
    : null
}

async function applyPesapalPaymentToOrder(orderId: string, orderTrackingId: string): Promise<void> {
  const st = await getPesapalTransactionStatus(orderTrackingId)
  if (st.merchantReference && st.merchantReference !== orderId) {
    throw new Error('Pesapal merchant reference does not match order')
  }
  const paymentStatus = st.statusCode === 1 ? 'paid' : st.statusCode === 2 ? 'failed' : 'pending'
  await pool.query(
    `UPDATE orders SET payment_status = $1 WHERE id = $2::uuid AND pesapal_order_tracking_id = $3`,
    [paymentStatus, orderId, orderTrackingId],
  )
}

function headerValue(v: string | string[] | undefined): string {
  if (!v) return ''
  return Array.isArray(v) ? (v[0] ?? '') : v
}

function authFromRequest(req: FastifyRequest): AdminSession | null {
  const auth = headerValue(req.headers.authorization)
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) {
    const secret = process.env.ADMIN_JWT_SECRET?.trim()
    if (!secret) return null
    const session = verifyAdminToken(m[1]!, secret)
    if (session) return session
  }

  const adminKey = process.env.ADMIN_API_KEY?.trim()
  const providedKey = headerValue(req.headers['x-admin-key']).trim()
  if (adminKey && providedKey && providedKey === adminKey) {
    return {
      userId: 'legacy-admin-key',
      email: 'legacy-admin@local',
      fullName: 'Legacy Admin Key',
      role: 'owner',
    }
  }
  return null
}

function requirePermission(req: FastifyRequest, reply: FastifyReply, permission: string): AdminSession | null {
  const session = authFromRequest(req)
  if (!session) {
    reply.code(401).send({ error: 'Unauthorized' })
    return null
  }
  if (!hasPermission(session, permission)) {
    reply.code(403).send({ error: 'Forbidden' })
    return null
  }
  return session
}

function requireAnyPermission(
  req: FastifyRequest,
  reply: FastifyReply,
  permissions: string[],
): AdminSession | null {
  const session = authFromRequest(req)
  if (!session) {
    reply.code(401).send({ error: 'Unauthorized' })
    return null
  }
  if (!permissions.some((p) => hasPermission(session, p))) {
    reply.code(403).send({ error: 'Forbidden' })
    return null
  }
  return session
}

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) return null
  return { cloudName, apiKey, apiSecret }
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'],
})

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/checkout-config', async (_req, reply) => {
  reply.send({
    currency: 'UGX',
    deliveryFeeUGX: deliveryFeeUgx(),
  })
})

app.get('/api/products', async (_req, reply) => {
  const { rows } = await pool.query<ProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular
     FROM products WHERE active = true AND deleted_at IS NULL ORDER BY price_ugx ASC`,
  )
  reply.send({ products: rows.map(productToJson) })
})

app.get<{ Params: { id: string } }>('/api/products/:id', async (req, reply) => {
  const client = await pool.connect()
  try {
    const p = await getProductById(client, req.params.id)
    if (!p) return reply.code(404).send({ error: 'Product not found' })
    reply.send({ product: productToJson(p) })
  } finally {
    client.release()
  }
})

type CreateOrderBody = {
  packageId?: string
  quantity?: number
  fulfillmentType?: string
  paymentMethod?: string
  customer?: {
    fullName?: string
    phone?: string
    location?: string
    notes?: string
  }
  transactionRef?: string
}

app.post<{ Body: CreateOrderBody }>('/api/orders', async (req, reply) => {
  const { packageId, quantity, customer, transactionRef, fulfillmentType: ftRaw, paymentMethod: pmRaw } =
    req.body ?? {}
  const fullName = customer?.fullName?.trim()
  const phone = customer?.phone?.trim()
  const location = customer?.location?.trim()
  const notes = customer?.notes?.trim()
  const tx = transactionRef?.trim()

  const fulfillmentType = typeof ftRaw === 'string' ? ftRaw.trim() : ''
  const paymentMethod = typeof pmRaw === 'string' ? pmRaw.trim() : ''

  if (!packageId) return reply.code(400).send({ error: 'packageId is required' })
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    return reply.code(400).send({ error: `quantity must be an integer from 1 to ${MAX_QTY}` })
  }
  if (!fulfillmentType || !isFulfillmentType(fulfillmentType)) {
    return reply.code(400).send({
      error: `fulfillmentType must be one of: ${FULFILLMENT_TYPES.join(', ')}`,
    })
  }
  if (!paymentMethod || !isPaymentMethod(paymentMethod)) {
    return reply.code(400).send({
      error: `paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`,
    })
  }
  if (!fullName) return reply.code(400).send({ error: 'customer.fullName is required' })
  if (!phone || !isProbablyPhoneUG(phone)) {
    return reply.code(400).send({ error: 'customer.phone must be a valid phone number' })
  }
  if (!location) return reply.code(400).send({ error: 'customer.location is required' })

  if (paymentMethod === 'pesapal' && !pesapalConfigured()) {
    return reply.code(503).send({
      error: 'Online payment is not configured. Choose cash on delivery or try again later.',
    })
  }

  const apiPublic = process.env.API_PUBLIC_URL?.trim()
  const customerApp = process.env.CUSTOMER_APP_URL?.trim()
  if (paymentMethod === 'pesapal' && (!apiPublic || !customerApp)) {
    return reply.code(503).send({
      error: 'Payment redirect URLs are not configured (API_PUBLIC_URL / CUSTOMER_APP_URL).',
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const product = await getProductById(client, packageId)
    if (!product) {
      await client.query('ROLLBACK')
      return reply.code(404).send({ error: 'Product not found' })
    }

    const unitPrice = product.price_ugx
    const subtotalUgx = unitPrice * quantity
    const deliveryFee = computeDeliveryFee(fulfillmentType)
    const totalUgx = subtotalUgx + deliveryFee
    const paymentStatus = 'pending'
    const notificationId = process.env.PESAPAL_IPN_NOTIFICATION_ID?.trim()

    const { rows } = await client.query<OrderRow>(
      `INSERT INTO orders (
        product_id, quantity, unit_price_ugx, subtotal_ugx, delivery_fee_ugx, total_ugx,
        fulfillment_type, payment_method, payment_status, pesapal_order_tracking_id,
        customer_full_name, customer_phone, customer_location, customer_notes, transaction_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING
        id, product_id, quantity, unit_price_ugx, subtotal_ugx, delivery_fee_ugx, total_ugx,
        fulfillment_type, payment_method, payment_status, pesapal_order_tracking_id,
        assigned_delivery_user_id, assigned_at, delivery_status, delivery_notes,
        delivery_updated_at, delivery_updated_by,
        verification_status, verified_at, verified_by, verification_notes,
        NULL::text AS assigned_delivery_full_name,
        NULL::text AS assigned_delivery_email,
        customer_full_name, customer_phone, customer_location, customer_notes, transaction_ref,
        status, created_at,
        (SELECT title FROM products WHERE id = product_id) AS package_title`,
      [
        packageId,
        quantity,
        unitPrice,
        subtotalUgx,
        deliveryFee,
        totalUgx,
        fulfillmentType,
        paymentMethod,
        paymentStatus,
        null,
        fullName,
        phone,
        location,
        notes || null,
        tx || null,
      ],
    )
    const orderRow = rows[0]
    if (!orderRow) {
      await client.query('ROLLBACK')
      return reply.code(500).send({ error: 'Order was not created' })
    }

    if (paymentMethod === 'pesapal') {
      const { firstName, lastName } = splitCustomerName(fullName)
      const desc = `Mbuzzi Choma — ${product.title}`.slice(0, 100)
      const callbackUrl = `${apiPublic}/api/payments/pesapal/callback`
      const cancellationUrl = `${customerApp}/#/order/${encodeURIComponent(packageId)}?cancelled=1`

      const { orderTrackingId, redirectUrl } = await submitPesapalOrder({
        merchantReference: orderRow.id,
        amount: totalUgx,
        currency: 'UGX',
        description: desc,
        callbackUrl,
        cancellationUrl,
        notificationId: notificationId!,
        customer: {
          phone,
          firstName,
          lastName,
          line1: location,
        },
      })

      await client.query(`UPDATE orders SET pesapal_order_tracking_id = $1 WHERE id = $2`, [
        orderTrackingId,
        orderRow.id,
      ])
      await client.query('COMMIT')

      const { rows: outRows } = await pool.query<OrderRow>(
        `SELECT
          o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
          o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
          o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
          o.delivery_updated_at, o.delivery_updated_by,
          o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
          du.full_name AS assigned_delivery_full_name,
          du.email AS assigned_delivery_email,
          o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
          o.status, o.created_at,
          p.title AS package_title
         FROM orders o
         JOIN products p ON p.id = o.product_id
         LEFT JOIN admin_users du ON du.id = o.assigned_delivery_user_id
         WHERE o.id = $1`,
        [orderRow.id],
      )
      const final = outRows[0]
      if (!final) {
        return reply.code(500).send({ error: 'Order could not be reloaded' })
      }
      reply.code(201).send({
        order: orderToJson(final),
        pesapal: { redirectUrl },
      })
      return
    }

    await client.query('COMMIT')
    reply.code(201).send({ order: orderToJson(orderRow) })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})

app.get<{ Params: { id: string } }>('/api/orders/:id', async (req, reply) => {
  const { rows } = await pool.query<OrderRow>(
    `SELECT
      o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
      o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
      o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
      o.delivery_updated_at, o.delivery_updated_by,
      o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
      du.full_name AS assigned_delivery_full_name,
      du.email AS assigned_delivery_email,
      o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
      o.status, o.created_at,
      p.title AS package_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN admin_users du ON du.id = o.assigned_delivery_user_id
     WHERE o.id = $1`,
    [req.params.id],
  )
  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Order not found' })
  reply.send({ order: orderToJson(row) })
})

type PesapalCallbackQuery = {
  OrderTrackingId?: string
  OrderMerchantReference?: string
  orderTrackingId?: string
  orderMerchantReference?: string
}

function firstQueryString(v: string | string[] | undefined): string {
  if (v == null) return ''
  return Array.isArray(v) ? (v[0] ?? '') : v
}

app.get<{ Querystring: PesapalCallbackQuery }>('/api/payments/pesapal/callback', async (req, reply) => {
  const q = req.query
  const orderTrackingId = firstQueryString(q.OrderTrackingId ?? q.orderTrackingId)
  const merchantRef = firstQueryString(q.OrderMerchantReference ?? q.orderMerchantReference)
  if (!orderTrackingId || !merchantRef) {
    return reply.code(400).send({ error: 'Missing payment callback parameters' })
  }
  try {
    await applyPesapalPaymentToOrder(merchantRef, orderTrackingId)
  } catch (e) {
    app.log.error(e)
  }
  const customerApp = process.env.CUSTOMER_APP_URL?.trim()
  if (!customerApp) {
    return reply.code(500).send({ error: 'CUSTOMER_APP_URL is not configured' })
  }
  return reply.redirect(`${customerApp}/#/success/${encodeURIComponent(merchantRef)}`, 302)
})

type PesapalIpnBody = {
  OrderTrackingId?: string
  OrderMerchantReference?: string
  orderTrackingId?: string
  orderMerchantReference?: string
}

app.get<{ Querystring: PesapalCallbackQuery }>('/api/payments/pesapal/ipn', async (req, reply) => {
  const q = req.query
  const orderTrackingId = firstQueryString(q.OrderTrackingId ?? q.orderTrackingId)
  const merchantRef = firstQueryString(q.OrderMerchantReference ?? q.orderMerchantReference)
  if (!orderTrackingId || !merchantRef) {
    return reply.code(400).send({ error: 'Missing IPN parameters' })
  }
  try {
    await applyPesapalPaymentToOrder(merchantRef, orderTrackingId)
  } catch (e) {
    app.log.error(e)
    return reply.code(500).send({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      orderMerchantReference: merchantRef,
      status: 500,
    })
  }
  return reply.send({
    orderNotificationType: 'IPNCHANGE',
    orderTrackingId,
    orderMerchantReference: merchantRef,
    status: 200,
  })
})

app.post<{ Body: PesapalIpnBody }>('/api/payments/pesapal/ipn', async (req, reply) => {
  const b = req.body ?? {}
  const orderTrackingId = b.OrderTrackingId ?? b.orderTrackingId
  const merchantRef = b.OrderMerchantReference ?? b.orderMerchantReference
  if (!orderTrackingId || !merchantRef) {
    return reply.code(400).send({ error: 'Missing IPN body' })
  }
  try {
    await applyPesapalPaymentToOrder(merchantRef, orderTrackingId)
  } catch (e) {
    app.log.error(e)
    return reply.code(500).send({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      orderMerchantReference: merchantRef,
      status: 500,
    })
  }
  return reply.send({
    orderNotificationType: 'IPNCHANGE',
    orderTrackingId,
    orderMerchantReference: merchantRef,
    status: 200,
  })
})

type AdminLoginBody = {
  email?: string
  password?: string
}

app.post<{ Body: AdminLoginBody }>('/api/admin/auth/login', async (req, reply) => {
  const email = req.body?.email?.trim().toLowerCase()
  const password = req.body?.password ?? ''
  if (!email || !password) {
    return reply.code(400).send({ error: 'email and password are required' })
  }

  const { rows } = await pool.query<AdminUserRow>(
    `SELECT id, email, full_name, password_hash, role, active, created_at, updated_at
     FROM admin_users WHERE email = $1 LIMIT 1`,
    [email],
  )
  const user = rows[0]
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }

  const secret = process.env.ADMIN_JWT_SECRET?.trim()
  if (!secret) {
    return reply.code(503).send({ error: 'ADMIN_JWT_SECRET is not configured' })
  }

  const token = signAdminToken(
    { userId: user.id, email: user.email, fullName: user.full_name, role: user.role },
    secret,
  )

  reply.send({
    token,
    user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
  })
})

type BootstrapOwnerBody = { email?: string; fullName?: string; password?: string }

app.post<{ Body: BootstrapOwnerBody }>('/api/admin/auth/bootstrap-owner', async (req, reply) => {
  const adminKey = process.env.ADMIN_API_KEY?.trim()
  const providedKey = headerValue(req.headers['x-admin-key']).trim()
  if (!adminKey || providedKey !== adminKey) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const email = req.body?.email?.trim().toLowerCase()
  const fullName = req.body?.fullName?.trim()
  const password = req.body?.password ?? ''
  if (!email || !fullName || password.length < 8) {
    return reply.code(400).send({ error: 'email, fullName and password(min 8 chars) are required' })
  }

  const { rows: countRows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM admin_users')
  if (Number(countRows[0]?.count ?? '0') > 0) {
    return reply.code(409).send({ error: 'Owner bootstrap already completed' })
  }

  const passwordHash = hashPassword(password)
  const { rows } = await pool.query<AdminUserRow>(
    `INSERT INTO admin_users (email, full_name, password_hash, role, active)
     VALUES ($1, $2, $3, 'owner', true)
     RETURNING id, email, full_name, password_hash, role, active, created_at, updated_at`,
    [email, fullName, passwordHash],
  )
  const user = rows[0]
  reply.code(201).send({ user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } })
})

type CreateAdminUserBody = { email?: string; fullName?: string; password?: string; role?: AdminRole }

app.get('/api/admin/users', async (req, reply) => {
  if (!requirePermission(req, reply, 'users:manage')) return
  const { rows } = await pool.query<AdminUserRow>(
    `SELECT id, email, full_name, password_hash, role, active, created_at, updated_at
     FROM admin_users ORDER BY created_at DESC`,
  )
  reply.send({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      active: u.active,
      createdAtISO: u.created_at.toISOString(),
      updatedAtISO: u.updated_at.toISOString(),
    })),
  })
})

app.post<{ Body: CreateAdminUserBody }>('/api/admin/users', async (req, reply) => {
  if (!requirePermission(req, reply, 'users:manage')) return
  const email = req.body?.email?.trim().toLowerCase()
  const fullName = req.body?.fullName?.trim()
  const password = req.body?.password ?? ''
  const role = req.body?.role
  if (!email || !fullName || password.length < 8 || !role) {
    return reply.code(400).send({ error: 'email, fullName, role and password(min 8 chars) are required' })
  }
  if (!['owner', 'ops_manager', 'delivery_person'].includes(role)) {
    return reply.code(400).send({ error: 'Invalid role' })
  }

  const { rows } = await pool.query<AdminUserRow>(
    `INSERT INTO admin_users (email, full_name, password_hash, role, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, email, full_name, password_hash, role, active, created_at, updated_at`,
    [email, fullName, hashPassword(password), role],
  )
  const u = rows[0]
  reply.code(201).send({ user: { id: u.id, email: u.email, fullName: u.full_name, role: u.role, active: u.active } })
})

type UpdateAdminUserBody = { fullName?: string; role?: AdminRole; active?: boolean; password?: string }

app.patch<{ Params: { id: string }; Body: UpdateAdminUserBody }>('/api/admin/users/:id', async (req, reply) => {
  const session = requirePermission(req, reply, 'users:manage')
  if (!session) return
  const { fullName, role, active, password } = req.body ?? {}

  const { rows: currentRows } = await pool.query<AdminUserRow>(
    `SELECT id, email, full_name, password_hash, role, active, created_at, updated_at
     FROM admin_users
     WHERE id = $1::uuid
     LIMIT 1`,
    [req.params.id],
  )
  const current = currentRows[0]
  if (!current) return reply.code(404).send({ error: 'User not found' })

  // Guardrail: avoid locking yourself out accidentally.
  if (session.userId === current.id && active === false) {
    return reply.code(409).send({ error: 'You cannot deactivate your own account' })
  }

  const removesOwnerPrivileges =
    current.role === 'owner' && ((role !== undefined && role !== 'owner') || (active !== undefined && active === false))
  if (removesOwnerPrivileges) {
    const { rows: ownerRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM admin_users
       WHERE role = 'owner' AND active = true AND id <> $1::uuid`,
      [current.id],
    )
    if (Number(ownerRows[0]?.count ?? '0') < 1) {
      return reply
        .code(409)
        .send({ error: 'Cannot remove or deactivate the last active owner account' })
    }
  }

  const sets: string[] = []
  const values: Array<string | boolean> = []
  if (fullName !== undefined) {
    const t = fullName.trim()
    if (!t) return reply.code(400).send({ error: 'fullName cannot be empty' })
    values.push(t)
    sets.push(`full_name = $${values.length}`)
  }
  if (role !== undefined) {
    if (!['owner', 'ops_manager', 'delivery_person'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' })
    }
    values.push(role)
    sets.push(`role = $${values.length}`)
  }
  if (active !== undefined) {
    values.push(active)
    sets.push(`active = $${values.length}`)
  }
  if (password !== undefined) {
    if (password.length < 8) return reply.code(400).send({ error: 'password must be at least 8 characters' })
    values.push(hashPassword(password))
    sets.push(`password_hash = $${values.length}`)
  }
  if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' })

  values.push(req.params.id)
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE admin_users
     SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length}::uuid
     RETURNING id, email, full_name, password_hash, role, active, created_at, updated_at`,
    values,
  )
  const u = rows[0]
  if (!u) return reply.code(404).send({ error: 'User not found' })
  reply.send({ user: { id: u.id, email: u.email, fullName: u.full_name, role: u.role, active: u.active } })
})

app.get('/api/admin/overview', async (req, reply) => {
  if (!requirePermission(req, reply, 'overview:read')) return

  const [{ rows: productsRows }, { rows: ordersTodayRows }, { rows: pendingRows }] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM products WHERE active = true AND deleted_at IS NULL'),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM orders
       WHERE created_at >= date_trunc('day', now())`,
    ),
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM orders WHERE status = 'pending'"),
  ])

  reply.send({
    products: Number(productsRows[0]?.count ?? '0'),
    ordersToday: Number(ordersTodayRows[0]?.count ?? '0'),
    pending: Number(pendingRows[0]?.count ?? '0'),
  })
})

app.get('/api/admin/products', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:read')) return

  const { rows } = await pool.query<AdminProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at
     FROM products
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC`,
  )

  reply.send({
    products: rows.map(adminProductToJson),
  })
})

type CreateProductBody = {
  id?: string
  title?: string
  weightKg?: number
  priceUGX?: number
  photoUrl?: string
  popular?: boolean
  active?: boolean
}

app.post<{ Body: CreateProductBody }>('/api/admin/products', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const id = req.body?.id?.trim()
  const title = req.body?.title?.trim()
  const photoUrl = req.body?.photoUrl?.trim()
  const weightKg = req.body?.weightKg
  const priceUGX = req.body?.priceUGX
  const popular = req.body?.popular ?? false
  const active = req.body?.active ?? true

  if (!id) return reply.code(400).send({ error: 'id is required' })
  if (!/^[a-z0-9-]+$/.test(id)) {
    return reply.code(400).send({ error: 'id must contain only lowercase letters, numbers, and dashes' })
  }
  if (!title) return reply.code(400).send({ error: 'title is required' })
  if (!photoUrl) return reply.code(400).send({ error: 'photoUrl is required' })
  if (typeof weightKg !== 'number' || Number.isNaN(weightKg) || weightKg <= 0) {
    return reply.code(400).send({ error: 'weightKg must be a positive number' })
  }
  if (typeof priceUGX !== 'number' || !Number.isInteger(priceUGX) || priceUGX <= 0) {
    return reply.code(400).send({ error: 'priceUGX must be a positive integer' })
  }

  const { rows } = await pool.query<AdminProductRow>(
    `INSERT INTO products (id, title, weight_kg, price_ugx, photo_url, popular, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at`,
    [id, title, weightKg, priceUGX, photoUrl, popular, active],
  )

  const row = rows[0]
  reply.code(201).send({
    product: adminProductToJson(row),
  })
})

type UpdateProductBody = {
  title?: string
  weightKg?: number
  priceUGX?: number
  photoUrl?: string
  popular?: boolean
  active?: boolean
}

app.patch<{ Params: { id: string }; Body: UpdateProductBody }>('/api/admin/products/:id', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const { title, weightKg, priceUGX, photoUrl, popular, active } = req.body ?? {}
  const sets: string[] = []
  const values: Array<string | number | boolean> = []

  if (title !== undefined) {
    const t = title.trim()
    if (!t) return reply.code(400).send({ error: 'title cannot be empty' })
    values.push(t)
    sets.push(`title = $${values.length}`)
  }

  if (weightKg !== undefined) {
    if (typeof weightKg !== 'number' || Number.isNaN(weightKg) || weightKg <= 0) {
      return reply.code(400).send({ error: 'weightKg must be a positive number' })
    }
    values.push(weightKg)
    sets.push(`weight_kg = $${values.length}`)
  }

  if (priceUGX !== undefined) {
    if (typeof priceUGX !== 'number' || !Number.isInteger(priceUGX) || priceUGX <= 0) {
      return reply.code(400).send({ error: 'priceUGX must be a positive integer' })
    }
    values.push(priceUGX)
    sets.push(`price_ugx = $${values.length}`)
  }

  if (photoUrl !== undefined) {
    const p = photoUrl.trim()
    if (!p) return reply.code(400).send({ error: 'photoUrl cannot be empty' })
    values.push(p)
    sets.push(`photo_url = $${values.length}`)
  }

  if (popular !== undefined) {
    values.push(popular)
    sets.push(`popular = $${values.length}`)
  }

  if (active !== undefined) {
    values.push(active)
    sets.push(`active = $${values.length}`)
  }

  if (sets.length === 0) {
    return reply.code(400).send({ error: 'No fields provided for update' })
  }

  values.push(req.params.id)
  const { rows } = await pool.query<AdminProductRow>(
    `UPDATE products
     SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at`,
    values,
  )

  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Product not found' })

  reply.send({
    product: adminProductToJson(row),
  })
})

type CloudinarySignBody = {
  filename?: string
  folder?: string
}

app.post<{ Body: CloudinarySignBody }>('/api/admin/cloudinary/sign', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const cfg = cloudinaryConfig()
  if (!cfg) {
    return reply.code(400).send({ error: 'Cloudinary credentials are not configured on the API' })
  }

  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
  })

  const folder = req.body?.folder?.trim() || 'mbuzzi-choma'
  const filename = req.body?.filename?.trim() || undefined
  const publicId = filename
    ? filename.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    : undefined
  const timestamp = Math.floor(Date.now() / 1000)
  const paramsToSign: Record<string, string | number | boolean> = {
    folder,
    timestamp,
    overwrite: true,
  }
  if (publicId) paramsToSign.public_id = publicId

  const signature = cloudinary.utils.api_sign_request(paramsToSign, cfg.apiSecret)

  reply.send({
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    folder,
    timestamp,
    signature,
    publicId,
  })
})

app.get('/api/admin/products/trash', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:read')) return

  const { rows } = await pool.query<AdminProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at
     FROM products
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
  )

  reply.send({ products: rows.map(adminProductToJson) })
})

app.delete<{ Params: { id: string } }>('/api/admin/products/:id', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const { rows } = await pool.query<AdminProductRow>(
    `UPDATE products
     SET deleted_at = now(), updated_at = now(), active = false
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at`,
    [req.params.id],
  )
  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Product not found (or already in trash)' })

  reply.send({ product: adminProductToJson(row) })
})

app.post<{ Params: { id: string } }>('/api/admin/products/:id/restore', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const { rows } = await pool.query<AdminProductRow>(
    `UPDATE products
     SET deleted_at = NULL, updated_at = now()
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at`,
    [req.params.id],
  )
  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Product not found in trash' })

  reply.send({ product: adminProductToJson(row) })
})

app.delete<{ Params: { id: string } }>('/api/admin/products/:id/permanent', async (req, reply) => {
  if (!requirePermission(req, reply, 'products:write')) return

  const { rows: refs } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM orders WHERE product_id = $1',
    [req.params.id],
  )
  if (Number(refs[0]?.count ?? '0') > 0) {
    return reply.code(409).send({ error: 'Cannot permanently delete a product that has orders' })
  }

  const { rowCount } = await pool.query(
    'DELETE FROM products WHERE id = $1 AND deleted_at IS NOT NULL',
    [req.params.id],
  )
  if (!rowCount) return reply.code(404).send({ error: 'Product not found in trash' })

  reply.send({ ok: true })
})

type AdminOrdersQuery = {
  status?: string
  limit?: string
}

app.get<{ Querystring: AdminOrdersQuery }>('/api/admin/orders', async (req, reply) => {
  if (!requirePermission(req, reply, 'orders:read')) return

  const status = req.query.status?.trim()
  const limitRaw = req.query.limit?.trim()
  const limit = limitRaw ? Number(limitRaw) : 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return reply.code(400).send({ error: 'limit must be an integer between 1 and 500' })
  }

  const values: Array<string | number> = []
  let where = ''
  if (status) {
    if (!isOrderStatus(status)) {
      return reply.code(400).send({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` })
    }
    values.push(status)
    where = `WHERE o.status = $${values.length}`
  }

  values.push(limit)
  const { rows } = await pool.query<AdminOrderRow>(
    `SELECT
      o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
      o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
      o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
      o.delivery_updated_at, o.delivery_updated_by,
      o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
      du.full_name AS assigned_delivery_full_name,
      du.email AS assigned_delivery_email,
      o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
      o.status, o.created_at,
      p.title AS package_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN admin_users du ON du.id = o.assigned_delivery_user_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  reply.send({ orders: rows.map(orderToJson) })
})

type UpdateOrderStatusBody = {
  status?: string
}

app.patch<{ Params: { id: string }; Body: UpdateOrderStatusBody }>('/api/admin/orders/:id/status', async (req, reply) => {
  const session = requireAnyPermission(req, reply, ['orders:write', 'orders:status:delivery'])
  if (!session) return
  const actorUserId = maybeUuid(session.userId)

  const status = req.body?.status?.trim()
  if (!status || !isOrderStatus(status)) {
    return reply.code(400).send({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` })
  }

  const canFullManage = hasPermission(session, 'orders:write')
  if (!canFullManage) {
    if (status !== 'delivered') {
      return reply.code(403).send({ error: 'Delivery personnel can only set status to delivered' })
    }
    const { rows: existingRows } = await pool.query<{
      status: string
      assigned_delivery_user_id: string | null
      fulfillment_type: string
    }>(
      'SELECT status, assigned_delivery_user_id, fulfillment_type FROM orders WHERE id = $1::uuid LIMIT 1',
      [req.params.id],
    )
    const existing = existingRows[0]
    if (!existing) return reply.code(404).send({ error: 'Order not found' })
    if (existing.status !== 'processing') {
      return reply.code(409).send({ error: 'Only processing orders can be marked delivered' })
    }
    if (existing.fulfillment_type === 'pickup') {
      return reply.code(409).send({ error: 'Pickup orders cannot be marked delivered by delivery personnel' })
    }
    if (existing.assigned_delivery_user_id !== session.userId) {
      return reply.code(403).send({ error: 'You can only deliver orders assigned to you' })
    }
  }

  let rows: AdminOrderRow[]
  try {
    const result = await pool.query<AdminOrderRow>(
      `WITH updated AS (
         UPDATE orders
         SET status = $1,
             delivery_status = CASE WHEN $1 = 'delivered' THEN 'delivered' ELSE delivery_status END,
             delivery_updated_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivery_updated_at END,
             delivery_updated_by = CASE WHEN $1 = 'delivered' THEN $3::uuid ELSE delivery_updated_by END,
             verification_status = CASE WHEN $1 = 'confirmed' THEN 'verified_delivered' ELSE verification_status END,
             verified_at = CASE WHEN $1 = 'confirmed' THEN now() ELSE verified_at END,
             verified_by = CASE WHEN $1 = 'confirmed' THEN $3::uuid ELSE verified_by END
         WHERE id = $2::uuid
         RETURNING
           id, product_id, quantity, unit_price_ugx, subtotal_ugx, delivery_fee_ugx, total_ugx,
           fulfillment_type, payment_method, payment_status, pesapal_order_tracking_id,
           assigned_delivery_user_id, assigned_at, delivery_status, delivery_notes,
           delivery_updated_at, delivery_updated_by,
           verification_status, verified_at, verified_by, verification_notes,
           customer_full_name, customer_phone, customer_location, customer_notes, transaction_ref,
           status, created_at
       )
       SELECT
         u.id, u.product_id, u.quantity, u.unit_price_ugx, u.subtotal_ugx, u.delivery_fee_ugx, u.total_ugx,
         u.fulfillment_type, u.payment_method, u.payment_status, u.pesapal_order_tracking_id,
         u.assigned_delivery_user_id, u.assigned_at, u.delivery_status, u.delivery_notes,
         u.delivery_updated_at, u.delivery_updated_by,
         u.verification_status, u.verified_at, u.verified_by, u.verification_notes,
         du.full_name AS assigned_delivery_full_name,
         du.email AS assigned_delivery_email,
         u.customer_full_name, u.customer_phone, u.customer_location, u.customer_notes, u.transaction_ref,
         u.status, u.created_at,
         p.title AS package_title
       FROM updated u
       JOIN products p ON p.id = u.product_id
       LEFT JOIN admin_users du ON du.id = u.assigned_delivery_user_id`,
      [status, req.params.id, actorUserId],
    )
    rows = result.rows
  } catch (e: unknown) {
    const pg = e as { code?: string; constraint?: string; message?: string }
    if (pg.code === '23514') {
      return reply.code(409).send({
        error:
          "Order status transition failed due to outdated DB constraints. Run latest migrations on the API host.",
      })
    }
    if (pg.code === '42703' || pg.code === '42P01') {
      return reply.code(409).send({
        error:
          "Order workflow columns are missing in the database. Run latest migrations (especially 007 and 008) on the API host.",
      })
    }
    if (pg.code === '22P02') {
      return reply.code(400).send({ error: 'Invalid order id format' })
    }
    throw e
  }

  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Order not found' })
  reply.send({ order: orderToJson(row) })
})

app.get('/api/admin/debug/workflow', async (req, reply) => {
  if (!requirePermission(req, reply, 'users:manage')) return

  const [migrationsRes, constraintRes, columnsRes] = await Promise.all([
    pool.query<{ filename: string; applied_at: Date }>(
      `SELECT filename, applied_at
       FROM schema_migrations
       WHERE filename IN ('006_admin_rbac.sql', '007_delivery_workflow.sql', '008_order_status_workflow.sql')
       ORDER BY filename`,
    ),
    pool.query<{ constraint_name: string; constraint_def: string }>(
      `SELECT con.conname AS constraint_name,
              pg_get_constraintdef(con.oid) AS constraint_def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE rel.relname = 'orders'
         AND nsp.nspname = 'public'
         AND con.contype = 'c'
         AND con.conname = 'orders_status_check'`,
    ),
    pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'orders'
         AND column_name IN (
           'assigned_delivery_user_id',
           'assigned_at',
           'delivery_status',
           'delivery_notes',
           'delivery_updated_at',
           'delivery_updated_by',
           'verification_status',
           'verification_notes',
           'verified_at',
           'verified_by'
         )
       ORDER BY column_name`,
    ),
  ])

  reply.send({
    expectedOrderStatuses: ORDER_STATUSES,
    appliedWorkflowMigrations: migrationsRes.rows.map((r) => ({
      filename: r.filename,
      appliedAtISO: r.applied_at.toISOString(),
    })),
    orderStatusConstraint: constraintRes.rows[0]?.constraint_def ?? null,
    workflowColumnsPresent: columnsRes.rows.map((r) => r.column_name),
  })
})

app.post<{ Params: { id: string } }>('/api/admin/orders/:id/claim', async (req, reply) => {
  const session = requireAnyPermission(req, reply, ['orders:delivery:write', 'orders:write'])
  if (!session) return
  const actorUserId = maybeUuid(session.userId)
  if (!actorUserId) {
    return reply.code(403).send({ error: 'Delivery claim requires a signed-in user account (not shared admin key)' })
  }

  const { rows } = await pool.query<AdminOrderRow>(
    `WITH base AS (
       SELECT id, status, assigned_delivery_user_id
       FROM orders
       WHERE id = $1::uuid
     ),
     updated AS (
       UPDATE orders o
       SET assigned_delivery_user_id = $2::uuid,
           assigned_at = COALESCE(o.assigned_at, now()),
           delivery_status = CASE WHEN o.delivery_status = 'unassigned' THEN 'assigned' ELSE o.delivery_status END,
           delivery_updated_at = now(),
           delivery_updated_by = $2::uuid
       FROM base b
       WHERE o.id = b.id
         AND b.status = 'processing'
         AND (b.assigned_delivery_user_id IS NULL OR b.assigned_delivery_user_id = $2::uuid)
       RETURNING
         o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
         o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
         o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
         o.delivery_updated_at, o.delivery_updated_by,
         o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
         o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
         o.status, o.created_at
     )
     SELECT
       u.id, u.product_id, u.quantity, u.unit_price_ugx, u.subtotal_ugx, u.delivery_fee_ugx, u.total_ugx,
       u.fulfillment_type, u.payment_method, u.payment_status, u.pesapal_order_tracking_id,
       u.assigned_delivery_user_id, u.assigned_at, u.delivery_status, u.delivery_notes,
       u.delivery_updated_at, u.delivery_updated_by,
       u.verification_status, u.verified_at, u.verified_by, u.verification_notes,
       du.full_name AS assigned_delivery_full_name,
       du.email AS assigned_delivery_email,
       u.customer_full_name, u.customer_phone, u.customer_location, u.customer_notes, u.transaction_ref,
       u.status, u.created_at,
       p.title AS package_title
     FROM updated u
     JOIN products p ON p.id = u.product_id
     LEFT JOIN admin_users du ON du.id = u.assigned_delivery_user_id`,
    [req.params.id, actorUserId],
  )
  const row = rows[0]
  if (!row) return reply.code(409).send({ error: 'Order cannot be claimed (must be processing and unassigned or already yours)' })
  reply.send({ order: orderToJson(row) })
})

type UpdateDeliveryStatusBody = {
  status?: string
  notes?: string
}

app.patch<{ Params: { id: string }; Body: UpdateDeliveryStatusBody }>(
  '/api/admin/orders/:id/delivery-status',
  async (req, reply) => {
    const session = requireAnyPermission(req, reply, ['orders:delivery:write', 'orders:write'])
    if (!session) return
    const actorUserId = maybeUuid(session.userId)
    if (!actorUserId) {
      return reply
        .code(403)
        .send({ error: 'Delivery status updates require a signed-in user account (not shared admin key)' })
    }
    const status = req.body?.status?.trim() ?? ''
    const notes = req.body?.notes?.trim() ?? ''
    if (!isDeliveryStatus(status) || status === 'unassigned') {
      return reply.code(400).send({ error: 'Invalid delivery status' })
    }

    const canFullManage = hasPermission(session, 'orders:write')
    if (!canFullManage && !['out_for_delivery', 'delivered', 'not_delivered'].includes(status)) {
      return reply.code(403).send({ error: 'Delivery personnel cannot set this delivery status' })
    }

    const { rows } = await pool.query<AdminOrderRow>(
      `WITH updated AS (
         UPDATE orders o
         SET delivery_status = $1,
             delivery_notes = CASE WHEN $2 = '' THEN o.delivery_notes ELSE $2 END,
             delivery_updated_at = now(),
             delivery_updated_by = $3::uuid
         WHERE o.id = $4::uuid
           AND o.status = 'confirmed'
           AND (
             $5::boolean = true
             OR o.assigned_delivery_user_id = $3::uuid
           )
         RETURNING
           o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
           o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
           o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
           o.delivery_updated_at, o.delivery_updated_by,
           o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
           o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
           o.status, o.created_at
       )
       SELECT
         u.id, u.product_id, u.quantity, u.unit_price_ugx, u.subtotal_ugx, u.delivery_fee_ugx, u.total_ugx,
         u.fulfillment_type, u.payment_method, u.payment_status, u.pesapal_order_tracking_id,
         u.assigned_delivery_user_id, u.assigned_at, u.delivery_status, u.delivery_notes,
         u.delivery_updated_at, u.delivery_updated_by,
         u.verification_status, u.verified_at, u.verified_by, u.verification_notes,
         du.full_name AS assigned_delivery_full_name,
         du.email AS assigned_delivery_email,
         u.customer_full_name, u.customer_phone, u.customer_location, u.customer_notes, u.transaction_ref,
         u.status, u.created_at,
         p.title AS package_title
       FROM updated u
       JOIN products p ON p.id = u.product_id
       LEFT JOIN admin_users du ON du.id = u.assigned_delivery_user_id`,
      [status, notes, actorUserId, req.params.id, canFullManage],
    )
    const row = rows[0]
    if (!row) return reply.code(409).send({ error: 'Unable to update delivery status for this order' })
    reply.send({ order: orderToJson(row) })
  },
)

type VerifyDeliveryBody = {
  outcome?: string
  notes?: string
}

app.patch<{ Params: { id: string }; Body: VerifyDeliveryBody }>(
  '/api/admin/orders/:id/verify-delivery',
  async (req, reply) => {
    const session = requirePermission(req, reply, 'orders:write')
    if (!session) return
    const actorUserId = maybeUuid(session.userId)
    if (!actorUserId) {
      return reply
        .code(403)
        .send({ error: 'Delivery verification requires a signed-in user account (not shared admin key)' })
    }
    const outcome = req.body?.outcome?.trim() ?? ''
    const notes = req.body?.notes?.trim() ?? ''
    if (!isVerificationStatus(outcome) || outcome === 'pending_verification') {
      return reply.code(400).send({ error: 'Invalid verification outcome' })
    }

    const { rows } = await pool.query<AdminOrderRow>(
      `WITH updated AS (
         UPDATE orders o
         SET verification_status = $1,
             verification_notes = CASE WHEN $2 = '' THEN o.verification_notes ELSE $2 END,
             verified_at = now(),
             verified_by = $3::uuid
         WHERE o.id = $4::uuid
           AND o.delivery_status IN ('delivered', 'not_delivered')
         RETURNING
           o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
           o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
           o.assigned_delivery_user_id, o.assigned_at, o.delivery_status, o.delivery_notes,
           o.delivery_updated_at, o.delivery_updated_by,
           o.verification_status, o.verified_at, o.verified_by, o.verification_notes,
           o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
           o.status, o.created_at
       )
       SELECT
         u.id, u.product_id, u.quantity, u.unit_price_ugx, u.subtotal_ugx, u.delivery_fee_ugx, u.total_ugx,
         u.fulfillment_type, u.payment_method, u.payment_status, u.pesapal_order_tracking_id,
         u.assigned_delivery_user_id, u.assigned_at, u.delivery_status, u.delivery_notes,
         u.delivery_updated_at, u.delivery_updated_by,
         u.verification_status, u.verified_at, u.verified_by, u.verification_notes,
         du.full_name AS assigned_delivery_full_name,
         du.email AS assigned_delivery_email,
         u.customer_full_name, u.customer_phone, u.customer_location, u.customer_notes, u.transaction_ref,
         u.status, u.created_at,
         p.title AS package_title
       FROM updated u
       JOIN products p ON p.id = u.product_id
       LEFT JOIN admin_users du ON du.id = u.assigned_delivery_user_id`,
      [outcome, notes, actorUserId, req.params.id],
    )
    const row = rows[0]
    if (!row) return reply.code(409).send({ error: 'Only delivered/not_delivered orders can be verified' })
    reply.send({ order: orderToJson(row) })
  },
)

const port = Number(process.env.PORT) || 3001
await app.listen({ port, host: '0.0.0.0' })
