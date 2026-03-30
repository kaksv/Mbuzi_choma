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
  totalUGX: number
  customer: CustomerInfo
  transactionRef?: string
  createdAtISO: string
  status?: string
}

