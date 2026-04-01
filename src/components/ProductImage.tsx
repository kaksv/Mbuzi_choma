import { useEffect, useState } from 'react'

type Props = {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  /** e.g. aspect-[4/3] */
  aspectClassName?: string
  loading?: 'lazy' | 'eager'
}

export default function ProductImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  aspectClassName = 'aspect-[4/3]',
  loading = 'lazy',
}: Props) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const displaySrc = failed ? '/favicon.svg' : src

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [displaySrc])

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${aspectClassName} ${className}`}>
      <div
        className={`pointer-events-none absolute inset-0 z-[1] transition-opacity duration-500 ease-out ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden
      >
        <div className="skeleton-shimmer absolute inset-0" />
        <div className="absolute inset-0 bg-slate-100/40" />
      </div>
      <img
        src={displaySrc}
        alt={alt}
        loading={loading}
        decoding="async"
        ref={(img) => {
          if (!img) return
          if (img.complete && img.naturalHeight > 0) setLoaded(true)
        }}
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          const img = e.currentTarget
          if (failed) {
            img.onerror = null
            return
          }
          setFailed(true)
          setLoaded(true)
        }}
        className={`relative z-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
      />
    </div>
  )
}
