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

  return (
    <div className="pt-6 pb-10">
      <section className="space-y-4">
        <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-lg">
          <ProductImage
            src={resolveProductPhotoUrl(pkg.photoUrl)}
            alt={pkg.title}
            aspectClassName="aspect-[16/9]"
            loading="eager"
          />

          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-black text-slate-900">{pkg.title}</div>
                <div className="mt-1 text-sm text-slate-600">{pkg.weightKg}kg fried goat meat</div>
              </div>
              <div className="text-right">
                <div className="font-black text-slate-900">{formatUGX(pkg.priceUGX)}</div>
                <div className="mt-1 text-[11px] text-slate-500">unit price</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="font-black text-slate-900">Quantity</div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-10 w-10 rounded-xl border border-black/10 bg-white font-black text-slate-900 active:scale-[0.99]"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                -
              </button>
              <div className="min-w-[44px] text-center text-lg font-black text-slate-900">{quantity}</div>
              <button
                type="button"
                className="h-10 w-10 rounded-xl border border-black/10 bg-white font-black text-slate-900 active:scale-[0.99]"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                +
              </button>
            </div>

            <div className="text-right">
              <div className="text-sm text-slate-600">Line total</div>
              <div className="text-lg font-black text-slate-900">{formatUGX(subtotalUGX)}</div>
            </div>
          </div>
        </div>

        <form
          className="space-y-3 rounded-3xl border border-black/5 bg-white p-4 shadow-lg"
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
              navigate(`/success/${result.order.id}`)
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : 'Could not submit order.')
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-slate-900">Your details</div>
              <div className="mt-1 text-sm text-slate-600">We use this to confirm your order.</div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          ) : null}

          <fieldset className="space-y-2 rounded-2xl border border-black/10 p-3">
            <legend className="px-1 text-sm font-bold text-slate-900">Delivery or pickup</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="fulfillment"
                className="mt-1"
                checked={fulfillmentType === 'pickup'}
                onChange={() => setFulfillmentType('pickup')}
              />
              <span>
                <span className="font-semibold text-slate-900">Self pickup</span>
                <span className="block text-xs text-slate-600">
                  No delivery fee. We’ll share pickup details after confirmation.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="fulfillment"
                className="mt-1"
                checked={fulfillmentType === 'delivery'}
                onChange={() => setFulfillmentType('delivery')}
              />
              <span>
                <span className="font-semibold text-slate-900">
                  Standard delivery (+{formatUGX(checkoutConfig.deliveryFeeUGX)})
                </span>
                <span className="block text-xs text-slate-600">Within our usual delivery area.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="fulfillment"
                className="mt-1"
                checked={fulfillmentType === 'delivery_pending'}
                onChange={() => setFulfillmentType('delivery_pending')}
              />
              <span>
                <span className="font-semibold text-slate-900">Far area — delivery fee pending</span>
                <span className="block text-xs text-slate-600">
                  No delivery fee on this order yet. We’ll confirm the cost by phone before dispatch.
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="space-y-2 rounded-2xl border border-black/10 p-3">
            <legend className="px-1 text-sm font-bold text-slate-900">Payment</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="payment"
                className="mt-1"
                checked={paymentMethod === 'cash_on_delivery'}
                onChange={() => setPaymentMethod('cash_on_delivery')}
              />
              <span>
                <span className="font-semibold text-slate-900">Cash on delivery</span>
                <span className="block text-xs text-slate-600">
                  Pay when you receive your order (where applicable).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="payment"
                className="mt-1"
                checked={paymentMethod === 'pesapal'}
                onChange={() => setPaymentMethod('pesapal')}
              />
              <span>
                <span className="font-semibold text-slate-900">Mobile money / card (Pesapal)</span>
                <span className="block text-xs text-slate-600">
                  You’ll be redirected to Pesapal to complete payment securely.
                </span>
              </span>
            </label>
          </fieldset>

          <label className="block">
            <div className="mb-1 text-sm font-bold text-slate-900">Full name</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. Jane Nambwaya"
              required
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm font-bold text-slate-900">Phone number</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. 07XXXXXXXX"
              inputMode="tel"
              required
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm font-bold text-slate-900">Area / location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. Kampala, Kyengera"
              required
            />
          </label>

          <div className="rounded-2xl border border-black/10 bg-slate-50 p-4 text-sm">
            <div className="mb-2 font-black text-slate-900">Order summary</div>
            <div className="flex justify-between text-slate-700">
              <span>Line total</span>
              <span className="font-semibold">{formatUGX(subtotalUGX)}</span>
            </div>
            <div className="mt-1 flex justify-between text-slate-700">
              <span>Delivery</span>
              <span className="font-semibold">
                {fulfillmentType === 'delivery_pending'
                  ? 'Pending'
                  : fulfillmentType === 'delivery'
                    ? formatUGX(deliveryFeeUGX)
                    : formatUGX(0)}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-black text-slate-900">
              <span>Total</span>
              <span>{formatUGX(totalUGX)}</span>
            </div>
          </div>

          {paymentMethod === 'cash_on_delivery' ? (
            <label className="block">
              <div className="mb-1 text-sm font-bold text-slate-900">Order note / reference (optional)</div>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="Anything we should know for cash on delivery"
              />
            </label>
          ) : null}

          <label className="block">
            <div className="mb-1 text-sm font-bold text-slate-900">Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[96px] w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="Delivery time, landmark, etc."
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-bold text-white transition hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] disabled:opacity-60"
          >
            {submitting
              ? paymentMethod === 'pesapal'
                ? 'Starting payment…'
                : 'Submitting…'
              : paymentMethod === 'pesapal'
                ? 'Continue to Pesapal'
                : 'Confirm order'}
          </button>
          <div className="text-center text-xs text-slate-500">
            By confirming, you’re submitting an order request to Mbuzzi Choma.
          </div>
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
