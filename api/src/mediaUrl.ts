/**
 * `products.photo_url` stores either:
 * - A Cloudinary public_id (e.g. `mbuzzi-choma/quarter-025`) when CLOUDINARY_CLOUD_NAME is set at runtime, or
 * - A full URL (`https://...`) if you inlined it, or
 * - A site-relative path (e.g. `/choma/x.jpg`) for local dev without Cloudinary.
 */
export function resolveProductPhotoUrl(stored: string): string {
  const t = stored.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('/')) return t

  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  if (!cloud) return t

  const transform = process.env.CLOUDINARY_IMAGE_TRANSFORM?.trim() || 'f_auto,q_auto'
  const transformSeg = transform ? `${transform}/` : ''
  return `https://res.cloudinary.com/${cloud}/image/upload/${transformSeg}${t}`
}
