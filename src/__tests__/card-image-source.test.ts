import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../../api/card-image'
import { cardImageSrc, cardImageWidthOf, resolveCardImageUpstream } from '../app/card-image-source'

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

  it('con un ancho pide la imagen achicada; a lo que no es del proxy no le agrega nada', () => {
    expect(cardImageSrc('https://images.ygoprodeck.com/images/cards_cropped/14558127.jpg', 320)).toBe('/api/card-image/cards_cropped/14558127.jpg?w=320')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/sets/JUSH.jpg', 128)).toBe('/api/card-image/sets/JUSH.jpg?w=128')
    expect(cardImageSrc('https://images.ygoprodeck.com/images/other/1.jpg', 320)).toBe('https://images.ygoprodeck.com/images/other/1.jpg')
    expect(cardImageSrc('/mascot/cupsy/idle.png', 320)).toBe('/mascot/cupsy/idle.png')
  })

  it('el proxy sólo achica a los anchos permitidos', () => {
    expect([128, 320, 512].map((width) => cardImageWidthOf(String(width)))).toEqual([128, 320, 512])
    expect(['', '0', '96', '321', '0320', '320.0', '1e3', 'abc', '-320'].map(cardImageWidthOf)).toEqual(Array(9).fill(null))
    expect(cardImageWidthOf(null)).toBeNull()
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

  it('sirve la imagen con un año de caché, llegue por el rewrite (?path=) o por la ruta entera', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await call('/api/card-image?path=cards_small/14558127.jpg')

    expect(fetchMock).toHaveBeenCalledWith('https://images.ygoprodeck.com/images/cards_small/14558127.jpg', expect.anything())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    expect((await call('/api/card-image/cards_small/14558127.jpg')).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('con ?w= devuelve la imagen achicada en WebP, con un año de caché', async () => {
    const jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#c33' } }).jpeg().toBuffer()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })))

    for (const path of ['/api/card-image/cards_cropped/1.jpg?w=320', '/api/card-image?path=cards_cropped/1.jpg&w=320']) {
      const response = await call(path)
      const small = await sharp(Buffer.from(await response.arrayBuffer())).metadata()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/webp')
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
      expect(small).toMatchObject({ format: 'webp', width: 320, height: 213 })
    }
  })

  it('nunca agranda: una imagen más chica que el ancho pedido sale con su tamaño', async () => {
    const jpeg = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#33c' } }).jpeg().toBuffer()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200 })))

    const small = await sharp(Buffer.from(await (await call('/api/card-image/sets/LOB.jpg?w=512')).arrayBuffer())).metadata()

    expect(small.width).toBe(100)
  })

  it('un ?w= que no es de los permitidos se ignora: sale la imagen original', async () => {
    const jpeg = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#c33' } }).jpeg().toBuffer()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })))

    for (const width of ['999', '7', 'abc', '']) {
      const response = await call(`/api/card-image/cards_cropped/1.jpg?w=${width}`)

      expect(response.headers.get('content-type')).toBe('image/jpeg')
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
      expect(Buffer.from(await response.arrayBuffer()).equals(jpeg)).toBe(true)
    }
  })

  it('si no se puede achicar, sale la original (nunca un 5xx) y por poco tiempo en la caché', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })))

    const response = await call('/api/card-image/cards_cropped/1.jpg?w=320')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('con ?w= una carta que no existe o una caída de YGOPRODeck responden igual que sin él', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect((await call('/api/card-image/cards_cropped/1.jpg?w=320')).status).toBe(404)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const failed = await call('/api/card-image/cards_cropped/1.jpg?w=320')
    expect(failed.status).toBe(502)
    expect(failed.headers.get('cache-control')).toBe('no-store')
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
