import { Link } from 'react-router-dom'
import { SITE } from '../config'

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-black/5">
      <div className="mx-auto w-full max-w-md px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 grid place-items-center text-white font-black">
            MZ
          </div>
          <div className="leading-tight">
            <div className="font-black text-slate-900">{SITE.name}</div>
            <div className="text-xs text-slate-500">{SITE.tagline}</div>
          </div>
        </Link>
      </div>
    </header>
  )
}

