import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getHomeMenuFilter } from '../lib/homeMenuFilter'
import { SITE } from '../config'

export default function SiteHeader() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const filter = getHomeMenuFilter(searchParams)
  const onMenu = location.pathname === '/'

  const tabBase =
    'relative flex min-h-10 flex-1 items-center justify-center rounded-xl px-2 py-2 text-center text-[13px] font-bold leading-tight transition'

  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur-md">
      <div className="mx-auto w-full max-w-md px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl pr-1 outline-none ring-orange-400 focus-visible:ring-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-black text-white shadow-sm shadow-orange-600/25">
              MZ
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-black text-slate-900">{SITE.name}</div>
              <div className="truncate text-[11px] font-semibold tracking-wide text-slate-500">
                {SITE.tagline}
              </div>
            </div>
          </Link>
        </div>

        {onMenu ? (
          <nav
            className="mt-3 flex gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-black/5"
            aria-label="Menu filters"
          >
            <Link
              to="/"
              replace
              className={`${tabBase} ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All goats
            </Link>
            <Link
              to="/?filter=popular"
              replace
              className={`${tabBase} ${
                filter === 'popular'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Most ordered
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  )
}
