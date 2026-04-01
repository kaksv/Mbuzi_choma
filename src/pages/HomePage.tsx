import { Suspense, use, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PackageCard from '../components/PackageCard'
import { AsyncErrorBoundary } from '../components/AsyncErrorBoundary'
import { HomeMenuSkeleton } from '../components/skeletons'
import { SITE } from '../config'
import { getProductsListResource, invalidateProductsListResource } from '../lib/asyncResources'
import type { MeatPackage } from '../types/package'

function HomeMenu({ packages, onSelect }: { packages: MeatPackage[]; onSelect: (id: string) => void }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4">
      {packages.map((pkg, i) => (
        <div
          key={pkg.id}
          className="animate-skeleton-delayed"
          style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
        >
          <PackageCard pkg={pkg} onOrder={() => onSelect(pkg.id)} />
        </div>
      ))}
    </div>
  )
}

function HomeMenuGate({ onSelect }: { onSelect: (id: string) => void }) {
  const packages = use(getProductsListResource())
  return <HomeMenu packages={packages} onSelect={onSelect} />
}

export default function HomePage() {
  const navigate = useNavigate()
  const [loadAttempt, setLoadAttempt] = useState(0)

  return (
    <div className="pb-4">
      <section className="pt-6">
        <div className="rounded-3xl border border-black/5 bg-gradient-to-br from-orange-100 via-white to-orange-50 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl leading-tight font-black text-slate-900">Order {SITE.name}</h1>
              <p className="text-sm text-slate-600">
                Choose your fried goat meat package. Payments in <span className="font-bold">UGX</span>.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center rounded-full border border-black/5 bg-white px-2 py-1">
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
            <h2 className="text-lg font-black text-slate-900">Package menu</h2>
            <p className="text-sm text-slate-600">From quarter to bigger sizes.</p>
          </div>
        </div>

        <AsyncErrorBoundary
          key={loadAttempt}
          fallback={({ error }) => (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm shadow-lg text-red-800">
              <div className="font-bold">Couldn’t load packages</div>
              <div className="mt-1">{error.message}</div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl bg-black py-2 text-sm font-bold text-white"
                onClick={() => {
                  invalidateProductsListResource()
                  setLoadAttempt((n) => n + 1)
                }}
              >
                Retry
              </button>
            </div>
          )}
        >
          <Suspense fallback={<HomeMenuSkeleton count={4} />}>
            <HomeMenuGate onSelect={(id) => void navigate(`/order/${id}`)} />
          </Suspense>
        </AsyncErrorBoundary>
      </section>

      <section className="mt-6">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-lg">
          <div className="font-black text-slate-900">How it works</div>
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            <div>1. Pick a package and quantity.</div>
            <div>2. Pay in UGX using Mobile Money.</div>
            <div>3. Send your Transaction ID, then you get your order.</div>
          </div>
        </div>
      </section>
    </div>
  )
}
