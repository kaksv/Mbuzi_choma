import { Suspense, use, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AsyncErrorBoundary } from '../components/AsyncErrorBoundary'
import ProductImage from '../components/ProductImage'
import { OrderPageSkeleton } from '../components/skeletons'
import { createOrder } from '../lib/api'
import { getOrderPageBootstrapResource, invalidateOrderPageResource } from '../lib/asyncResources'
import { resolveProductPhotoUrl } from '../lib/resolvePhotoUrl'
import { formatUGX } from '../utils/formatUGX'
import type { MeatPackage } from '../types/package'

function isProbablyPhoneUG(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}

function OrderMissing({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="pt-6">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
        <div className="font-black text-slate-900">Package not found</div>
        <div className="mt-1 text-sm text-slate-600">Please choose a package from the menu.</div>
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

function OrderPageLoaded({
  pkg,
  checkoutConfig,
  navigate,
}: {
  pkg: MeatPackage
  checkoutConfig: { deliveryFeeUGX: number }
  navigate: ReturnType<typeof useNavigate>
}) {
  const [quantity, setQuantity] = useState(1)
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery' | 'delivery_pending'>('delivery')
  const [paymentMethod, setPaymentMethod] = useState<'pesapal' | 'cash_on_delivery'>('cash_on_delivery')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const subtotalUGX = pkg.priceUGX * quantity
  const deliveryFeeUGX = useMemo(() => {
    if (fulfillmentType === 'delivery') return checkoutConfig.deliveryFeeUGX
    return 0
  }, [fulfillmentType, checkoutConfig])

  const totalUGX = subtotalUGX + deliveryFeeUGX

  const inputClass =
    'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/80'

  return (
    <div className="pb-10 pt-4">
      <button
        type="button"
        onClick={() => void navigate('/')}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-orange-700"
      >
        <span aria-hidden className="text-lg leading-none">
          ←
        </span>
        Back to menu
      </button>

      <section className="space-y-5">
        <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-lg shadow-orange-900/5 ring-1 ring-orange-100/60">
          <div className="relative">
            <ProductImage
              src={resolveProductPhotoUrl(pkg.photoUrl)}
              alt={pkg.title}
              aspectClassName="aspect-[16/9]"
              loading="eager"
            />
            {pkg.popular ? (
              <div className="absolute left-3 top-3 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow-md">
                Popular pick
              </div>
            ) : null}
          </div>

          <div className="border-t border-orange-100/80 bg-gradient-to-b from-white to-orange-50/40 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600/90">Your package</p>
                <h1 className="mt-1 text-xl font-black leading-tight text-slate-900">{pkg.title}</h1>
                <p className="mt-1 text-sm text-slate-600">{pkg.weightKg} kg · fried goat meat</p>
              </div>
              <div className="shrink-0 rounded-2xl bg-white/90 px-3 py-2 text-right shadow-sm ring-1 ring-black/5">
                <div className="text-lg font-black text-slate-900">{formatUGX(pkg.priceUGX)}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">per pack</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg shadow-orange-900/5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-black text-slate-900">How many?</h2>
            <span className="text-xs font-medium text-slate-500">Max 20</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-black/5">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-900 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <div className="min-w-[3rem] text-center text-xl font-black tabular-nums text-slate-900">{quantity}</div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-900 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                disabled={quantity >= 20}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line total</div>
              <div className="text-xl font-black tabular-nums text-slate-900">{formatUGX(subtotalUGX)}</div>
            </div>
          </div>
        </div>

        <form
          className="space-y-5 rounded-3xl border border-black/5 bg-white p-5 shadow-lg shadow-orange-900/5"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)

            if (!fullName.trim()) return setError('Please enter your full name.')
            if (!isProbablyPhoneUG(phone)) return setError('Please enter a valid Ugandan phone number.')
            if (!location.trim()) return setError('Please enter your area/location.')

            setSubmitting(true)
            try {
              const result = await createOrder({
                packageId: pkg.id,
                quantity,
                fulfillmentType,
                paymentMethod,
                customer: {
                  fullName: fullName.trim(),
                  phone: phone.trim(),
                  location: location.trim(),
                  notes: notes.trim() ? notes.trim() : undefined,
                },
                transactionRef:
                  paymentMethod === 'cash_on_delivery' && transactionRef.trim()
                    ? transactionRef.trim()
                    : undefined,
              })
              if (result.pesapal?.redirectUrl) {
                window.location.href = result.pesapal.redirectUrl
                return
              }
              navigate(`/success/${result.order.id}`, { state: { order: result.order } })
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : 'Could not submit order.')
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div>
            <h2 className="text-base font-black text-slate-900">Checkout</h2>
            <p className="mt-1 text-sm text-slate-600">Tell us how to reach you — we’ll confirm by phone or WhatsApp.</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-800 shadow-sm">{error}</div>
          ) : null}

          <fieldset className="space-y-2.5">
            <legend className="mb-1 px-0.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              Delivery or pickup
            </legend>
            {(
              [
                {
                  value: 'pickup' as const,
                  title: 'Self pickup',
                  hint: 'No delivery fee. We’ll share pickup details after confirmation.',
                },
                {
                  value: 'delivery' as const,
                  title: `Standard delivery (+${formatUGX(checkoutConfig.deliveryFeeUGX)})`,
                  hint: 'Within our usual delivery area.',
                },
                {
                  value: 'delivery_pending' as const,
                  title: 'Far area — fee pending',
                  hint: 'We’ll confirm delivery cost by phone before dispatch.',
                },
              ] as const
            ).map((opt) => {
              const selected = fulfillmentType === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 transition ${
                    selected
                      ? 'border-orange-500 bg-orange-50/70 shadow-sm ring-1 ring-orange-200/60'
                      : 'border-black/5 bg-slate-50/50 hover:border-black/10 hover:bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    className="mt-1 accent-orange-600"
                    checked={selected}
                    onChange={() => setFulfillmentType(opt.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900">{opt.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-600">{opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <fieldset className="space-y-2.5">
            <legend className="mb-1 px-0.5 text-xs font-bold uppercase tracking-wider text-slate-500">Payment</legend>
            {(
              [
                {
                  value: 'cash_on_delivery' as const,
                  title: 'Cash on delivery',
                  hint: 'Pay when you receive your order (where applicable).',
                },
                {
                  value: 'pesapal' as const,
                  title: 'Mobile money or card',
                  hint: 'You’ll go to our secure checkout to pay (Pesapal).',
                },
              ] as const
            ).map((opt) => {
              const selected = paymentMethod === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 transition ${
                    selected
                      ? 'border-orange-500 bg-orange-50/70 shadow-sm ring-1 ring-orange-200/60'
                      : 'border-black/5 bg-slate-50/50 hover:border-black/10 hover:bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    className="mt-1 accent-orange-600"
                    checked={selected}
                    onChange={() => setPaymentMethod(opt.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900">{opt.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-600">{opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <div className="space-y-4 rounded-2xl border border-dashed border-orange-200/80 bg-orange-50/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact</h3>
            <label className="block">
              <div className="mb-1.5 text-sm font-bold text-slate-800">Full name</div>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Jane Nambwaya"
                autoComplete="name"
                required
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-sm font-bold text-slate-800">Phone number</div>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="e.g. 07XXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-sm font-bold text-slate-800">Area / location</div>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputClass}
                placeholder="e.g. Kampala, Kyengera"
                autoComplete="street-address"
                required
              />
            </label>
          </div>

          <div className="rounded-2xl border border-black/5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-sm text-white shadow-lg shadow-slate-900/20">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/70">Order summary</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
                {quantity} × pack
              </span>
            </div>
            <div className="flex justify-between text-white/85">
              <span>Line total</span>
              <span className="font-semibold tabular-nums">{formatUGX(subtotalUGX)}</span>
            </div>
            <div className="mt-2 flex justify-between text-white/85">
              <span>Delivery</span>
              <span className="font-semibold tabular-nums">
                {fulfillmentType === 'delivery_pending'
                  ? 'Pending'
                  : fulfillmentType === 'delivery'
                    ? formatUGX(deliveryFeeUGX)
                    : formatUGX(0)}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/15 pt-3">
              <span className="text-sm font-bold text-white/90">Total due</span>
              <span className="text-2xl font-black tabular-nums tracking-tight">{formatUGX(totalUGX)}</span>
            </div>
          </div>

          {paymentMethod === 'cash_on_delivery' ? (
            <label className="block">
              <div className="mb-1.5 text-sm font-bold text-slate-800">Order note (optional)</div>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className={inputClass}
                placeholder="Anything we should know for cash on delivery"
              />
            </label>
          ) : null}

          <label className="block">
            <div className="mb-1.5 text-sm font-bold text-slate-800">Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Delivery time, landmark, gate code…"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-4 text-base font-black text-white shadow-lg shadow-orange-600/30 transition hover:from-orange-600 hover:to-orange-700 hover:shadow-orange-600/40 active:scale-[0.99] disabled:opacity-60"
          >
            {submitting
              ? paymentMethod === 'pesapal'
                ? 'Opening payment…'
                : 'Submitting…'
              : paymentMethod === 'pesapal'
                ? 'Continue to Payment'
                : 'Confirm order'}
          </button>
          <p className="text-center text-xs leading-relaxed text-slate-500">
            Secure checkout for online payment. By submitting, you’re requesting an order from Mbuzzi Choma — we’ll
            follow up to confirm.
          </p>
        </form>
      </section>
    </div>
  )
}

function OrderBootstrapGate({
  packageId,
  navigate,
}: {
  packageId: string
  navigate: ReturnType<typeof useNavigate>
}) {
  const { pkg, checkoutConfig } = use(getOrderPageBootstrapResource(packageId))
  if (!pkg) return <OrderMissing navigate={navigate} />
  return <OrderPageLoaded pkg={pkg} checkoutConfig={checkoutConfig} navigate={navigate} />
}

export default function OrderPage() {
  const navigate = useNavigate()
  const { packageId } = useParams()
  const [loadAttempt, setLoadAttempt] = useState(0)

  if (!packageId) {
    return <OrderMissing navigate={navigate} />
  }

  return (
    <AsyncErrorBoundary
      key={loadAttempt}
      fallback={({ error }) => (
        <div className="pt-6">
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
            <div className="font-black text-slate-900">Something went wrong</div>
            <div className="mt-1 text-sm text-slate-600">{error.message}</div>
            <button
              className="mt-4 w-full rounded-xl bg-black py-3 font-bold text-white"
              type="button"
              onClick={() => {
                invalidateOrderPageResource(packageId)
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
      <Suspense fallback={<OrderPageSkeleton />}>
        <OrderBootstrapGate packageId={packageId} navigate={navigate} />
      </Suspense>
    </AsyncErrorBoundary>
  )
}
