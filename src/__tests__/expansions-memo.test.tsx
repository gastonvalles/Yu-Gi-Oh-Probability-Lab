// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPriceRequestsForTests } from '../app/card-prices'
import { ExpansionsScreen } from '../components/expansions/ExpansionsScreen'

// Se cuentan los dibujos de las imágenes: cada fila de la lista dibuja un sobre y cada carta del detalle, su impresión.
const renders = vi.hoisted(() => ({ packs: 0, prints: 0 }))

vi.mock('../components/expansions/PackArt', () => ({
  PackArt: () => {
    renders.packs += 1

    return <i />
  },
}))
vi.mock('../components/card-detail/PrintingArt', () => ({
  PrintingArt: () => {
    renders.prints += 1

    return <i />
  },
}))
vi.mock('../components/CardArt', () => ({ CardArt: () => <i /> }))

const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

// La más nueva (la que se abre sola en escritorio) trae más cartas que las que se dibujan de entrada (60).
const INDEX = {
  updated: '2026-10-11',
  shards: 4,
  groups: [
    [1, 'Primera', '2001-01-01', 1, 'AAA'],
    [2, 'Segunda', '2002-02-02', 1, 'BBB'],
    [3, 'Tercera', '2003-03-03', 1, 'CCC'],
    [4, 'Grande', '2026-01-01', 70, 'DDD'],
  ],
}

const SETS: Record<number, unknown[]> = {
  1: [['AAA-EN001', 'Common', 'Unlimited', 1, 11, 111, 'Carta vieja']],
  2: [['BBB-EN001', 'Common', 'Unlimited', 1, 21, 211, 'Otra vieja']],
  3: [['CCC-EN001', 'Common', 'Unlimited', 1, 31, 311, 'Una más']],
  4: Array.from({ length: 70 }, (_, n) => [`DDD-EN${String(n + 1).padStart(3, '0')}`, 'Common', 'Unlimited', n + 1, 1000 + n, 5000 + n, `Carta ${n + 1}`]),
}

beforeEach(() => {
  renders.packs = 0
  renders.prints = 0
  resetPriceRequestsForTests()
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([])
  window.matchMedia = ((query: string) => ({ matches: query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const set = /\/sets\/(\d+)\.json$/.exec(url)

      if (url.endsWith('/prices/index.json')) return { ok: true, status: 200, json: async () => INDEX }
      if (set && SETS[Number(set[1])]) return { ok: true, status: 200, json: async () => SETS[Number(set[1])] }

      return { ok: false, status: 404, json: async () => ({}) }
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const list = () => within(screen.getByRole('navigation', { name: 'Expansiones' }))

describe('la lista de expansiones', () => {
  it('elegir otra sólo vuelve a dibujar las dos filas que cambian: la que se apaga y la que se enciende', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Carta 1' })
    expect(renders.packs).toBe(4)

    renders.packs = 0
    fireEvent.click(list().getByText('Primera'))
    await screen.findByRole('button', { name: 'Ver el detalle de Carta vieja' })

    expect(renders.packs).toBe(2)
    expect(list().getByRole('button', { name: /Primera/ })).toHaveAttribute('aria-current', 'true')
    expect(list().getByRole('button', { name: /Grande/ })).not.toHaveAttribute('aria-current')
  })

  it('escribir en el buscador no vuelve a dibujar las que siguen en la lista', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Carta 1' })

    renders.packs = 0
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar expansión o carta' }), { target: { value: 'r' } })

    // "Segunda" no tiene ninguna "r": se va. Las otras tres se quedan tal cual.
    expect(list().getAllByRole('button')).toHaveLength(3)
    expect(renders.packs).toBe(0)
  })
})

describe('las cartas de una expansión', () => {
  it('"Mostrar más" sólo dibuja las impresiones que se suman, no las que ya estaban', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Carta 1' })
    expect(renders.prints).toBe(60)

    renders.prints = 0
    fireEvent.click(screen.getByRole('button', { name: 'Ver 10 más' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(70)
    expect(renders.prints).toBe(10)
  })

  it('abrir el detalle de una carta no vuelve a dibujar las demás', async () => {
    render(<ExpansionsScreen />)

    const card = await screen.findByRole('button', { name: 'Ver el detalle de Carta 1' })

    renders.prints = 0
    fireEvent.click(card)
    await screen.findByRole('dialog', { name: /Carta 1/ })

    expect(renders.prints).toBe(0)
  })
})
