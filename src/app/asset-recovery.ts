/**
 * Un 404 de un archivo de /assets puede quedar guardado como "inmutable" en el navegador (ver public/recover.js): para curarlo hay que volver a bajar el archivo
 * salteando el caché. Esto es lo mismo que hace ese script, para los fallos que llegan después del arranque (pantallas que se cargan al usarlas).
 */

const ASSET_URL = /https?:\/\/[^\s"'()?#]+\/assets\/[^\s"'()?#]+\.(?:js|css)/g

/** Los archivos de /assets que nombra un error de carga ("Failed to fetch dynamically imported module: https://…/assets/X.js"). Safari no dice cuál: ahí van los que el navegador ya había pedido por adelantado. */
export function assetUrlsOf(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)
  const named = message.match(ASSET_URL)

  if (named) {
    return [...new Set(named)]
  }

  if (typeof document === 'undefined') {
    return []
  }

  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((link) => link.href).filter((href) => href.includes('/assets/'))
}

/** Vuelve a bajar esos archivos salteando el caché del navegador: pisa el 404 que haya quedado guardado. Un fallo de red no frena nada. */
export async function refreshAssets(urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map((url) => fetch(url, { cache: 'reload' }).catch(() => undefined)))
}
