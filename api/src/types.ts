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
  subtotal_ugx: number
  delivery_fee_ugx: number
  total_ugx: number
  fulfillment_type: string
  payment_method: string
  payment_status: string
  pesapal_order_tracking_id: string | null
  assigned_delivery_user_id: string | null
  assigned_at: Date | null
  delivery_status: string
  delivery_notes: string | null
  delivery_updated_at: Date | null
  delivery_updated_by: string | null
  verification_status: string
  verified_at: Date | null
  verified_by: string | null
  verification_notes: string | null
  assigned_delivery_full_name: string | null
  assigned_delivery_email: string | null
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
  const fulfillmentType = o.fulfillment_type as 'pickup' | 'delivery' | 'delivery_pending'
  return {
    id: o.id,
    packageId: o.product_id,
    packageTitle: o.package_title,
    unitPriceUGX: o.unit_price_ugx,
    quantity: o.quantity,
    subtotalUGX: o.subtotal_ugx,
    deliveryFeeUGX: o.delivery_fee_ugx,
    totalUGX: o.total_ugx,
    fulfillmentType,
    deliveryFeePending: fulfillmentType === 'delivery_pending',
    paymentMethod: o.payment_method as 'pesapal' | 'cash_on_delivery',
    paymentStatus: o.payment_status as 'pending' | 'paid' | 'failed',
    pesapalOrderTrackingId: o.pesapal_order_tracking_id ?? undefined,
    assignedDelivery: o.assigned_delivery_user_id
      ? {
          id: o.assigned_delivery_user_id,
          fullName: o.assigned_delivery_full_name ?? 'Delivery Person',
          email: o.assigned_delivery_email ?? '',
        }
      : undefined,
    assignedAtISO: o.assigned_at ? o.assigned_at.toISOString() : undefined,
    deliveryStatus: o.delivery_status as
      | 'unassigned'
      | 'assigned'
      | 'out_for_delivery'
      | 'delivered'
      | 'not_delivered',
    deliveryNotes: o.delivery_notes ?? undefined,
    deliveryUpdatedAtISO: o.delivery_updated_at ? o.delivery_updated_at.toISOString() : undefined,
    verificationStatus: o.verification_status as
      | 'pending_verification'
      | 'verified_delivered'
      | 'verified_failed',
    verificationNotes: o.verification_notes ?? undefined,
    verifiedAtISO: o.verified_at ? o.verified_at.toISOString() : undefined,
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
