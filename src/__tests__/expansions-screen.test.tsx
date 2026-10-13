// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPriceRequestsForTests } from '../app/card-prices'
import { currencyLocale } from '../i18n'
import { ExpansionsScreen } from '../components/expansions/ExpansionsScreen'

// El arte real lee el store (el aviso de la banlist): acá sólo importa qué carta es.
vi.mock('../components/CardArt', () => ({ CardArt: ({ remoteUrl }: { remoteUrl: string | null }) => <img alt="" src={remoteUrl ?? ''} /> }))

const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

const INDEX = {
  updated: '2026-10-11',
  shards: 4,
  groups: [
    [1, 'Legend of Blue-Eyes White Dragon', '2002-03-08', 3],
    [2, 'Maze of Millennia', '2024-01-19', 4],
    [3, 'Sin cartas', '2020-01-01', 0],
    [4, 'Promo sin fecha', '', 1],
  ],
}

// [código, rareza, edición, mercado, producto, id de la carta, nombre]
const SETS: Record<number, unknown[]> = {
  1: [
    ['LOB-EN001', 'Ultra Rare', '1st Edition', 900, 11, 89631139, 'Blue-Eyes White Dragon'],
    ['LOB-EN002', 'Super Rare', 'Unlimited', 12.5, 12, 46986414, 'Dark Magician'],
    ['LOB-EN003', 'Common', 'Unlimited', null, 13, 5405694, 'Gaia the Fierce Knight'],
  ],
  2: [
    ['MAZE-EN001', 'Rare', 'Unlimited', 0.5, 21, 100, 'Mulcharmy Purulia'],
    ['MAZE-EN001', 'Ultra Rare', 'Unlimited', 4, 22, 100, 'Mulcharmy Purulia'],
    ['MAZE-EN002', 'Common', 'Unlimited', 0.1, 23, 101, 'Ash Blossom & Joyous Spring'],
    ['MAZE-EN003', 'Rare', 'Unlimited', 7, 24, 102, 'Maxx "C"'],
  ],
  4: [['PROMO-EN001', 'Promo', 'Limited', 1, 41, 200, 'Carta de promo']],
}

let requested: string[]

function mediaQuery(desktop: boolean) {
  window.matchMedia = ((query: string) => ({ matches: desktop && query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  resetPriceRequestsForTests()
  requested = []
  mediaQuery(true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url)

      const set = /\/sets\/(\d+)\.json$/.exec(url)

      if (url.endsWith('/prices/index.json')) return { ok: true, status: 200, json: async () => INDEX }
      if (set && SETS[Number(set[1])]) return { ok: true, status: 200, json: async () => SETS[Number(set[1])] }

      return { ok: false, status: 404, json: async () => ({}) }
    }),
  )
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usd = (value: number) => new Intl.NumberFormat(currencyLocale(), { style: 'currency', currency: 'USD' }).format(value)
const rowsText = () => screen.getAllByRole('listitem').map((item) => item.textContent ?? '')

describe('la pantalla de expansiones', () => {
  it('lista las expansiones por año, las más nuevas primero y las sin fecha al final, sin las que no tienen cartas', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })
    const names = within(nav).getAllByRole('button').map((button) => button.querySelector('.truncate')?.textContent)

    expect(names).toEqual(['Maze of Millennia', 'Legend of Blue-Eyes White Dragon', 'Promo sin fecha'])
    expect(within(nav).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['2024', '2002', 'Sin fecha'])
    expect(within(nav).queryByText('Sin cartas')).not.toBeInTheDocument()
  })

  it('el buscador filtra las expansiones por nombre, sin importar mayúsculas ni signos', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar expansión' }), { target: { value: 'blue eyes' } })

    const nav = screen.getByRole('navigation', { name: 'Expansiones' })

    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    expect(within(nav).getByText('Legend of Blue-Eyes White Dragon')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar expansión' }), { target: { value: 'zzz' } })
    expect(screen.getByText('Ninguna expansión coincide con “zzz”.')).toBeInTheDocument()
  })

  it('en escritorio se abre sola la más nueva, con sus cartas por código, rareza, edición y precio', async () => {
    render(<ExpansionsScreen />)

    expect(await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver el detalle de Ash Blossom & Joyous Spring' })).toBeInTheDocument())

    expect(requested.filter((url) => url.includes('/sets/'))).toEqual(['/prices/sets/2.json'])
    expect(rowsText()[0]).toContain('Mulcharmy Purulia')
    expect(rowsText()[0]).toContain('MAZE-EN001 · Rare · Unlimited')
    expect(rowsText()[0]).toContain(usd(0.5))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN001', 'MAZE-EN001', 'MAZE-EN002', 'MAZE-EN003'])
    expect(screen.getByText(/3 cartas distintas/)).toBeInTheDocument()
  })

  it('las cartas se filtran por nombre o código y por rareza, y se ordenan por precio con las que no tienen al final', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: 'en002' } })
    expect(rowsText()).toHaveLength(1)
    expect(rowsText()[0]).toContain('Ash Blossom')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: '' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Rareza' })).getByRole('button', { name: 'Rare' }))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN001', 'MAZE-EN003'])

    fireEvent.click(within(screen.getByRole('group', { name: 'Rareza' })).getByRole('button', { name: 'Todas' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Por precio' }))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN003', 'MAZE-EN001', 'MAZE-EN001', 'MAZE-EN002'])

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: 'nada de nada' } })
    expect(screen.getByText('Ninguna carta coincide con esos filtros.')).toBeInTheDocument()
  })

  it('elegir otra expansión pide sólo su archivo y muestra sus cartas, sin precio donde no lo hay', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Expansiones' })).getByText('Legend of Blue-Eyes White Dragon'))

    expect(await screen.findByRole('button', { name: 'Ver el detalle de Gaia the Fierce Knight' })).toBeInTheDocument()
    expect(requested.filter((url) => url.includes('/sets/'))).toEqual(['/prices/sets/2.json', '/prices/sets/1.json'])
    expect(rowsText().find((text) => text.includes('Gaia'))).toContain('Sin precio')
    expect(rowsText()[0]).toContain(usd(900))
  })

  it('en el celular se elige primero de la lista y se vuelve a ella con el botón', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    fireEvent.click(await screen.findByText('Maze of Millennia'))

    expect(await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Expansiones' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las expansiones' }))

    expect(screen.getByRole('navigation', { name: 'Expansiones' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Maze of Millennia', level: 2 })).not.toBeInTheDocument()
  })

  it('tocar una carta abre su detalle (se pide la carta completa) con su código, rareza y edición', async () => {
    fetchCardsByIds.mockResolvedValue([
      { ygoprodeckId: 100, name: 'Mulcharmy Purulia', cardType: 'Effect Monster', frameType: 'effect', description: 'Si no controlás cartas…', race: 'Aqua', attribute: 'WATER', level: 4, linkValue: null, atk: '100', def: '600', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null } },
    ])
    render(<ExpansionsScreen />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' }))[0]!)

    const dialog = await screen.findByRole('dialog', { name: /Mulcharmy Purulia/ })

    expect(within(dialog).getByText('MAZE-EN001 · Rare · Unlimited')).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledWith([100], expect.anything())
    await waitFor(() => expect(within(dialog).getByText('Si no controlás cartas…')).toBeInTheDocument())
  })

  it('si no se puede traer la lista, lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    render(<ExpansionsScreen />)

    expect(await screen.findByText('No pude traer las expansiones ahora. Probá de nuevo más tarde.')).toBeInTheDocument()
  })
})
