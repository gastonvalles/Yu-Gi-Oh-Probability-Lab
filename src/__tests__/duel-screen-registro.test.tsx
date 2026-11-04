// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DuelConnect } from '../app/use-duel'
import { DuelScreen } from '../components/duel/DuelScreen'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asSocket, handOf, monsters, render, summonFirst, tap } from './support/duel-screen-harness'

// El registro de jugadas de cada uno: lo que ve del rival (sin nada oculto) y lo que sobrevive a una recarga, propia o del rival.
vi.setConfig({ testTimeout: 20_000 })

vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  fetchCardArts: vi.fn(async () => []),
}))

vi.mock('../app/duel-rails', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/duel-rails')>()), railsFit: () => false }))

// La calculadora de vidas se carga a pedido (`lazy`): en las pruebas llega al instante.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), LazyLifeCalculatorScreen: (await import('../components/life/LifeCalculatorScreen')).LifeCalculatorScreen }))

let memory: MemoryRoom
let connect: DuelConnect

const { changeLife, click, flush, openTable, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

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

/** Las líneas del registro de `view` (se abre desde el botón del chat y se cierra al leerlo). */
function logOf(view: RenderResult): string[] {
  click(view, /^Chat/)
  const lines = within(within(screen.getByRole('dialog')).getByRole('log')).getAllByRole('listitem').map((item) => item.textContent ?? '')
  fireEvent.keyDown(document, { key: 'Escape' })
  return lines
}

/** Coloca boca abajo la primera carta de la mano en la zona `zone`; devuelve cuál era. */
function setFirst(view: RenderResult, zone: string): string {
  const [card] = handOf(view).getAllByRole('listitem')
  const name = card!.getAttribute('aria-label')!

  tap(card!)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
  fireEvent.click(within(view.container).getByRole('button', { name: `${zone}: elegir` }))
  return name
}

describe('el registro del rival', () => {
  it('dice lo que el rival invoca (con la carta, que está boca arriba), que coloca (sin decir cuál) y cómo cambian sus vidas', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const summoned = summonFirst(host)
    flush()
    const hidden = setFirst(host, 'Zona de monstruo 2')
    flush()
    changeLife(host, ['1', '000'])
    flush()
    act(() => undefined)

    const log = logOf(guest)

    expect(log).toContain(`Ana hace una Invocación Normal de ${summoned}`)
    expect(log).toContain('Ana coloca un monstruo')
    expect(log).toContain('Ana pierde 1000 LP (7000)')
    expect(log.join(' ')).not.toContain(hidden)
    // Lo propio, con las mismas jugadas.
    expect(logOf(host)).toEqual(expect.arrayContaining([`Invocación Normal de ${summoned}`, `Colocás ${hidden} boca abajo`, 'Perdés 1000 LP (7000)']))
  })
})

describe('el registro y el chat al recargar', () => {
  it('quien recarga vuelve con su registro y el chat entero; el registro del otro no pierde lo que hizo el que recargó', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest, 'guest')

    const summoned = summonFirst(guest)
    flush()
    click(host, /^Chat/)
    fireEvent.change(screen.getByLabelText('Escribí un mensaje'), { target: { value: 'Me dolió' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })

    const hostBefore = logOf(host)
    const guestBefore = logOf(guest)

    expect(hostBefore).toContain(`Beto hace una Invocación Normal de ${summoned}`)
    expect(guestBefore).toEqual(expect.arrayContaining([`Invocación Normal de ${summoned}`, expect.stringContaining('Me dolió')]))

    // Beto recarga: se cierra su pantalla y se vuelve a abrir en la misma sala.
    guest.unmount()
    flush()
    const reloaded = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    flush()
    flush()

    expect(logOf(reloaded)).toEqual(guestBefore)
    expect(logOf(host)).toEqual(hostBefore)
  })
})
