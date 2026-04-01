import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { v2 as cloudinary } from 'cloudinary'
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
const ORDER_STATUSES = ['pending', 'confirmed', 'cancelled'] as const

type OrderStatus = (typeof ORDER_STATUSES)[number]

type AdminProductRow = ProductRow & {
  active: boolean
  updated_at: Date
  deleted_at: Date | null
}

type AdminOrderRow = OrderRow & {
  package_title: string
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

function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const configured = process.env.ADMIN_API_KEY?.trim()
  if (!configured) return true

  const header = req.headers['x-admin-key']
  const provided = (Array.isArray(header) ? header[0] : header)?.trim()
  if (provided === configured) return true

  reply.code(401).send({ error: 'Unauthorized' })
  return false
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
  allowedHeaders: ['Content-Type', 'x-admin-key'],
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
          o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
          o.status, o.created_at,
          p.title AS package_title
         FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = $1`,
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
      o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
      o.status, o.created_at,
      p.title AS package_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
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

app.get('/api/admin/overview', async (req, reply) => {
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

  const { rows } = await pool.query<AdminProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular, active, updated_at, deleted_at
     FROM products
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
  )

  reply.send({ products: rows.map(adminProductToJson) })
})

app.delete<{ Params: { id: string } }>('/api/admin/products/:id', async (req, reply) => {
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
  if (!requireAdmin(req, reply)) return

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
      o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
      o.status, o.created_at,
      p.title AS package_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
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
  if (!requireAdmin(req, reply)) return

  const status = req.body?.status?.trim()
  if (!status || !isOrderStatus(status)) {
    return reply.code(400).send({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` })
  }

  const { rows } = await pool.query<AdminOrderRow>(
    `UPDATE orders o
     SET status = $1
     FROM products p
     WHERE o.id = $2 AND p.id = o.product_id
     RETURNING
       o.id, o.product_id, o.quantity, o.unit_price_ugx, o.subtotal_ugx, o.delivery_fee_ugx, o.total_ugx,
       o.fulfillment_type, o.payment_method, o.payment_status, o.pesapal_order_tracking_id,
       o.customer_full_name, o.customer_phone, o.customer_location, o.customer_notes, o.transaction_ref,
       o.status, o.created_at,
       p.title AS package_title`,
    [status, req.params.id],
  )

  const row = rows[0]
  if (!row) return reply.code(404).send({ error: 'Order not found' })
  reply.send({ order: orderToJson(row) })
})

const port = Number(process.env.PORT) || 3001
await app.listen({ port, host: '0.0.0.0' })
