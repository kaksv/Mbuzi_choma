import 'dotenv/config'

function apiBase(): string {
  const env = (process.env.PESAPAL_ENVIRONMENT ?? 'sandbox').toLowerCase()
  return env === 'production'
    ? 'https://pay.pesapal.com/v3/api'
    : 'https://cybqa.pesapal.com/pesapalv3/api'
}

let tokenCache: { token: string; expiresAtMs: number } | null = null

export function pesapalConfigured(): boolean {
  const k = process.env.PESAPAL_CONSUMER_KEY?.trim()
  const s = process.env.PESAPAL_CONSUMER_SECRET?.trim()
  const ipn = process.env.PESAPAL_IPN_NOTIFICATION_ID?.trim()
  return !!(k && s && ipn)
}

async function requestToken(): Promise<string> {
  const consumer_key = process.env.PESAPAL_CONSUMER_KEY!.trim()
  const consumer_secret = process.env.PESAPAL_CONSUMER_SECRET!.trim()
  const r = await fetch(`${apiBase()}/Auth/RequestToken`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ consumer_key, consumer_secret }),
  })
  const data = (await r.json()) as { token?: string; message?: string; error?: unknown }
  if (!r.ok || !data.token) {
    throw new Error(data.message ?? `Pesapal authentication failed (${r.status})`)
  }
  return data.token
}

export async function getPesapalAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAtMs > Date.now() + 15_000) {
    return tokenCache.token
  }
  const token = await requestToken()
  tokenCache = { token, expiresAtMs: Date.now() + 4.5 * 60 * 1000 }
  return token
}

export type SubmitPesapalOrderInput = {
  merchantReference: string
  amount: number
  currency: string
  description: string
  callbackUrl: string
  cancellationUrl: string
  notificationId: string
  customer: {
    phone: string
    email?: string
    firstName: string
    lastName: string
    line1: string
  }
}

export async function submitPesapalOrder(
  input: SubmitPesapalOrderInput,
): Promise<{ orderTrackingId: string; redirectUrl: string }> {
  const token = await getPesapalAccessToken()
  const desc = input.description.trim().slice(0, 100) || 'Order payment'
  const phone = input.customer.phone.replace(/\D/g, '').slice(0, 20)
  const body: Record<string, unknown> = {
    id: input.merchantReference,
    currency: input.currency,
    amount: input.amount,
    description: desc,
    callback_url: input.callbackUrl,
    cancellation_url: input.cancellationUrl,
    notification_id: input.notificationId,
    billing_address: {
      phone_number: phone,
      email_address: input.customer.email?.trim() || undefined,
      country_code: 'UG',
      first_name: input.customer.firstName.trim().slice(0, 80) || 'Customer',
      middle_name: '',
      last_name: input.customer.lastName.trim().slice(0, 80) || '-',
      line_1: input.customer.line1.trim().slice(0, 120) || 'Uganda',
      line_2: '',
      city: '',
      state: '',
      postal_code: '',
      zip_code: '',
    },
  }
  const r = await fetch(`${apiBase()}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await r.json()) as {
    order_tracking_id?: string
    redirect_url?: string
    message?: string
    error?: unknown
  }
  if (!r.ok || !data.redirect_url || !data.order_tracking_id) {
    throw new Error(data.message ?? `Pesapal could not start payment (${r.status})`)
  }
  return { orderTrackingId: data.order_tracking_id, redirectUrl: data.redirect_url }
}

export async function getPesapalTransactionStatus(orderTrackingId: string): Promise<{
  statusCode: number
  paymentStatusDescription: string
  merchantReference: string
}> {
  const token = await getPesapalAccessToken()
  const url = `${apiBase()}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const data = (await r.json()) as {
    status_code?: number
    payment_status_description?: string
    merchant_reference?: string
    message?: string
  }
  if (!r.ok) {
    throw new Error(data.message ?? `Pesapal transaction status failed (${r.status})`)
  }
  return {
    statusCode: Number(data.status_code ?? -1),
    paymentStatusDescription: String(data.payment_status_description ?? ''),
    merchantReference: String(data.merchant_reference ?? ''),
  }
}
