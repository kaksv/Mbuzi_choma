import { Suspense, use, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncErrorBoundary } from '../components/AsyncErrorBoundary'
import { SuccessPageSkeleton } from '../components/skeletons'
import { SITE } from '../config'
import { getOrderDetailResource, invalidateOrderDetailResource } from '../lib/asyncResources'
import { formatUGX } from '../utils/formatUGX'
import type { MeatOrder } from '../types/order'

function buildWhatsappLink(text: string) {
  const raw = SITE.whatsappNumber.replace(/\D/g, '')
  const url = `https://wa.me/${raw}?text=${encodeURIComponent(text)}`
  return url
}

function buildOrderMessage(order: MeatOrder) {
  return [
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
}

function SuccessMissing({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="pt-6 pb-10">
      <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
        <div className="font-black text-slate-900">Order not found</div>
        <div className="mt-1 text-sm text-slate-600">
          Check the link or your order ID. If you just placed an order, make sure you’re online.
        </div>
        <button
          className="mt-4 w-full rounded-xl bg-black py-3 font-bold text-white"
          type="button"
          onClick={() => void navigate('/')}
        >
          Back to menu
        </button>
      </div>
    </div>
  )
}

function SuccessContent({ order, navigate }: { order: MeatOrder; navigate: ReturnType<typeof useNavigate> }) {
  const [copied, setCopied] = useState(false)
  const message = buildOrderMessage(order)
  const whatsappLink = buildWhatsappLink(message)

  return (
    <div className="pt-6 pb-10">
      <section className="space-y-4">
        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg">
          <div className="font-black text-emerald-600">Confirmed!</div>
          <div className="mt-1 text-xl font-black text-slate-900">We received your order request.</div>
          <div className="mt-2 text-sm text-slate-600">
            {order.paymentMethod === 'pesapal' && order.paymentStatus === 'paid'
              ? 'Your payment was received. We’ll follow up on your order shortly.'
              : order.paymentMethod === 'pesapal'
                ? 'If you just paid, status may take a moment to update. You can refresh this page.'
                : 'We’ll contact you to confirm delivery or pickup.'}
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="font-black text-slate-900">Order details</div>

          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Order ID</div>
              <div className="text-right font-bold text-slate-900">{order.id}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Package</div>
              <div className="text-right font-bold text-slate-900">{order.packageTitle}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Quantity</div>
              <div className="text-right font-bold text-slate-900">{order.quantity}</div>
            </div>
            {order.subtotalUGX != null ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Subtotal</div>
                <div className="text-right font-bold text-slate-900">{formatUGX(order.subtotalUGX)}</div>
              </div>
            ) : null}
            {order.deliveryFeePending ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Delivery</div>
                <div className="text-right font-bold text-slate-900">Pending quote</div>
              </div>
            ) : order.deliveryFeeUGX != null && order.deliveryFeeUGX > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-500">Delivery</div>
                <div className="text-right font-bold text-slate-900">{formatUGX(order.deliveryFeeUGX)}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-slate-500">Total</div>
              <div className="text-right font-black text-slate-900">{formatUGX(order.totalUGX)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-black/5 bg-orange-50 p-4">
            <div className="font-black text-slate-900">Payment</div>
            {order.paymentMethod === 'pesapal' ? (
              <div className="mt-1 text-sm text-slate-700">
                Pesapal — <span className="font-bold capitalize">{order.paymentStatus ?? 'pending'}</span>
                {order.paymentStatus === 'paid' ? ' (thank you)' : null}.
              </div>
            ) : (
              <div className="mt-1 text-sm text-slate-700">
                Cash on delivery. Have <span className="font-bold">{formatUGX(order.totalUGX)}</span> ready for the rider
                {order.deliveryFeePending ? ' (delivery fee may change once we confirm your area)' : ''}.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="font-black text-slate-900">Send to WhatsApp</div>
          <div className="mt-1 text-sm text-slate-600">
            Tap WhatsApp or copy the message below to share your order details.
          </div>

          <div className="mt-4 flex gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-xl bg-green-600 py-3 text-center font-bold text-white"
            >
              WhatsApp
            </a>
            <button
              type="button"
              className="flex-1 rounded-xl border border-black/10 bg-white py-3 font-bold text-slate-900"
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
            className="mt-4 w-full rounded-xl bg-black py-3 font-bold text-white"
            onClick={() => void navigate('/')}
          >
            Order another package
          </button>
        </div>
      </section>
    </div>
  )
}

function SuccessGate({
  orderId,
  navigate,
}: {
  orderId: string
  navigate: ReturnType<typeof useNavigate>
}) {
  const order = use(getOrderDetailResource(orderId))
  if (!order) return <SuccessMissing navigate={navigate} />
  return <SuccessContent order={order} navigate={navigate} />
}

export default function SuccessPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [loadAttempt, setLoadAttempt] = useState(0)

  if (!orderId) {
    return <SuccessMissing navigate={navigate} />
  }

  return (
    <AsyncErrorBoundary
      key={loadAttempt}
      fallback={({ error }) => (
        <div className="pt-6 pb-10">
          <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
            <div className="font-black text-slate-900">Couldn’t load order</div>
            <div className="mt-1 text-sm text-slate-600">{error.message}</div>
            <button
              className="mt-4 w-full rounded-xl bg-black py-3 font-bold text-white"
              type="button"
              onClick={() => {
                invalidateOrderDetailResource(orderId)
                setLoadAttempt((n) => n + 1)
              }}
            >
              Retry
            </button>
            <button
              className="mt-3 w-full rounded-xl border border-black/10 bg-white py-3 font-bold text-slate-900"
              type="button"
              onClick={() => void navigate('/')}
            >
              Back to menu
            </button>
          </div>
        </div>
      )}
    >
      <Suspense fallback={<SuccessPageSkeleton />}>
        <SuccessGate orderId={orderId} navigate={navigate} />
      </Suspense>
    </AsyncErrorBoundary>
  )
}
