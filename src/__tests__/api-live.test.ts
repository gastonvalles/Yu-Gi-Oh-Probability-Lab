import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../../api/live'

// La página de un canal con lo que importa: una transmisión al aire y un video ya transmitido.
const page = (live: Array<{ id: string; title: string; watching: string }>) => {
  const lockup = (id: string, title: string, isLive: boolean, watching: string) => ({
    lockupViewModel: {
      contentId: id,
      contentImage: {
        thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: isLive ? 'LIVE' : '1:00:00', badgeStyle: isLive ? 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE' : 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT' } }] } }] },
      },
      metadata: { lockupMetadataViewModel: { title: { content: title }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: watching } }] }] } } } },
    },
  })
  const data = { items: [...live.map((stream) => lockup(stream.id, stream.title, true, stream.watching)), lockup('ZZZZZZZZZZ9', 'Ya transmitido', false, 'Streamed 2 days ago')] }

  return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`
}

const respond = (html: string, status = 200) => new Response(html, { status })
const request = (search = '') => new Request(`https://ygo.example/api/live${search}`)

afterEach(() => vi.unstubAllGlobals())

describe('GET /api/live', () => {
  it('junta lo que está al aire en los dos canales, lo más visto primero, y deja que el CDN lo guarde unos segundos', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('OfficialYuGiOhTCG')
        ? respond(page([{ id: 'NlQJc1ExxSA', title: 'YCS Houston - Genesys Main Event', watching: '6.7K watching' }]))
        : respond(page([{ id: 'AAAAAAAAAA1', title: 'YCS Europa - Final', watching: '9.1K watching' }])),
    )

    vi.stubGlobal('fetch', fetchMock)
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=45, stale-while-revalidate=120')
    expect(body.ok).toBe(true)
    expect(body.streams).toEqual([
      { id: 'AAAAAAAAAA1', channel: 'eu', title: 'YCS Europa - Final', viewers: 9100 },
      { id: 'NlQJc1ExxSA', channel: 'tcg', title: 'YCS Houston - Genesys Main Event', viewers: 6700 },
    ])
    // Sólo se lee lo fijo: las pestañas de transmisiones de los dos canales oficiales, con los encabezados de un navegador.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(['https://www.youtube.com/@OfficialYuGiOhTCG/streams', 'https://www.youtube.com/@YuGiOhCardEU/streams'])
  })

  it('trae también las últimas que ya terminaron de cada canal (con su duración y cuándo fue), aparte de lo que está al aire', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('OfficialYuGiOhTCG') ? respond(page([{ id: 'NlQJc1ExxSA', title: 'YCS Houston', watching: '100 watching' }])) : respond(page([])))),
    )
    const body = await (await GET(request())).json()

    expect(body.streams.map((stream: { id: string }) => stream.id)).toEqual(['NlQJc1ExxSA'])
    expect(body.past).toEqual([
      { id: 'ZZZZZZZZZZ9', channel: 'tcg', title: 'Ya transmitido', duration: '1:00:00', published: 'Streamed 2 days ago' },
      { id: 'ZZZZZZZZZZ9', channel: 'eu', title: 'Ya transmitido', duration: '1:00:00', published: 'Streamed 2 days ago' },
    ])
  })

  it('sin nada al aire dice ok con la lista vacía (no es un error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(page([]))))
    const body = await (await GET(request())).json()

    expect(body).toMatchObject({ ok: true, streams: [] })
    // Lo ya transmitido sigue ahí.
    expect(body.past).toHaveLength(2)
  })

  it('si un canal no se puede leer (cookies, bloqueo, caída) lo dice con ok: false, sin tapar lo que sí se leyó, y se vuelve a intentar pronto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('OfficialYuGiOhTCG') ? respond(page([{ id: 'NlQJc1ExxSA', title: 'YCS Houston', watching: '100 watching' }])) : respond('<html>Before you continue to YouTube</html>'))),
    )
    const response = await GET(request())
    const body = await response.json()

    expect(body.ok).toBe(false)
    expect(body.streams.map((stream: { id: string }) => stream.id)).toEqual(['NlQJc1ExxSA'])
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=15')
  })

  it('con YouTube caído (error de red o una respuesta de error) no falla: dice ok: false', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('OfficialYuGiOhTCG') ? Promise.reject(new TypeError('red caída')) : respond('x', 503))))
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: false, streams: [], past: [] })
  })

  it('rechaza los parámetros: cada valor distinto sería una copia nueva en el CDN y un pedido más a YouTube', async () => {
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)
    const response = await GET(request('?canal=otro'))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
