// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadCardEffects } from '../app/card-effect-data'
import { createMatState, type MatAction } from '../app/practice-mat'
import { showToastMessage } from '../app/use-toast-message'
import { useMatSession } from '../app/use-mat-session'
import { PracticeMat, type MatCard } from '../components/probability/PracticeMat'
import type { ApiCardReference } from '../types'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))
vi.mock('../app/use-toast-message', () => ({ showToastMessage: vi.fn() }))

const card = (ygoprodeckId: number, frameType: string): ApiCardReference =>
  ({ ygoprodeckId, frameType, race: null, cardType: 'x', description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null } }) as ApiCardReference

// Dos copias de Ash Blossom (su número real: tiene confirmado «una vez por turno, por nombre») y cartas de relleno.
const CARDS: ReadonlyMap<string, MatCard> = new Map([
  ['card-14558127-1', { name: 'Ash Blossom', apiCard: card(14558127, 'effect') }],
  ['card-14558127-2', { name: 'Ash Blossom', apiCard: card(14558127, 'effect') }],
  ['card-3-1', { name: 'Relleno A', apiCard: card(3, 'effect') }],
  ['card-4-1', { name: 'Relleno B', apiCard: card(4, 'effect') }],
  ['card-5-1', { name: 'Relleno C', apiCard: card(5, 'effect') }],
  ['card-6-1', { name: 'Relleno D', apiCard: card(6, 'effect') }],
])
const INITIAL = createMatState(['card-14558127-1', 'card-14558127-2', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5)
const NO_ACTIONS: MatAction[] = []
const NO_NAMES: Record<string, string> = {}

function Harness() {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(INITIAL, NO_ACTIONS, NO_NAMES)
  }, [start])

  if (!mat.session || !mat.state) return null

  return <PracticeMat session={mat.session} state={mat.state} cardsById={CARDS} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => start(INITIAL)} />
}

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)

const pointer = { button: 0, pointerId: 1 }
const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}
const ash = (index: number) => within(screen.getByRole('list', { name: 'Mano' })).getAllByRole('listitem', { name: 'Ash Blossom' })[index]!
const activate = (index: number) => {
  tap(ash(index))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
}

describe('el asistente de la mesa: avisa si se activa otra vez una carta de una vez por turno', () => {
  beforeEach(() => {
    vi.mocked(showToastMessage).mockClear()
    localStorage.clear()
    HTMLElement.prototype.setPointerCapture = () => {}
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 1
    }
    window.cancelAnimationFrame = () => {}
  })

  it('la segunda activación en el mismo turno avisa (también con otra copia: el límite es por nombre) y no frena nada', async () => {
    render(<Harness />)
    await act(async () => {
      await loadCardEffects()
    })

    activate(0)
    expect(showToastMessage).not.toHaveBeenCalled()

    activate(1)
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(showToastMessage).mock.calls[0]![0]).toMatch(/Ya activaste Ash Blossom este turno.*por nombre.*otra copia comparte el límite/)
    expect(vi.mocked(showToastMessage).mock.calls[0]![1]).toBe('warning')
    // La jugada se hizo igual: las dos quedaron en el registro.
    expect(screen.getAllByText(/Activás el efecto de Ash Blossom/).length).toBeGreaterThanOrEqual(2)
  })

  it('si se deshacen las dos activaciones, la siguiente ya no avisa (no cuenta lo que se deshizo)', async () => {
    render(<Harness />)
    await act(async () => {
      await loadCardEffects()
    })

    activate(0)
    activate(1)
    expect(showToastMessage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    activate(0)
    expect(showToastMessage).toHaveBeenCalledTimes(1)
  })

  it('una carta sin límite de uso confirmado se activa las veces que sea sin avisar', async () => {
    render(<Harness />)
    await act(async () => {
      await loadCardEffects()
    })

    const filler = () => within(screen.getByRole('list', { name: 'Mano' })).getByRole('listitem', { name: 'Relleno A' })

    tap(filler())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    tap(filler())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    expect(showToastMessage).not.toHaveBeenCalled()
  })
})
