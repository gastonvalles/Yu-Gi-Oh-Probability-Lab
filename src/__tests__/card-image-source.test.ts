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

  it('un nombre de archivo tiene que ser el número de una carta (con el sufijo de un arte alternativo) o el código de un set: nada inventado', () => {
    const ok = ['cards/14558127.jpg', 'cards_small/14558127_1.jpg', 'cards_cropped/1.jpg', 'sets/JUSH.jpg', 'sets/SDWD.jpg', 'sets/LC5D.jpg']
    const bad = ['cards/abc.jpg', 'cards/14558127x.jpg', 'cards/12345678901.jpg', 'cards/1_123.jpg', 'cards/1_a.jpg', 'cards/' + 'a'.repeat(40) + '.jpg', 'sets/J.jpg', 'sets/JUSH-EN.jpg', 'sets/ABCDEFGHIJKLM.jpg', 'sets/J_USH.jpg', 'cards/1.JPG', 'cards/.jpg', 'sets/..jpg']

    for (const path of ok) expect(resolveCardImageUpstream(`/api/card-image/${path}`), path).toBe(`https://images.ygoprodeck.com/images/${path}`)
    for (const path of bad) expect(resolveCardImageUpstream(`/api/card-image/${path}`), path).toBeNull()
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })))

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

describe('la función api/card-image contra pedidos hechos para abusar de ella', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const call = (path: string) => GET(new Request(`https://yu-gi-oh-probability-lab.vercel.app${path}`))
  const image = (headers: Record<string, string> = { 'content-type': 'image/jpeg' }, body: BodyInit = new Uint8Array([1, 2, 3])) => vi.fn(async () => new Response(body, { status: 200, headers }))

  it('un parámetro que no es path ni w se rechaza antes de pedir nada: cada valor distinto sería una copia nueva en el CDN y otra petición a YGOPRODeck', async () => {
    const fetchMock = image()
    vi.stubGlobal('fetch', fetchMock)

    for (const query of ['?x=1', '?w=128&x=1', '?cache=abc', '?W=128', '?w=128&w=320&y=']) {
      const response = await call(`/api/card-image/cards/12345.jpg${query}`)

      expect(response.status, query).toBe(400)
      expect(response.headers.get('cache-control'), query).toBe('public, max-age=300, s-maxage=300')
    }

    expect((await call('/api/card-image?path=cards/12345.jpg&w=128&z=1')).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    // Con los dos que sí valen, sigue andando.
    expect((await call('/api/card-image?path=cards/12345.jpg&w=999')).status).toBe(200)
  })

  it('lo que no existe se recuerda unos minutos también en el CDN (no sólo en el navegador)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))

    for (const path of ['/api/card-image/cards/12345.jpg', '/api/card-image/cards/inventada.jpg']) {
      const response = await call(path)

      expect(response.status, path).toBe(404)
      expect(response.headers.get('cache-control'), path).toBe('public, max-age=300, s-maxage=300')
    }
  })

  it('no sigue redirecciones: si YGOPRODeck manda a otro lado, no se va', async () => {
    const fetchMock = image()
    vi.stubGlobal('fetch', fetchMock)

    await call('/api/card-image/cards/12345.jpg')

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error' }))

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('redirect'))))
    expect((await call('/api/card-image/cards/12345.jpg')).status).toBe(502)
  })

  it('sólo devuelve imágenes: otro tipo de contenido, o ninguno, es una caída del origen', async () => {
    for (const headers of <Record<string, string>[]>[{ 'content-type': 'text/html' }, { 'content-type': 'application/javascript' }, { 'content-type': 'image/svg+xml' }, {}]) {
      vi.stubGlobal('fetch', image(headers, '<script>alert(1)</script>'))
      const response = await call('/api/card-image/cards/12345.jpg')

      expect(response.status, JSON.stringify(headers)).toBe(502)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }

    // Y el tipo que sale es el validado (con minúsculas y sin parámetros), no lo que diga el origen tal cual.
    vi.stubGlobal('fetch', image({ 'content-type': 'Image/PNG; charset=binary' }))
    expect((await call('/api/card-image/cards/12345.jpg')).headers.get('content-type')).toBe('image/png')
  })

  it('no entrega lo que pesa más que una imagen de carta, lo diga el encabezado o no', async () => {
    vi.stubGlobal('fetch', image({ 'content-type': 'image/jpeg', 'content-length': String(3 * 1024 * 1024) }))
    expect((await call('/api/card-image/cards/12345.jpg')).status).toBe(502)

    vi.stubGlobal('fetch', image({ 'content-type': 'image/jpeg' }, new Uint8Array(3 * 1024 * 1024)))
    expect((await call('/api/card-image/cards/12345.jpg')).status).toBe(502)

    vi.stubGlobal('fetch', image({ 'content-type': 'image/jpeg' }, new Uint8Array(200 * 1024)))
    expect((await call('/api/card-image/cards/12345.jpg')).status).toBe(200)
  })

  it('una imagen con muchísimos píxeles no se achica (se sirve entera y por poco tiempo): no le da trabajo de más a sharp', async () => {
    const huge = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#123' } }).jpeg({ quality: 1 }).toBuffer()
    vi.stubGlobal('fetch', image({ 'content-type': 'image/jpeg' }, new Uint8Array(huge)))

    const response = await call('/api/card-image/cards/12345.jpg?w=320')

    expect(huge.byteLength).toBeLessThan(2 * 1024 * 1024)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300')
  })
})
