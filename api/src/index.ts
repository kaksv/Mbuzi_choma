import cors from '@fastify/cors'
import Fastify from 'fastify'
import { pool } from './db.js'
import {
  getProductById,
  orderToJson,
  productToJson,
  type OrderRow,
  type ProductRow,
} from './types.js'

const MAX_QTY = 20

function isProbablyPhoneUG(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
})

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/products', async (_req, reply) => {
  const { rows } = await pool.query<ProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular
     FROM products WHERE active = true ORDER BY price_ugx ASC`,
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
  customer?: {
    fullName?: string
    phone?: string
    location?: string
    notes?: string
  }
  transactionRef?: string
}

app.post<{ Body: CreateOrderBody }>('/api/orders', async (req, reply) => {
  const { packageId, quantity, customer, transactionRef } = req.body ?? {}
  const fullName = customer?.fullName?.trim()
  const phone = customer?.phone?.trim()
  const location = customer?.location?.trim()
  const notes = customer?.notes?.trim()
  const tx = transactionRef?.trim()

  if (!packageId) return reply.code(400).send({ error: 'packageId is required' })
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    return reply.code(400).send({ error: `quantity must be an integer from 1 to ${MAX_QTY}` })
  }
  if (!fullName) return reply.code(400).send({ error: 'customer.fullName is required' })
  if (!phone || !isProbablyPhoneUG(phone)) {
    return reply.code(400).send({ error: 'customer.phone must be a valid phone number' })
  }
  if (!location) return reply.code(400).send({ error: 'customer.location is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const product = await getProductById(client, packageId)
    if (!product) {
      await client.query('ROLLBACK')
      return reply.code(404).send({ error: 'Product not found' })
    }

    const unitPrice = product.price_ugx
    const totalUGX = unitPrice * quantity

    const { rows } = await client.query<OrderRow>(
      `INSERT INTO orders (
        product_id, quantity, unit_price_ugx, total_ugx,
        customer_full_name, customer_phone, customer_location, customer_notes, transaction_ref
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id, product_id, quantity, unit_price_ugx, total_ugx,
        customer_full_name, customer_phone, customer_location, customer_notes, transaction_ref,
        status, created_at,
        (SELECT title FROM products WHERE id = product_id) AS package_title`,
      [
        packageId,
        quantity,
        unitPrice,
        totalUGX,
        fullName,
        phone,
        location,
        notes || null,
        tx || null,
      ],
    )
    await client.query('COMMIT')
    const order = rows[0]
    reply.code(201).send({ order: orderToJson(order) })
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
      o.id, o.product_id, o.quantity, o.unit_price_ugx, o.total_ugx,
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

const port = Number(process.env.PORT) || 3001
await app.listen({ port, host: '0.0.0.0' })
