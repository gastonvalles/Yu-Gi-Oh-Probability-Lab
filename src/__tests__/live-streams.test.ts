import { describe, expect, it } from 'vitest'

import { byViewers, extractInitialData, fetchLiveStreams, parseAgo, parseLiveResponse, parseViewers, readLiveStreams, readPastStreams, scanVideos, type LiveStream } from '../app/live-streams'

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

  it('lee de lo ya transmitido su duración y cuándo fue (en el formato nuevo; el viejo, sin eso, también se lee)', () => {
    expect(scanVideos(PAGE).map((video) => [video.id, video.duration, video.published])).toEqual([
      ['NlQJc1ExxSA', null, null],
      ['c_qNh337rxA', null, null],
      ['unumK2yU-ks', '5:42:32', 'Streamed 2 days ago'],
      ['7l_ppqK18qM', null, null],
    ])

    const old = {
      items: [
        {
          videoRenderer: { videoId: 'AAAAAAAAAA3', title: { runs: [{ text: 'Una vieja' }] }, badges: [], viewCountText: { simpleText: '10 views' }, lengthText: { simpleText: '8:12:33' }, publishedTimeText: { simpleText: 'Streamed 3 weeks ago' } },
        },
      ],
    }

    expect(scanVideos(old).map((video) => [video.duration, video.published])).toEqual([['8:12:33', 'Streamed 3 weeks ago']])
  })

  it('las últimas que ya terminaron salen en el orden de la página, sin lo que está al aire y sin pasar de tres por canal', () => {
    const many = { items: [lockup('LIVEAAAAAA1', 'Al aire', { live: true, watching: '10 watching' }), ...['AAAAAAAAAA1', 'AAAAAAAAAA2', 'AAAAAAAAAA3', 'AAAAAAAAAA4'].map((id, index) => lockup(id, `Día ${index + 1}`, { duration: `${index + 1}:00:00` }))] }

    expect(readPastStreams(many, 'eu')).toEqual([
      { id: 'AAAAAAAAAA1', channel: 'eu', title: 'Día 1', duration: '1:00:00', published: 'Streamed 2 days ago' },
      { id: 'AAAAAAAAAA2', channel: 'eu', title: 'Día 2', duration: '2:00:00', published: 'Streamed 2 days ago' },
      { id: 'AAAAAAAAAA3', channel: 'eu', title: 'Día 3', duration: '3:00:00', published: 'Streamed 2 days ago' },
    ])
    expect(readPastStreams({ header: {} }, 'tcg')).toEqual([])
  })

  it('parseAgo entiende «Streamed 2 days ago» y no se confunde con lo demás', () => {
    expect(parseAgo('Streamed 2 days ago')).toEqual({ value: 2, unit: 'day' })
    expect(parseAgo('Streamed 1 hour ago')).toEqual({ value: 1, unit: 'hour' })
    expect(parseAgo('Premiered 3 weeks ago')).toEqual({ value: 3, unit: 'week' })
    expect(parseAgo('Streamed 11 months ago')).toEqual({ value: 11, unit: 'month' })
    // La lista de un canal lo escribe abreviado: «Streamed 1d ago», «Streamed 4w ago».
    expect(parseAgo('Streamed 1d ago')).toEqual({ value: 1, unit: 'day' })
    expect(parseAgo('Streamed 4w ago')).toEqual({ value: 4, unit: 'week' })
    expect(parseAgo('Streamed 3h ago')).toEqual({ value: 3, unit: 'hour' })
    expect(parseAgo('Streamed 45m ago')).toEqual({ value: 45, unit: 'minute' })
    expect(parseAgo('Streamed 2mo ago')).toEqual({ value: 2, unit: 'month' })
    expect(parseAgo('Streamed 1y ago')).toEqual({ value: 1, unit: 'year' })
    expect(parseAgo('6.7K watching')).toBeNull()
    expect(parseAgo('')).toBeNull()
    expect(parseAgo(null)).toBeNull()
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

  it('lo que ya terminó se valida igual (ids de video, canales conocidos, títulos con texto, duración y fecha con la forma de YouTube) y no repite lo que está al aire', () => {
    const past = (id: string, extra: Record<string, unknown> = {}) => ({ id, channel: 'eu', title: `Día ${id}`, duration: '5:42:32', published: 'Streamed 2 days ago', ...extra })
    const parsed = parseLiveResponse({
      ok: true,
      checkedAt: 'ahora',
      streams: [stream('AAAAAAAAAA1', 100)],
      past: [past('BBBBBBBBBB2'), past('AAAAAAAAAA1'), past('no es un id'), past('CCCCCCCCCC3', { channel: 'otro' }), past('DDDDDDDDDD4', { title: ' ' }), past('BBBBBBBBBB2'), past('EEEEEEEEEE5', { duration: '<script>', published: 'ayer' }), 'basura'],
    })

    expect(parsed.past).toEqual([
      { id: 'BBBBBBBBBB2', channel: 'eu', title: 'Día BBBBBBBBBB2', duration: '5:42:32', published: 'Streamed 2 days ago' },
      { id: 'EEEEEEEEEE5', channel: 'eu', title: 'Día EEEEEEEEEE5', duration: null, published: null },
    ])
  })

  it('sin lo que ya terminó (una respuesta de antes, guardada en el CDN) la lista queda vacía; con más de ocho, ocho', () => {
    expect(parseLiveResponse({ ok: true, checkedAt: 'ahora', streams: [] }).past).toEqual([])

    const ids = 'ABCDEFGHIJKL'.split('').map((letter) => letter.repeat(11))

    expect(parseLiveResponse({ ok: true, past: ids.map((id) => ({ id, channel: 'tcg', title: id })) }).past).toHaveLength(8)
  })

  it('lo que no tiene la forma esperada es «no se pudo mirar», sin transmisiones', () => {
    expect(parseLiveResponse(null)).toEqual({ ok: false, checkedAt: '', streams: [], past: [] })
    expect(parseLiveResponse({ streams: 'no' })).toEqual({ ok: false, checkedAt: '', streams: [], past: [] })
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
