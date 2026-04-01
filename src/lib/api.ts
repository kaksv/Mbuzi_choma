import type { MeatPackage } from '../types/package'
import type { MeatOrder } from '../types/order'

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function readError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string }
    if (j.error) return j.error
  } catch {
    /* ignore */
  }
  return `Request failed (${r.status})`
}

export async function fetchProducts(): Promise<MeatPackage[]> {
  const r = await fetch(`${base}/api/products`)
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { products: MeatPackage[] }
  return data.products
}

export async function fetchProduct(id: string): Promise<MeatPackage | null> {
  const r = await fetch(`${base}/api/products/${encodeURIComponent(id)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { product: MeatPackage }
  return data.product
}

export type CreateOrderInput = {
  packageId: string
  quantity: number
  fulfillmentType: 'pickup' | 'delivery' | 'delivery_pending'
  paymentMethod: 'pesapal' | 'cash_on_delivery'
  customer: {
    fullName: string
    phone: string
    location: string
    notes?: string
  }
  transactionRef?: string
}

export type CreateOrderResult = {
  order: MeatOrder
  pesapal?: { redirectUrl: string }
}

export async function fetchCheckoutConfig(): Promise<{ currency: string; deliveryFeeUGX: number }> {
  const r = await fetch(`${base}/api/checkout-config`)
  if (!r.ok) throw new Error(await readError(r))
  return (await r.json()) as { currency: string; deliveryFeeUGX: number }
}

export async function createOrder(body: CreateOrderInput): Promise<CreateOrderResult> {
  const r = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as CreateOrderResult
  return { order: data.order, pesapal: data.pesapal }
}

export async function fetchOrder(id: string): Promise<MeatOrder | null> {
  const r = await fetch(`${base}/api/orders/${encodeURIComponent(id)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(await readError(r))
  const data = (await r.json()) as { order: MeatOrder }
  return data.order
}
