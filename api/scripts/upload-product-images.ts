/**
 * One-time (or repeat) upload of repo `public/choma/*.jpg` to Cloudinary.
 *
 * Requires in api/.env:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Run from repo: cd api && npx tsx scripts/upload-product-images.ts
 * Public IDs match DB: mbuzzi-choma/<basename-without-ext>
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 as cloudinary } from 'cloudinary'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chomaDir = path.resolve(__dirname, '../../public/choma')

async function main() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in api/.env')
    process.exit(1)
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  })

  const files = (await readdir(chomaDir)).filter((f) => /\.jpe?g$/i.test(f))
  if (files.length === 0) {
    console.error('No JPEGs in', chomaDir)
    process.exit(1)
  }

  for (const file of files.sort()) {
    const id = file.replace(/\.jpe?g$/i, '')
    const fullPath = path.join(chomaDir, file)
    const res = await cloudinary.uploader.upload(fullPath, {
      folder: 'mbuzzi-choma',
      public_id: id,
      overwrite: true,
      resource_type: 'image',
    })
    console.log(file, '→', res.public_id)
  }

  console.log('\nDone. Run DB migrations (003) if needed, set CLOUDINARY_CLOUD_NAME on the API host.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
