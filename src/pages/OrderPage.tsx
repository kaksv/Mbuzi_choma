import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SITE } from '../config'
import { createOrder, fetchProduct } from '../lib/api'
import { resolveProductPhotoUrl } from '../lib/resolvePhotoUrl'
import { formatUGX } from '../utils/formatUGX'
import type { MeatPackage } from '../types/package'

function isProbablyPhoneUG(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}

export default function OrderPage() {
  const navigate = useNavigate()
  const { packageId } = useParams()

  const [pkg, setPkg] = useState<MeatPackage | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [quantity, setQuantity] = useState(1)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!packageId) {
      setLoadState('missing')
      return
    }
    let cancelled = false
    setLoadState('loading')
    setLoadError(null)
    fetchProduct(packageId)
      .then((p) => {
        if (cancelled) return
        if (!p) {
          setLoadState('missing')
          return
        }
        setPkg(p)
        setLoadState('ok')
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load package.')
          setLoadState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [packageId])

  const totalUGX = pkg ? pkg.priceUGX * quantity : 0

  if (loadState === 'loading') {
    return (
      <div className="pt-6">
        <div className="rounded-2xl bg-white border border-black/5 p-6 shadow-lg text-center text-slate-600 text-sm">
          Loading package…
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="pt-6">
        <div className="rounded-2xl bg-white border border-black/5 p-4 shadow-lg">
          <div className="font-black text-slate-900">Something went wrong</div>
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

  if (loadState === 'missing' || !pkg) {
    return (
      <div className="pt-6">
        <div className="rounded-2xl bg-white border border-black/5 p-4 shadow-lg">
          <div className="font-black text-slate-900">Package not found</div>
          <div className="text-sm text-slate-600 mt-1">Please choose a package from the menu.</div>
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

  return (
    <div className="pt-6 pb-10">
      <section className="space-y-4">
        <div className="rounded-3xl overflow-hidden bg-white border border-black/5 shadow-lg">
          <div className="relative">
            <img
              src={resolveProductPhotoUrl(pkg.photoUrl)}
              alt={pkg.title}
              loading="lazy"
              className="w-full aspect-[16/9] object-cover"
              onError={(e) => {
                const img = e.currentTarget
                img.onerror = null
                img.src = '/favicon.svg'
              }}
            />
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-black text-slate-900 text-lg">{pkg.title}</div>
                <div className="text-sm text-slate-600 mt-1">{pkg.weightKg}kg fried goat meat</div>
              </div>
              <div className="text-right">
                <div className="font-black text-slate-900">{formatUGX(pkg.priceUGX)}</div>
                <div className="text-[11px] text-slate-500 mt-1">unit price</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-black/5 shadow-lg p-4">
          <div className="font-black text-slate-900">Quantity</div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-10 w-10 rounded-xl border border-black/10 bg-white text-slate-900 font-black active:scale-[0.99]"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                -
              </button>
              <div className="min-w-[44px] text-center font-black text-slate-900 text-lg">{quantity}</div>
              <button
                type="button"
                className="h-10 w-10 rounded-xl border border-black/10 bg-white text-slate-900 font-black active:scale-[0.99]"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                +
              </button>
            </div>

            <div className="text-right">
              <div className="text-sm text-slate-600">Total</div>
              <div className="font-black text-slate-900 text-lg">{formatUGX(totalUGX)}</div>
            </div>
          </div>
        </div>

        <form
          className="rounded-3xl bg-white border border-black/5 shadow-lg p-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)

            if (!fullName.trim()) return setError('Please enter your full name.')
            if (!isProbablyPhoneUG(phone)) return setError('Please enter a valid Ugandan phone number.')
            if (!location.trim()) return setError('Please enter your area/location.')

            setSubmitting(true)
            try {
              const order = await createOrder({
                packageId: pkg.id,
                quantity,
                customer: {
                  fullName: fullName.trim(),
                  phone: phone.trim(),
                  location: location.trim(),
                  notes: notes.trim() ? notes.trim() : undefined,
                },
                transactionRef: transactionRef.trim() ? transactionRef.trim() : undefined,
              })
              navigate(`/success/${order.id}`)
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
              <div className="text-sm text-slate-600 mt-1">We use this to confirm your order.</div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">
              {error}
            </div>
          ) : null}

          <label className="block">
            <div className="text-sm font-bold text-slate-900 mb-1">Full name</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. Jane Nambwaya"
              required
            />
          </label>

          <label className="block">
            <div className="text-sm font-bold text-slate-900 mb-1">Phone number</div>
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
            <div className="text-sm font-bold text-slate-900 mb-1">Area / location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. Kampala, Kyengera"
              required
            />
          </label>

          <div className="rounded-2xl bg-orange-50 border border-black/5 p-4">
            <div className="font-black text-slate-900">Payment (UGX)</div>
            <div className="text-sm text-slate-700 mt-1">
              Pay <span className="font-bold">{formatUGX(totalUGX)}</span> to{' '}
              <span className="font-bold">{SITE.payment.phoneForPayment}</span>.
            </div>
            <div className="text-sm text-slate-600 mt-1">{SITE.payment.methodLabel}</div>

            <label className="block mt-3">
              <div className="text-sm font-bold text-slate-900 mb-1">Transaction ID / Reference (optional)</div>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="e.g. MTNMO-KK-12345"
              />
            </label>
          </div>

          <label className="block">
            <div className="text-sm font-bold text-slate-900 mb-1">Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-orange-300 min-h-[96px]"
              placeholder="Any request for delivery time, landmark, etc."
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl active:scale-[0.99] transition"
          >
            {submitting ? 'Submitting…' : 'Confirm order'}
          </button>
          <div className="text-xs text-slate-500 text-center">
            By confirming, you’re submitting an order request to Mbuzzi Choma.
          </div>
        </form>
      </section>
    </div>
  )
}
