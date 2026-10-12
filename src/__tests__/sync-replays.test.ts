import { describe, expect, it } from 'vitest'

import { agoDays, durationSeconds, formatPayload, isReplay, readPage } from '../../scripts/sync-replays.mjs'

/** Un video como lo trae la pestaña Videos de YouTube hoy (`lockupViewModel`), con lo mínimo que lee el script. */
const lockup = (id: string, title: string, duration: string, ago: string, contentType = 'LOCKUP_CONTENT_TYPE_VIDEO') => ({
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentType,
        contentId: id,
        contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: duration } }] } }] } },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: title },
            metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '42K' } }, { text: { content: ago } }] }] } },
          },
        },
      },
    },
  },
})

describe('la fecha relativa de YouTube', () => {
  it('se pasa a días', () => {
    expect(agoDays('3w ago')).toBe(21)
    expect(agoDays('12d ago')).toBe(12)
    expect(agoDays('2mo ago')).toBe(60)
    expect(agoDays('1 year ago')).toBe(365)
    expect(agoDays('5 months ago')).toBe(150)
    expect(agoDays('Streamed 2 days ago')).toBe(2)
    expect(agoDays('5h ago')).toBeCloseTo(5 / 24)
    // "m" es minutos y "mo" es meses.
    expect(agoDays('30m ago')).toBeCloseTo(30 / 1440)
  })

  it('devuelve null si no es una fecha', () => {
    expect(agoDays('42K')).toBeNull()
    expect(agoDays('42K views')).toBeNull()
    expect(agoDays('')).toBeNull()
    expect(agoDays(undefined)).toBeNull()
  })
})

describe('la duración y qué es un replay', () => {
  it('pasa "31:38" y "1:02:03" a segundos', () => {
    expect(durationSeconds('31:38')).toBe(1898)
    expect(durationSeconds('1:02:03')).toBe(3723)
    expect(durationSeconds('0:50')).toBe(50)
    expect(durationSeconds('LIVE')).toBeNull()
    expect(durationSeconds('')).toBeNull()
  })

  it('un replay tiene "vs" en el título y dura lo que un duelo; los shorts y los avances no', () => {
    expect(isReplay({ title: 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.', duration: '31:38' })).toBe(true)
    expect(isReplay({ title: 'Kangas vs Ruggles', duration: '43:21' })).toBe(true)
    expect(isReplay({ title: 'Deck A vs. Deck B #shorts', duration: '10:00' })).toBe(false)
    expect(isReplay({ title: 'Timoti B. vs. Vladis B. (avance)', duration: '0:50' })).toBe(false)
    expect(isReplay({ title: 'YCS Paris 2026 | Spotlight', duration: '12:00' })).toBe(false)
    expect(isReplay({ title: 'A. vs. B.', duration: '' })).toBe(false)
  })
})

describe('la lectura de una página de la pestaña Videos', () => {
  it('junta los videos y el token de la página siguiente, sea cual sea el formato', () => {
    const page = readPage([
      lockup('aaaaaaaaaa1', 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.', '31:38', '3w ago'),
      lockup('aaaaaaaaaa2', 'Seeker of the Sinful Spoils II', '8:04', '2w ago'),
      lockup('PLaaaaaaaaa', 'Una lista de reproducción', '', '', 'LOCKUP_CONTENT_TYPE_PLAYLIST'),
      // El formato viejo de YouTube.
      { richItemRenderer: { content: { videoRenderer: { videoId: 'bbbbbbbbbb1', title: { runs: [{ text: 'Viejo ' }, { text: 'formato' }] }, lengthText: { simpleText: '1:00:00' }, publishedTimeText: { simpleText: '2 months ago' } } } } },
      { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'SIGUIENTE' } } } },
    ])

    expect(page.token).toBe('SIGUIENTE')
    expect(page.videos).toEqual([
      { id: 'aaaaaaaaaa1', title: 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.', duration: '31:38', ago: '3w ago' },
      { id: 'aaaaaaaaaa2', title: 'Seeker of the Sinful Spoils II', duration: '8:04', ago: '2w ago' },
      { id: 'bbbbbbbbbb1', title: 'Viejo formato', duration: '1:00:00', ago: '2 months ago' },
    ])
  })

  it('una página sin videos ni token no rompe nada', () => {
    expect(readPage({})).toEqual({ videos: [], token: null })
    expect(readPage(null)).toEqual({ videos: [], token: null })
  })
})

describe('el archivo que se escribe', () => {
  const payload = {
    fetchedAt: '2026-10-12T07:07:05.412Z',
    windowDays: 75,
    channels: { eu: { name: 'Yu-Gi-Oh! TCG Europe', url: 'https://www.youtube.com/@YuGiOhCardEU' } },
    videos: [
      { id: 'aaaaaaaaaa1', channel: 'eu', title: 'A. vs. B.', duration: '31:38', date: '2026-09-21' },
      { id: 'aaaaaaaaaa2', channel: 'eu', title: 'C. vs. D.', duration: '28:34', date: '2026-09-20' },
    ],
  }

  it('lleva un video por línea (git sólo ve lo que cambió) y es JSON válido', () => {
    const text = formatPayload(payload)

    expect(JSON.parse(text)).toEqual(payload)
    expect(text.split('\n').filter((line) => line.includes('"id"'))).toHaveLength(2)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('sin videos queda una lista vacía', () => {
    expect(JSON.parse(formatPayload({ ...payload, videos: [] }))).toEqual({ ...payload, videos: [] })
  })
})
