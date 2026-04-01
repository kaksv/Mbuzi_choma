export type HomeMenuFilter = 'all' | 'popular'

export function getHomeMenuFilter(searchParams: URLSearchParams): HomeMenuFilter {
  return searchParams.get('filter') === 'popular' ? 'popular' : 'all'
}
