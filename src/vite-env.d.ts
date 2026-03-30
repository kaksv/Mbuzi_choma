/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Same cloud name as API; optional if API always returns absolute photoUrl. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string
  readonly VITE_CLOUDINARY_IMAGE_TRANSFORM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
