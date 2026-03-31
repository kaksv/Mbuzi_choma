import type { PoolClient } from 'pg'
import { resolveProductPhotoUrl } from './mediaUrl.js'

export type ProductRow = {
  id: string
  title: string
  weight_kg: string
  price_ugx: number
  photo_url: string
  popular: boolean
}

export type OrderRow = {
  id: string
  product_id: string
  quantity: number
  unit_price_ugx: number
  total_ugx: number
  customer_full_name: string
  customer_phone: string
  customer_location: string
  customer_notes: string | null
  transaction_ref: string | null
  status: string
  created_at: Date
  package_title: string
}

export async function getProductById(client: PoolClient, id: string): Promise<ProductRow | null> {
  const { rows } = await client.query<ProductRow>(
    `SELECT id, title, weight_kg::text, price_ugx, photo_url, popular
     FROM products WHERE id = $1 AND active = true AND deleted_at IS NULL`,
    [id],
  )
  return rows[0] ?? null
}

export function productToJson(p: ProductRow) {
  return {
    id: p.id,
    title: p.title,
    weightKg: Number(p.weight_kg),
    priceUGX: p.price_ugx,
    photoUrl: resolveProductPhotoUrl(p.photo_url),
    popular: p.popular,
  }
}

export function orderToJson(o: OrderRow) {
  return {
    id: o.id,
    packageId: o.product_id,
    packageTitle: o.package_title,
    unitPriceUGX: o.unit_price_ugx,
    quantity: o.quantity,
    totalUGX: o.total_ugx,
    customer: {
      fullName: o.customer_full_name,
      phone: o.customer_phone,
      location: o.customer_location,
      notes: o.customer_notes ?? undefined,
    },
    transactionRef: o.transaction_ref ?? undefined,
    createdAtISO: o.created_at.toISOString(),
    status: o.status,
  }
}
