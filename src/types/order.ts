export type CustomerInfo = {
  fullName: string
  phone: string
  location: string
  notes?: string
}

export type MeatOrder = {
  id: string
  packageId: string
  packageTitle: string
  unitPriceUGX: number
  quantity: number
  /** Line total before delivery */
  subtotalUGX?: number
  deliveryFeeUGX?: number
  totalUGX: number
  fulfillmentType?: 'pickup' | 'delivery' | 'delivery_pending'
  /** True when delivery is far / fee to be confirmed */
  deliveryFeePending?: boolean
  paymentMethod?: 'pesapal' | 'cash_on_delivery'
  paymentStatus?: 'pending' | 'paid' | 'failed'
  pesapalOrderTrackingId?: string
  customer: CustomerInfo
  transactionRef?: string
  createdAtISO: string
  status?: string
}

