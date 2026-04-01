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

/** Readable display like +256 700 000 000 when possible */
function formatWhatsAppForDisplay(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('256')) {
    const n = d.slice(3)
    if (n.length === 9) return `+256 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  }
  return raw.trim() || 'our WhatsApp'
}

function WhatsAppGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
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
  const chatDisplay = formatWhatsAppForDisplay(SITE.whatsappNumber)

  async function shareMessage() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${SITE.name} — order ${order.id.slice(0, 8)}…`,
          text: message,
        })
      } catch {
        /* user cancelled or share failed */
      }
    }
  }

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

        <div className="overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 via-white to-white shadow-lg shadow-emerald-900/5 ring-1 ring-emerald-100/80">
          <div className="flex items-start gap-3 border-b border-emerald-100/90 bg-emerald-600/95 px-4 py-4 text-white">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <WhatsAppGlyph className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-tight">Finish on WhatsApp</h2>
              <p className="mt-1 text-xs font-medium leading-snug text-emerald-50/95">
                Opens a chat with <span className="font-bold text-white">{chatDisplay}</span> and pastes your order
                summary — one tap to send. That usually gets you a faster confirmation than email alone.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#25D366] to-[#128C7E] py-3.5 text-center text-[15px] font-black text-white shadow-md shadow-emerald-700/25 transition hover:brightness-105 active:scale-[0.99]"
              aria-label={`Open WhatsApp chat with ${chatDisplay} with your order message filled in`}
            >
              <WhatsAppGlyph className="h-5 w-5 shrink-0 text-white" />
              Message us on WhatsApp
            </a>

            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-[44px] flex-1 rounded-xl border-2 border-emerald-100 bg-white py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50/80"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  } catch {
                    window.prompt('Copy your order message:', message)
                  }
                }}
              >
                {copied ? 'Copied order text' : 'Copy message only'}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                <button
                  type="button"
                  className="min-h-[44px] flex-1 rounded-xl border border-black/10 bg-slate-50 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
                  onClick={() => void shareMessage()}
                >
                  Share…
                </button>
              ) : null}
            </div>

            <details className="group rounded-2xl border border-emerald-100/90 bg-emerald-50/40">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm font-bold text-emerald-900 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Preview message you’ll send
                  <span
                    className="inline-block text-xs font-semibold text-emerald-700/80 transition-transform group-open:-rotate-180"
                    aria-hidden
                  >
                    ▼
                  </span>
                </span>
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-emerald-100/80 bg-white/70 px-3 py-3 font-sans text-[11px] leading-relaxed text-slate-700">
                {message}
              </pre>
            </details>

            <p className="text-center text-[11px] leading-relaxed text-slate-500">
              Tip: if WhatsApp doesn’t open, use <span className="font-semibold text-slate-600">Copy message only</span>{' '}
              and paste it into an existing chat with us.
            </p>

            <button
              type="button"
              className="w-full rounded-xl border border-black/10 bg-white py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50"
              onClick={() => void navigate('/')}
            >
              Order another package
            </button>
          </div>
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
