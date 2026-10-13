/// <reference types="vite/client" />

/** Los archivos de `public/` (ver `publicAssetsList` en vite.config.ts). */
declare module 'virtual:public-assets' {
  const files: ReadonlyArray<{ path: string; bytes: number }>
  export default files
}
