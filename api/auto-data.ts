import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { CardRow, DataManifest } from '../src/app/auto/auto-data'

/** Lo que deja `scripts/build-auto-data.mjs` en `.auto-data/data.json`: el manifiesto, las filas por código y dónde está cada script en `scripts.pack` ([inicio, largo] en bytes). */
interface AutoData extends DataManifest {
  cards: Record<string, CardRow>
  scripts: Record<string, [number, number]>
}

/**
 * Los datos no cambian hasta el próximo despliegue (que estrena la caché del CDN): un día en el CDN, también lo que no existe. El navegador
 * no los guarda (`max-age=0`, sin `stale-while-revalidate`): las direcciones no llevan la versión, y una copia vieja de antes de un despliegue
 * terminaría en la caché de la app con la versión nueva. La app ya guarda todo por versión (`createDataLoader`): repetir no cuesta pedidos.
 */
const CACHE = 'public, max-age=0, s-maxage=86400'
/** Lo que ve quien abre la beta en un despliegue cuyo build no pudo armar los datos (la app lo muestra tal cual). */
const UNAVAILABLE = 'Los datos del duelo automático no están disponibles ahora'

const reply = (body: string, type: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': CACHE } })

/**
 * Las rutas de `/auto-data` (las de `httpSource`, `src/app/auto/auto-data.ts`) sobre los datos armados en `dir`: `manifest`, `cards?codes=…`
 * (sólo números de hasta 10 cifras, hasta 2000) y `script/<nombre>.lua` (404 si no existe). Las respuestas son las mismas que da `autoDataDev`
 * (vite.config.ts) en desarrollo. Sin datos (un build que no los armó), 503 con `{ error }`.
 */
export function autoDataHandler(dir: string) {
  let data: AutoData | null = null
  // Se lee al primer pedido y queda en memoria mientras viva la instancia; si falta, se vuelve a mirar en el próximo.
  const load = () => {
    try {
      data ??= JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')) as AutoData
    } catch {
      // Sin datos: 503.
    }

    return data
  }
  const script = ([start, length]: [number, number]) => {
    const file = openSync(join(dir, 'scripts.pack'), 'r')

    try {
      const bytes = Buffer.alloc(length)

      readSync(file, bytes, 0, length, start)
      return bytes.toString('utf8')
    } finally {
      closeSync(file)
    }
  }

  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url)
    // `vercel.json` reescribe /auto-data/<ruta> a esta función con la ruta en `?path=`; por las dudas (y en `vite serve`) se mira también la URL entera.
    const path = url.searchParams.get('path') ?? /\/auto-data\/(.*)$/.exec(url.pathname)?.[1] ?? ''
    const loaded = load()

    if (!loaded) return Response.json({ error: UNAVAILABLE }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    if (path === 'manifest') return reply(JSON.stringify({ version: loaded.version, tokens: loaded.tokens, filler: loaded.filler }), 'application/json')
    if (path === 'cards') {
      const codes = (url.searchParams.get('codes') ?? '').split(',').filter((code) => /^\d{1,10}$/.test(code)).slice(0, 2000).map(Number)

      // Como la consulta de desarrollo: cada carta una vez, por código.
      return reply(JSON.stringify([...new Set(codes)].sort((a, b) => a - b).flatMap((code) => loaded.cards[code] ?? [])), 'application/json')
    }
    // Sólo un nombre de archivo (nada de `/` ni rutas): es una clave del índice, nunca una ruta del disco.
    const name = /^script\/([\w.-]+\.lua)$/.exec(path)?.[1]

    if (name && Object.hasOwn(loaded.scripts, name)) return reply(script(loaded.scripts[name]), 'text/plain; charset=utf-8')
    return reply('not found', 'text/plain', 404)
  }
}

/**
 * Función de Vercel: los datos del duelo automático (beta), del mismo origen que la app (la CSP no deja que el navegador le hable a nadie
 * más). Los armó el build en `.auto-data/`, que viaja con la función (Vercel sigue esta ruta al empaquetarla); nada se le pide a GitHub acá.
 */
export const GET = autoDataHandler(join(process.cwd(), '.auto-data'))
