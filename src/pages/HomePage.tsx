import { Suspense, use, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PackageCard from '../components/PackageCard'
import { AsyncErrorBoundary } from '../components/AsyncErrorBoundary'
import { getHomeMenuFilter, type HomeMenuFilter } from '../lib/homeMenuFilter'
import { HomeMenuSkeleton } from '../components/skeletons'
import { getProductsListResource, invalidateProductsListResource } from '../lib/asyncResources'
import type { MeatPackage } from '../types/package'

function HomeMenu({
  packages,
  onSelect,
  filter,
}: {
  packages: MeatPackage[]
  onSelect: (id: string) => void
  filter: HomeMenuFilter
}) {
  if (packages.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-black/5 bg-white p-5 text-center shadow-lg">
        <p className="text-sm font-semibold text-slate-800">
          {filter === 'popular' ? 'No “most ordered” picks right now.' : 'No packages to show.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {filter === 'popular' ? 'Switch to All goats or check back soon.' : 'Please try again later.'}
        </p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white"
        >
          All goats
        </Link>
      </div>
    )
  }

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

function HomeMenuGate({
  filter,
  onSelect,
}: {
  filter: HomeMenuFilter
  onSelect: (id: string) => void
}) {
  const all = use(getProductsListResource())
  const packages = filter === 'popular' ? all.filter((p) => p.popular) : all
  return <HomeMenu packages={packages} onSelect={onSelect} filter={filter} />
}

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filter = getHomeMenuFilter(searchParams)
  const [loadAttempt, setLoadAttempt] = useState(0)

  return (
    <div className="pb-4">
      <p className="pt-4 text-center text-sm font-semibold text-slate-600">Tap a pack to order</p>

      <section className="mt-1">
        <AsyncErrorBoundary
          key={loadAttempt}
          fallback={({ error }) => (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-lg">
              <div className="font-bold">Couldn’t load menu</div>
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
            <HomeMenuGate filter={filter} onSelect={(id) => void navigate(`/order/${id}`)} />
          </Suspense>
        </AsyncErrorBoundary>
      </section>

      <section className="mt-6">
        <div className="rounded-2xl border border-black/5 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
          <div className="font-black text-slate-900">Quick guide</div>
          <ul className="mt-2 space-y-1.5 text-xs">
            <li>Choose pack → checkout → pay (mobile money or cash)</li>
            <li>We confirm by WhatsApp / phone</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
