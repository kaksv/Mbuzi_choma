import type { MeatOrder } from '../types/order'

const STORAGE_KEY = 'mbz_orders_v1'

type OrderMap = Record<string, MeatOrder>

export function saveOrder(order: MeatOrder) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const map: OrderMap = raw ? (JSON.parse(raw) as OrderMap) : {}
  map[order.id] = order
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getOrder(orderId: string) {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const map = JSON.parse(raw) as OrderMap
  return map[orderId] ?? null
}

