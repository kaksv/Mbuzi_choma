import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SITE } from '../config'
import { fetchOrder } from '../lib/api'
import { formatUGX } from '../utils/formatUGX'
import type { MeatOrder } from '../types/order'

function buildWhatsappLink(text: string) {
  const raw = SITE.whatsappNumber.replace(/\D/g, '')
  const url = `https://wa.me/${raw}?text=${encodeURIComponent(text)}`
  return url
}

export default function SuccessPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()

  const [order, setOrder] = useState<MeatOrder | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!orderId) {
      setPhase('missing')
      return
    }
    let cancelled = false
    setPhase('loading')
    setLoadError(null)
    fetchOrder(orderId)
      .then((o) => {
        if (cancelled) return
        if (!o) {
          setPhase('missing')
          return
        }
        setOrder(o)
        setPhase('ok')
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load order.')
          setPhase('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  const message =
    order == null
      ? ''
      : [
          `Mbuzzi Choma - Order Confirmation`,
          `Order ID: ${order.id}`,
          `Package: ${order.packageTitle}`,
          `Quantity: ${order.quantity}`,
          order.fulfillmentType ? `Fulfillment: ${order.fulfillmentType}` : undefined,
          order.subtotalUGX != null ? `Subtotal: ${formatUGX(order.subtotalUGX)}` : undefined,
          order.deliveryFeePending
            ? 'Delivery fee: pending confirmation'
            : order.deliveryFeeUGX != null && order.deliveryFeeUGX > 0
              ? `Delivery: ${formatUGX(order.deliveryFeeUGX)}`
              : undefined,
          `Total: ${formatUGX(order.totalUGX)}`,
          order.paymentMethod ? `Payment: ${order.paymentMethod}` : undefined,
          order.paymentStatus ? `Payment status: ${order.paymentStatus}` : undefined,
          `Customer: ${order.customer.fullName}`,
          `Phone: ${order.customer.phone}`,
          `Location: ${order.customer.location}`,
          order.transactionRef ? `Note: ${order.transactionRef}` : undefined,
        ]
          .filter(Boolean)
          .join('\n')

  if (phase === 'loading') {
    return (
      <div className="pt-6 pb-10">
        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-6 text-center text-slate-600 text-sm">
          Loading order…
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="pt-6 pb-10">
        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Couldn’t load order</div>
          <div className="text-sm text-slate-600 mt-1">{loadError}</div>
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

  if (phase === 'missing' || !order) {
    return (
      <div className="pt-6 pb-10">
        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Order not found</div>
          <div className="text-sm text-slate-600 mt-1">
            Check the link or your order ID. If you just placed an order, make sure you’re online.
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
            {order.paymentMethod === 'pesapal' && order.paymentStatus === 'paid'
              ? 'Your payment was received. We’ll follow up on your order shortly.'
              : order.paymentMethod === 'pesapal'
                ? 'If you just paid, status may take a moment to update. You can refresh this page.'
                : 'We’ll contact you to confirm delivery or pickup.'}
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
            {order.subtotalUGX != null ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Subtotal</div>
                <div className="font-bold text-slate-900 text-right">{formatUGX(order.subtotalUGX)}</div>
              </div>
            ) : null}
            {order.deliveryFeePending ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Delivery</div>
                <div className="font-bold text-slate-900 text-right">Pending quote</div>
              </div>
            ) : order.deliveryFeeUGX != null && order.deliveryFeeUGX > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Delivery</div>
                <div className="font-bold text-slate-900 text-right">{formatUGX(order.deliveryFeeUGX)}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Total</div>
              <div className="font-black text-slate-900 text-right">{formatUGX(order.totalUGX)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-orange-50 border border-black/5 p-4">
            <div className="font-black text-slate-900">Payment</div>
            {order.paymentMethod === 'pesapal' ? (
              <div className="text-sm text-slate-700 mt-1">
                Pesapal —{' '}
                <span className="font-bold capitalize">{order.paymentStatus ?? 'pending'}</span>
                {order.paymentStatus === 'paid' ? ' (thank you)' : null}.
              </div>
            ) : (
              <div className="text-sm text-slate-700 mt-1">
                Cash on delivery. Have <span className="font-bold">{formatUGX(order.totalUGX)}</span> ready for the rider
                {order.deliveryFeePending ? ' (delivery fee may change once we confirm your area)' : ''}.
              </div>
            )}
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
