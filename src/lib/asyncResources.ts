import {
  fetchCheckoutConfig,
  fetchOrder,
  fetchProduct,
  fetchProducts,
} from './api'
import type { MeatOrder } from '../types/order'
import type { MeatPackage } from '../types/package'

const cache = new Map<string, Promise<unknown>>()

function getOrCreate<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>
  const p = factory()
  cache.set(key, p)
  return p
}

export function getProductsListResource(): Promise<MeatPackage[]> {
  return getOrCreate('products:list', () => fetchProducts())
}

export function invalidateProductsListResource() {
  cache.delete('products:list')
}

export type OrderPageBootstrap = {
  pkg: MeatPackage | null
  checkoutConfig: { deliveryFeeUGX: number }
}

export function getOrderPageBootstrapResource(packageId: string): Promise<OrderPageBootstrap> {
  return getOrCreate(`orderPage:${packageId}`, async () => {
    const [pkg, cfg] = await Promise.all([
      fetchProduct(packageId),
      fetchCheckoutConfig().catch(() => ({ currency: 'UGX' as const, deliveryFeeUGX: 5000 })),
    ])
    return {
      pkg,
      checkoutConfig: { deliveryFeeUGX: cfg.deliveryFeeUGX },
    }
  })
}

export function invalidateOrderPageResource(packageId: string) {
  cache.delete(`orderPage:${packageId}`)
}

export function getOrderDetailResource(orderId: string): Promise<MeatOrder | null> {
  return getOrCreate(`order:${orderId}`, () => fetchOrder(orderId))
}

export function invalidateOrderDetailResource(orderId: string) {
  cache.delete(`order:${orderId}`)
}
