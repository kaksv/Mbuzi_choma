/**
 * `products.photo_url` may be:
 * - Cloudinary public_id (e.g. `mbuzzi-choma/quarter-025`)
 * - Legacy site path (`/choma/quarter-025.jpg`) → mapped to the same public_id when CLOUDINARY_CLOUD_NAME is set
 * - Full `https://...` URL (returned as-is)
 *
 * Without CLOUDINARY_CLOUD_NAME, `/choma/...` and bare paths are returned unchanged (local static files).
 */

/** `/choma/quarter-025.jpg` → `mbuzzi-choma/quarter-025` (matches `npm run upload:cloudinary`). */
function legacyChomaPathToPublicId(path: string): string | null {
  const m = path.trim().match(/^\/choma\/([^/.]+)\.[a-z0-9]+$/i)
  return m ? `mbuzzi-choma/${m[1]}` : null
}

export function resolveProductPhotoUrl(stored: string): string {
  const t = stored.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t

  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  if (!cloud) {
    return t
  }

  let publicId: string
  if (t.startsWith('/')) {
    const mapped = legacyChomaPathToPublicId(t)
    if (!mapped) return t
    publicId = mapped
  } else {
    publicId = t
  }

  const transform = process.env.CLOUDINARY_IMAGE_TRANSFORM?.trim() || 'f_auto,q_auto'
  const transformSeg = transform ? `${transform}/` : ''
  return `https://res.cloudinary.com/${cloud}/image/upload/${transformSeg}${publicId}`
}
