// @vitest-environment jsdom
// La etiqueta de ATK/DEF en el duelo manual por enlace: los números impresos de cada monstruo boca arriba, los tuyos (de tu deck) y los del rival (se piden por su número).
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DuelConnect } from '../app/use-duel'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { asSocket, createDuelHarness, effectMonster, handOf, monsters, summonFirst } from './support/duel-screen-harness'

vi.setConfig({ testTimeout: 20_000 })

const printed = { atk: '1200', def: '800' }

// Las cartas del rival se piden por su número: todas un monstruo de 1200 / 800.
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) => ids.map((id) => ({ ...effectMonster, ygoprodeckId: id, name: 'Carta ' + id, atk: '1200', def: '800' }))),
  fetchCardArts: vi.fn(async () => []),
}))

let memory: MemoryRoom
let connect: DuelConnect

const { flush, openTable, startDuel } = createDuelHarness(() => ({ memory, connect }))
const withStats = new Map([...monsters].map(([id, entry]) => [id, { ...entry, apiCard: { ...entry.apiCard, ...printed } as ApiCardReference }]))
const tagsIn = (container: HTMLElement) => [...container.querySelectorAll('[data-pick-stat]')].map((tag) => tag.textContent?.replace(/\s/g, ' '))

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('el duelo manual · ATK/DEF de los monstruos', () => {
  it('el monstruo boca arriba lleva sus números impresos de los dos lados, en la etiqueta y en su nombre; uno colocado, nada', async () => {
    const { host, guest } = startDuel({ cardsById: withStats })
    openTable(host, guest)
    const name = summonFirst(host)
    flush()
    await act(async () => {})

    expect(tagsIn(host.container)).toEqual(['1200 / 800'])
    expect(within(host.container).getByRole('button', { name: `${name}, ATK 1200, DEF 800` })).toBeInTheDocument()
    expect(tagsIn(guest.container)).toEqual(['1200 / 800'])
    expect(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1, ATK 1200, DEF 800: marcar' })).toBeInTheDocument()

    // Colocado: boca abajo no se ve nada, de ningún lado.
    fireEvent.pointerDown(handOf(host).getAllByRole('listitem')[0]!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(handOf(host).getAllByRole('listitem')[0]!, { button: 0, pointerId: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    flush()
    await act(async () => {})
    expect(tagsIn(host.container)).toEqual(['1200 / 800'])
    expect(tagsIn(guest.container)).toEqual(['1200 / 800'])
  })
})
