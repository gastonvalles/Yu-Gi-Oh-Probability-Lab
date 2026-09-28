import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchCards } from '../ygoprodeck'
import { requestCardInfo } from '../ygoprodeck/client'

function mockFetch(implementation: typeof fetch) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestCardInfo', () => {
  it('devuelve el payload cuando la respuesta es correcta', async () => {
    mockFetch(async () => jsonResponse({ data: [] }))

    await expect(requestCardInfo(new URLSearchParams())).resolves.toEqual({ data: [] })
  })

  it('usa el mensaje de error de la API cuando viene en el payload', async () => {
    mockFetch(async () => jsonResponse({ error: 'No card matching your query was found.' }, 400))

    await expect(requestCardInfo(new URLSearchParams())).rejects.toThrow('No card matching your query was found.')
  })

  it('muestra un mensaje propio si el error no es JSON', async () => {
    mockFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    await expect(requestCardInfo(new URLSearchParams())).rejects.toThrow('No se pudo consultar YGOPRODeck.')
  })

  it('traduce los errores de red a un mensaje en español', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(requestCardInfo(new URLSearchParams())).rejects.toThrow('No se pudo conectar con YGOPRODeck')
  })
})

describe('searchCards', () => {
  it('mapea cada filtro a su parámetro de la API y omite los vacíos', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ data: [] }))

    await searchCards({ query: '  Ash  ', archetype: '', exactType: 'Effect Monster', level: '   ' }, 10, 20)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      num: '10',
      offset: '20',
      fname: 'Ash',
      type: 'Effect Monster',
    })
  })
})
