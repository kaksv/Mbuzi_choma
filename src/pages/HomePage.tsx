import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PackageCard from '../components/PackageCard'
import { SITE } from '../config'
import { fetchProducts } from '../lib/api'
import type { MeatPackage } from '../types/package'

export default function HomePage() {
  const navigate = useNavigate()
  const [packages, setPackages] = useState<MeatPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProducts()
      .then((list) => {
        if (!cancelled) setPackages(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load menu.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="pb-4">
      <section className="pt-6">
        <div className="rounded-3xl border border-black/5 bg-gradient-to-br from-orange-100 via-white to-orange-50 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl leading-tight font-black text-slate-900">
                Order {SITE.name}
              </h1>
              <p className="text-sm text-slate-600">
                Choose your fried goat meat package. Payments in <span className="font-bold">UGX</span>.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center px-2 py-1 bg-white border border-black/5 rounded-full">
                  Mobile-friendly ordering
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-black text-slate-900 text-lg">Package menu</h2>
            <p className="text-sm text-slate-600">From quarter to bigger sizes.</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl bg-white border border-black/5 p-6 text-center text-slate-600 text-sm shadow-lg">
            Loading menu…
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-800 text-sm shadow-lg">
            <div className="font-bold">Couldn’t load packages</div>
            <div className="mt-1">{error}</div>
            <button
              type="button"
              className="mt-3 w-full bg-black text-white font-bold py-2 rounded-xl text-sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="mt-4 grid grid-cols-1 gap-4">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onOrder={() => navigate(`/order/${pkg.id}`)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <div className="rounded-2xl bg-white border border-black/5 p-4 shadow-lg">
          <div className="font-black text-slate-900">How it works</div>
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            <div>
              1. Pick a package and quantity.
            </div>
            <div>
              2. Pay in UGX using Mobile Money.
            </div>
            <div>
              3. Send your Transaction ID, then you get your order.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
