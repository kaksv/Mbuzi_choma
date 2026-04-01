export type HomeMenuFilter = 'all' | 'combo'

/** Primary: filter=combo. Legacy: filter=popular (same as combo). */
export function getHomeMenuFilter(searchParams: URLSearchParams): HomeMenuFilter {
  const f = searchParams.get('filter')
  if (f === 'combo' || f === 'popular') return 'combo'
  return 'all'
}

/** Build `/?...` preserving `q` and other keys; set or clear `filter`. */
export function menuListHref(searchParams: URLSearchParams, filter: HomeMenuFilter): string {
  const p = new URLSearchParams(searchParams)
  if (filter === 'all') {
    p.delete('filter')
  } else {
    p.set('filter', 'combo')
  }
  const qs = p.toString()
  return qs ? `/?${qs}` : '/'
}

/** Same tab & filters; remove search query only. */
export function menuListHrefClearQuery(searchParams: URLSearchParams): string {
  const p = new URLSearchParams(searchParams)
  p.delete('q')
  const qs = p.toString()
  return qs ? `/?${qs}` : '/'
}
