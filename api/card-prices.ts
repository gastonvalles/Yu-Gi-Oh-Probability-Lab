import { fetchCardPrices } from '../src/app/card-prices'

/**
 * GET /api/card-prices?id=<id de YGOPRODeck> → { prices: [...] }: el precio de TCGplayer de las impresiones más
 * nuevas de la carta. Vercel lo despliega solo (carpeta api/); en desarrollo lo sirve vite.config.ts.
 * La respuesta se cachea una hora en el CDN: los datos de origen se actualizan una vez por día.
 */
export async function GET(request: Request): Promise<Response> {
  const id = Number(new URL(request.url).searchParams.get('id'))

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Falta un id de carta válido.' }, { status: 400 })
  }

  try {
    return Response.json({ prices: await fetchCardPrices(id) }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch {
    return Response.json({ error: 'No se pudieron traer los precios.' }, { status: 502 })
  }
}
