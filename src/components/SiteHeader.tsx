import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getHomeMenuFilter, menuListHref } from '../lib/homeMenuFilter'
import { SITE } from '../config'

function SearchGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM1.5 9a7.5 7.5 0 1 1 14.085 3.573l3.021 3.02a1 1 0 0 1-1.415 1.415l-3.02-3.021A7.5 7.5 0 0 1 1.5 9Z"
        fill="currentColor"
        fillOpacity="0.45"
      />
    </svg>
  )
}

function HeaderMenuSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <SearchGlyph />
      </span>
      <input
        type="search"
        name="menu-search"
        value={q}
        onChange={(e) => {
          const next = e.target.value
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev)
              const trimmed = next.trim()
              if (trimmed) p.set('q', trimmed)
              else p.delete('q')
              return p
            },
            { replace: true },
          )
        }}
        placeholder="Search packs…"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-xl border border-black/10 bg-slate-50/95 py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-inner shadow-black/5 outline-none ring-orange-400/0 transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-200/80"
        aria-label="Search packages"
      />
    </div>
  )
}

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
        <div className="flex items-center gap-2">
          <Link
            to={menuListHref(searchParams, 'all')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-black text-white shadow-sm shadow-orange-600/25 outline-none ring-orange-400 focus-visible:ring-2"
            aria-label={`${SITE.name} home`}
          >
            MZ
          </Link>

          {onMenu ? (
            <HeaderMenuSearch />
          ) : (
            <Link
              to={menuListHref(searchParams, 'all')}
              className="min-w-0 flex-1 rounded-xl py-0.5 outline-none ring-orange-400 focus-visible:ring-2"
            >
              <div className="truncate font-black leading-tight text-slate-900">{SITE.name}</div>
              <div className="truncate text-[11px] font-semibold tracking-wide text-slate-500">{SITE.tagline}</div>
            </Link>
          )}
        </div>

        {onMenu ? (
          <nav
            className="mt-3 flex gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-black/5"
            aria-label="Menu filters"
          >
            <Link
              to={menuListHref(searchParams, 'all')}
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
              to={menuListHref(searchParams, 'combo')}
              replace
              className={`${tabBase} ${
                filter === 'combo'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Popular combo
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  )
}
