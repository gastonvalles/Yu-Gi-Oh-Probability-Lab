import { describe, expect, it } from 'vitest'

import { byViewers, extractInitialData, fetchLiveStreams, parseLiveResponse, parseViewers, readLiveStreams, scanVideos, type LiveStream } from '../app/live-streams'

// Lo mismo que YouTube deja en la página de un canal (formato nuevo), con sólo lo que se lee: el id, el título, la insignia de «LIVE» y «N watching».
const lockup = (id: string, title: string, options: { live?: boolean; watching?: string; duration?: string } = {}) => ({
  lockupViewModel: {
    contentId: id,
    contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    contentImage: {
      thumbnailViewModel: {
        overlays: [
          {
            thumbnailBottomOverlayViewModel: {
              badges: [
                options.live
                  ? { thumbnailBadgeViewModel: { text: 'LIVE', badgeStyle: 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE' } }
                  : { thumbnailBadgeViewModel: { text: options.duration ?? '5:42:32', badgeStyle: 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT' } },
              ],
            },
          },
        ],
      },
    },
    metadata: {
      lockupMetadataViewModel: {
        title: { content: title },
        metadata: {
          contentMetadataViewModel: {
            metadataRows: [{ metadataParts: [{ text: { content: options.watching ?? 'Streamed 2 days ago' }, accessibilityLabel: '1.6 thousand watching' }] }],
          },
        },
      },
    },
  },
})

// El formato viejo: `videoRenderer`, con la insignia en `badges` y la gente en `viewCountText`.
const renderer = (id: string, title: string, live: boolean, viewCount: string) => ({
  videoRenderer: {
    videoId: id,
    title: { runs: [{ text: title }] },
    badges: live ? [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW', label: 'LIVE NOW' } }] : [],
    viewCountText: { runs: [{ text: viewCount }] },
  },
})

const PAGE = {
  contents: {
    tabs: [
      {
        content: {
          items: [
            lockup('NlQJc1ExxSA', 'Yu-Gi-Oh! Championship Series - Houston, TX - Genesys Main Event - Day One', { live: true, watching: '6.7K watching' }),
            lockup('c_qNh337rxA', 'Yu-Gi-Oh! Championship Series - Houston, TX - Advanced ATTACK OF THE GIANT CARD!! - Day One', { live: true, watching: '1.4K watching' }),
            lockup('unumK2yU-ks', 'Livestream | WORLD CHAMPIONSHIP 2026 | Day 3'),
            renderer('7l_ppqK18qM', 'Una vieja con el formato anterior', false, '1,234 views'),
          ],
        },
      },
    ],
  },
}

describe('parseViewers', () => {
  it('entiende «6.7K watching», «1,234 watching» y «1.2M watching»', () => {
    expect(parseViewers('6.7K watching')).toBe(6700)
    expect(parseViewers('1,234 watching')).toBe(1234)
    expect(parseViewers('1.2M watching')).toBe(1_200_000)
    expect(parseViewers('87 watching now')).toBe(87)
    expect(parseViewers('3,456 viewers')).toBe(3456)
  })

  it('no confunde las vistas de un video ya transmitido ni un texto cualquiera con gente mirando', () => {
    expect(parseViewers('1.6K views')).toBeNull()
    expect(parseViewers('Streamed 2 days ago')).toBeNull()
    expect(parseViewers('')).toBeNull()
    expect(parseViewers(null)).toBeNull()
  })
})

describe('leer la página de un canal', () => {
  it('saca el JSON que YouTube deja en la página y no se confunde si falta o está roto', () => {
    expect(extractInitialData(`<html><script>var ytInitialData = ${JSON.stringify(PAGE)};</script></html>`)).toEqual(PAGE)
    expect(extractInitialData('<html>Before you continue to YouTube</html>')).toBeNull()
    expect(extractInitialData('<script>var ytInitialData = {roto};</script>')).toBeNull()
  })

  it('distingue lo que está al aire de lo ya transmitido, con su título y la gente que mira', () => {
    expect(scanVideos(PAGE).map((video) => [video.id, video.live, video.viewers])).toEqual([
      ['NlQJc1ExxSA', true, 6700],
      ['c_qNh337rxA', true, 1400],
      ['unumK2yU-ks', false, null],
      ['7l_ppqK18qM', false, null],
    ])
    expect(readLiveStreams(PAGE, 'tcg')).toEqual([
      { id: 'NlQJc1ExxSA', channel: 'tcg', title: 'Yu-Gi-Oh! Championship Series - Houston, TX - Genesys Main Event - Day One', viewers: 6700 },
      { id: 'c_qNh337rxA', channel: 'tcg', title: 'Yu-Gi-Oh! Championship Series - Houston, TX - Advanced ATTACK OF THE GIANT CARD!! - Day One', viewers: 1400 },
    ])
  })

  it('también lee el formato viejo de la lista (videoRenderer)', () => {
    const page = { items: [renderer('AAAAAAAAAA1', 'En vivo', true, '6,744 watching'), renderer('AAAAAAAAAA2', 'Ya pasó', false, '10 views')] }

    expect(readLiveStreams(page, 'eu')).toEqual([{ id: 'AAAAAAAAAA1', channel: 'eu', title: 'En vivo', viewers: 6744 }])
  })

  it('una página que no es una lista de videos (un aviso de cookies, otro formato) no tiene videos: eso es «no se pudo mirar», no «no hay nada en vivo»', () => {
    expect(scanVideos({ header: { title: 'Antes de continuar' } })).toEqual([])
    expect(scanVideos(null)).toEqual([])
    // Una lista de reproducción trae otro tipo de id: no es un video.
    expect(scanVideos({ lockupViewModel: { contentId: 'PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', metadata: { lockupMetadataViewModel: { title: { content: 'Lista' } } } } })).toEqual([])
  })
})

describe('lo que vuelve de la función', () => {
  const stream = (id: string, viewers: number | null): LiveStream => ({ id, channel: 'tcg', title: `Transmisión ${id}`, viewers })

  it('queda ordenado: lo más visto primero y, sin dato de gente, al final', () => {
    expect([stream('BBBBBBBBBB2', null), stream('AAAAAAAAAA1', 10), stream('CCCCCCCCCC3', 500)].sort(byViewers).map((item) => item.id)).toEqual(['CCCCCCCCCC3', 'AAAAAAAAAA1', 'BBBBBBBBBB2'])
  })

  it('se valida: sólo ids de video de 11 caracteres, canales conocidos y títulos con texto (nunca algo que arme un link raro)', () => {
    const parsed = parseLiveResponse({
      ok: true,
      checkedAt: '2026-10-17T18:00:00.000Z',
      streams: [
        stream('AAAAAAAAAA1', 100),
        { ...stream('BBBBBBBBBB2', 5), channel: 'otro' },
        { ...stream('no es un id', 5) },
        { ...stream('CCCCCCCCCC3', 5), title: '   ' },
        { ...stream('AAAAAAAAAA1', 1) },
        { id: 'DDDDDDDDDD4', channel: 'eu', title: ' Con espacios ', viewers: 'muchos' },
        'basura',
      ],
    })

    expect(parsed.ok).toBe(true)
    expect(parsed.streams).toEqual([stream('AAAAAAAAAA1', 100), { id: 'DDDDDDDDDD4', channel: 'eu', title: 'Con espacios', viewers: null }])
  })

  it('lo que no tiene la forma esperada es «no se pudo mirar», sin transmisiones', () => {
    expect(parseLiveResponse(null)).toEqual({ ok: false, checkedAt: '', streams: [] })
    expect(parseLiveResponse({ streams: 'no' })).toEqual({ ok: false, checkedAt: '', streams: [] })
  })

  it('fetchLiveStreams pide /api/live y falla si la función falla', async () => {
    const calls: string[] = []
    const good = (async (url: string) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ ok: true, checkedAt: 'ahora', streams: [stream('AAAAAAAAAA1', 3)] }), { status: 200 })
    }) as unknown as typeof fetch
    const bad = (async () => new Response('x', { status: 502 })) as unknown as typeof fetch

    expect((await fetchLiveStreams(good)).streams).toHaveLength(1)
    expect(calls).toEqual(['/api/live'])
    await expect(fetchLiveStreams(bad)).rejects.toThrow('/api/live: 502')
  })
})
