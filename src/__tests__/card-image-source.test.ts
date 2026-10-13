import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../../api/card-image'
import { cardImageSrc, resolveCardImageUpstream } from '../app/card-image-source'

describe('las imágenes de las cartas pasan por el proxy', () => {
  it('reescribe las de YGOPRODeck a /api/card-image y deja el resto como está', () => {
    expect(cardImageSrc('https://images.ygoprodeck.com/images/cards_small/14558127.jpg')).toBe('/api/card-image/cards_small/14558127.jpg')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/cards/14558127.jpg')).toBe('/api/card-image/cards/14558127.jpg')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/cards_cropped/14558127.jpg')).toBe('/api/card-image/cards_cropped/14558127.jpg')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/sets/JUSH.jpg')).toBe('/api/card-image/sets/JUSH.jpg')
    // Lo que no es una imagen de carta (otra carpeta, otro host, una ruta rara) no se toca.
    expect(cardImageSrc('https://images.ygoprodeck.com/images/other/1.jpg')).toBe('https://images.ygoprodeck.com/images/other/1.jpg')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/cards/../x.jpg')).toBe('https://images.ygoprodeck.com/images/cards/../x.jpg')
    expect(cardImageSrc('/mascot/cupsy/idle.png')).toBe('/mascot/cupsy/idle.png')
    expect(cardImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('el proxy sólo pide a YGOPRODeck rutas de imagen válidas', () => {
    expect(resolveCardImageUpstream('/api/card-image/cards_small/14558127.jpg')).toBe('https://images.ygoprodeck.com/images/cards_small/14558127.jpg')
    expect(resolveCardImageUpstream('/api/card-image/cards_small/14558127.png')).toBeNull()
    expect(resolveCardImageUpstream('/api/card-image/cards_small/../../etc/passwd')).toBeNull()
    expect(resolveCardImageUpstream('/api/card-image/cards_small/a%2Fb.jpg')).toBeNull()
    expect(resolveCardImageUpstream('/api/other/1.jpg')).toBeNull()
  })
})

describe('la función api/card-image', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const call = (path: string) => GET(new Request(`https://yu-gi-oh-probability-lab.vercel.app${path}`))

  it('sirve la imagen con un año de caché en el CDN, llegue por el rewrite (?path=) o por la ruta entera', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await call('/api/card-image?path=cards_small/14558127.jpg')

    expect(fetchMock).toHaveBeenCalledWith('https://images.ygoprodeck.com/images/cards_small/14558127.jpg', expect.anything())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=31536000, immutable')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    expect((await call('/api/card-image/cards_small/14558127.jpg')).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no pide nada por una ruta inválida, y una caída de YGOPRODeck no se cachea', async () => {
    const fetchMock = vi.fn(async () => new Response('down', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    expect((await call('/api/card-image/cards_small/../x.jpg')).status).toBe(404)
    expect((await call('/api/card-image?path=cards_small/../x.jpg')).status).toBe(404)
    expect((await call('/api/card-image')).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()

    const failed = await call('/api/card-image/cards_small/1.jpg')
    expect(failed.status).toBe(502)
    expect(failed.headers.get('cache-control')).toBe('no-store')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect((await call('/api/card-image/cards_small/2.jpg')).status).toBe(404)
  })
})
