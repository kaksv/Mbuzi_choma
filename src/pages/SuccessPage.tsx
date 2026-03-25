import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SITE } from '../config'
import { formatUGX } from '../utils/formatUGX'
import { getOrder } from '../utils/orderStorage'

function buildWhatsappLink(text: string) {
  const raw = SITE.whatsappNumber.replace(/\D/g, '')
  const url = `https://wa.me/${raw}?text=${encodeURIComponent(text)}`
  return url
}

export default function SuccessPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()

  const order = useMemo(() => (orderId ? getOrder(orderId) : null), [orderId])
  const [copied, setCopied] = useState(false)

  const message = useMemo(() => {
    if (!order) return ''
    const lines = [
      `Mbuzzi Choma - Order Confirmation`,
      `Order ID: ${order.id}`,
      `Package: ${order.packageTitle}`,
      `Quantity: ${order.quantity}`,
      `Total: ${formatUGX(order.totalUGX)}`,
      `Customer: ${order.customer.fullName}`,
      `Phone: ${order.customer.phone}`,
      `Location: ${order.customer.location}`,
      order.transactionRef ? `Transaction Ref: ${order.transactionRef}` : undefined,
    ].filter(Boolean) as string[]
    return lines.join('\n')
  }, [order])

  if (!order) {
    return (
      <div className="pt-6 pb-10">
        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Order not found</div>
          <div className="text-sm text-slate-600 mt-1">
            You may have cleared site storage or opened this link in a new browser.
          </div>
          <button
            className="mt-4 w-full bg-black text-white font-bold py-3 rounded-xl"
            onClick={() => navigate('/')}
          >
            Back to menu
          </button>
        </div>
      </div>
    )
  }

  const whatsappLink = buildWhatsappLink(message)

  return (
    <div className="pt-6 pb-10">
      <section className="space-y-4">
        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-5">
          <div className="text-emerald-600 font-black">Confirmed!</div>
          <div className="font-black text-slate-900 text-xl mt-1">We received your order request.</div>
          <div className="text-sm text-slate-600 mt-2">
            Next: pay the UGX amount and share your Transaction ID if needed.
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Order details</div>

          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Order ID</div>
              <div className="font-bold text-slate-900 text-right">{order.id}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Package</div>
              <div className="font-bold text-slate-900 text-right">{order.packageTitle}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Quantity</div>
              <div className="font-bold text-slate-900 text-right">{order.quantity}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Total</div>
              <div className="font-black text-slate-900 text-right">{formatUGX(order.totalUGX)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-orange-50 border border-black/5 p-4">
            <div className="font-black text-slate-900">Payment (UGX)</div>
            <div className="text-sm text-slate-700 mt-1">
              Pay <span className="font-bold">{formatUGX(order.totalUGX)}</span> to{' '}
              <span className="font-bold">{SITE.payment.phoneForPayment}</span>.
            </div>
            <div className="text-sm text-slate-600 mt-1">{SITE.payment.methodLabel}</div>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Send to WhatsApp</div>
          <div className="text-sm text-slate-600 mt-1">
            Tap WhatsApp or copy the message below to share your order details.
          </div>

          <div className="mt-4 flex gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center rounded-xl bg-green-600 text-white font-bold py-3"
            >
              WhatsApp
            </a>
            <button
              type="button"
              className="flex-1 rounded-xl border border-black/10 bg-white text-slate-900 font-bold py-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1600)
                } catch {
                  // Fallback: select via prompt.
                  window.prompt('Copy your order message:', message)
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <button
            type="button"
            className="mt-4 w-full bg-black text-white font-bold py-3 rounded-xl"
            onClick={() => navigate('/')}
          >
            Order another package
          </button>
        </div>
      </section>
    </div>
  )
}

