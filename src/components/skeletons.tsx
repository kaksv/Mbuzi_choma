export function PackageCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-lg">
      <div className="skeleton-shimmer aspect-[4/3] w-full" />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton-shimmer h-4 w-3/5 max-w-[200px] rounded-md" />
            <div className="skeleton-shimmer h-3 w-2/5 max-w-[120px] rounded-md" />
          </div>
          <div className="space-y-2 text-right">
            <div className="skeleton-shimmer ml-auto h-5 w-20 rounded-md" />
            <div className="skeleton-shimmer ml-auto h-3 w-16 rounded-md" />
          </div>
        </div>
        <div className="skeleton-shimmer h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function HomeMenuSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-skeleton-delayed"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <PackageCardSkeleton />
        </div>
      ))}
    </div>
  )
}

export function OrderPageSkeleton() {
  return (
    <div className="space-y-4 pt-6 pb-10">
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-lg">
        <div className="skeleton-shimmer aspect-[16/9] w-full" />
        <div className="space-y-3 p-4">
          <div className="flex justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton-shimmer h-6 w-2/3 max-w-[220px] rounded-md" />
              <div className="skeleton-shimmer h-4 w-1/2 max-w-[160px] rounded-md" />
            </div>
            <div className="space-y-2 text-right">
              <div className="skeleton-shimmer ml-auto h-6 w-24 rounded-md" />
              <div className="skeleton-shimmer ml-auto h-3 w-14 rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
        <div className="skeleton-shimmer mb-3 h-5 w-28 rounded-md" />
        <div className="flex items-center justify-between gap-3">
          <div className="skeleton-shimmer h-10 w-32 rounded-xl" />
          <div className="skeleton-shimmer h-10 w-24 rounded-md" />
        </div>
      </div>
      <div className="space-y-3 rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
        <div className="skeleton-shimmer h-5 w-36 rounded-md" />
        <div className="skeleton-shimmer h-24 w-full rounded-xl" />
        <div className="skeleton-shimmer h-24 w-full rounded-xl" />
        <div className="skeleton-shimmer h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function SuccessPageSkeleton() {
  return (
    <div className="space-y-4 pt-6 pb-10">
      <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg">
        <div className="skeleton-shimmer mb-2 h-4 w-24 rounded-md" />
        <div className="skeleton-shimmer mb-3 h-7 w-4/5 max-w-[280px] rounded-md" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-3 w-full rounded-md" />
          <div className="skeleton-shimmer h-3 w-[92%] rounded-md" />
        </div>
      </div>
      <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-lg">
        <div className="skeleton-shimmer mb-4 h-5 w-32 rounded-md" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between gap-3">
              <div className="skeleton-shimmer h-4 w-20 rounded-md" />
              <div className="skeleton-shimmer h-4 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
        <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
      </div>
    </div>
  )
}

export function RouteChunkFallback() {
  return (
    <div className="space-y-4 pt-6">
      <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg">
        <div className="skeleton-shimmer mb-3 h-8 w-2/3 rounded-lg" />
        <div className="skeleton-shimmer h-4 w-full rounded-md" />
      </div>
      <HomeMenuSkeleton count={2} />
    </div>
  )
}
