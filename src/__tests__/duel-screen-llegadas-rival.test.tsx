// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { impactOn } from '../app/field-impact'
import type { DuelConnect } from '../app/use-duel'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asSocket, monsters, summonFirst } from './support/duel-screen-harness'

/**
 * Las Invocaciones del rival en sus Zonas de Monstruos Principales (`DuelTable`, sin marca de casilla) salen como las tuyas: la mesa encuentra la casilla que tiene la carta y le da su
 * anillo y su sacudida (`impactOn`). El impacto de verdad dibuja con la Web Animations API (jsdom no la tiene): acá se mira con qué casilla se llama.
 */

vi.setConfig({ testTimeout: 20_000 })
vi.mock('../app/field-impact', async (original) => ({ ...(await original<typeof import('../app/field-impact')>()), impactOn: vi.fn() }))
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  fetchCardArts: vi.fn(async () => []),
}))

let memory: MemoryRoom
let connect: DuelConnect
const { flush, openTable, startDuel } = createDuelHarness(() => ({ memory, connect }))

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  vi.mocked(impactOn).mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('las Invocaciones del rival en el duelo por enlace', () => {
  it('Ana Invoca en su Zona de Monstruo Principal: Beto ve el anillo y la sacudida en la casilla de esa carta', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    const rival = vi.mocked(impactOn).mock.calls.filter(([cell]) => cell !== null && guest.container.contains(cell) && cell.querySelector('[data-rival-card-id]') !== null)

    expect(rival).toHaveLength(1)
    expect(rival[0]![2]).toBe('light')
  })
})
