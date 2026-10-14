/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección del relay del duelo por enlace (`wss://…`); sin ella el duelo por enlace no se ofrece. */
  readonly VITE_DUEL_RELAY_URL?: string
}

/** Los archivos de `public/` (ver `publicAssetsList` en vite.config.ts). */
declare module 'virtual:public-assets' {
  const files: ReadonlyArray<{ path: string; bytes: number }>
  export default files
}
