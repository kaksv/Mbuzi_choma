import type { MeatPackage } from '../types/package'
import { resolveProductPhotoUrl } from '../lib/resolvePhotoUrl'
import { formatUGX } from '../utils/formatUGX'

type Props = {
  pkg: MeatPackage
  onOrder: () => void
}

export default function PackageCard({ pkg, onOrder }: Props) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-black/5">
      <div className="relative">
        <img
          src={resolveProductPhotoUrl(pkg.photoUrl)}
          alt={pkg.title}
          loading="lazy"
          className="w-full aspect-[4/3] object-cover"
          onError={(e) => {
            const img = e.currentTarget
            // Avoid infinite loops if the fallback also fails.
            img.onerror = null
            img.src = '/favicon.svg'
          }}
        />
        {pkg.popular ? (
          <div className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            Most ordered
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-black text-slate-900 text-base">{pkg.title}</div>
            <div className="text-xs text-slate-500 mt-1">{pkg.weightKg}kg fried goat meat</div>
          </div>
          <div className="text-right">
            <div className="font-black text-slate-900">{formatUGX(pkg.priceUGX)}</div>
            <div className="text-[11px] text-slate-500 mt-1">per package</div>
          </div>
        </div>

        <button
          onClick={onOrder}
          className="mt-4 w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl active:scale-[0.99] transition"
        >
          Order this
        </button>
      </div>
    </div>
  )
}

