// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState, type MatAction, type MatState } from '../app/practice-mat'
import { useMatSession } from '../app/use-mat-session'
import { PracticeMat, type MatCard } from '../components/probability/PracticeMat'
import type { ApiCardReference } from '../types'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const card = (ygoprodeckId: number, frameType: string): ApiCardReference =>
  ({ ygoprodeckId, frameType, race: null, cardType: 'x', description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null }) as unknown as ApiCardReference

const CARDS: ReadonlyMap<string, MatCard> = new Map([
  ['card-1-1', { name: 'Ash Blossom', apiCard: card(1, 'effect') }],
  ['card-2-1', { name: 'Maxx C', apiCard: card(2, 'effect') }],
  ['card-3-1', { name: 'Called by the Grave', apiCard: card(3, 'spell') }],
  ['card-4-1', { name: 'Nibiru', apiCard: card(4, 'effect') }],
  ['card-5-1', { name: 'Droll', apiCard: card(5, 'effect') }],
  ['card-6-1', { name: 'Imperm', apiCard: card(6, 'trap') }],
  ['card-7-1', { name: 'Zeus', apiCard: card(7, 'xyz') }],
])
const INITIAL = createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1'], 5)
const NO_ACTIONS: MatAction[] = []
const NO_NAMES: Record<string, string> = {}

function Harness({ initial = INITIAL, actions = NO_ACTIONS }: { initial?: MatState; actions?: MatAction[] }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(initial, actions, NO_NAMES)
  }, [start, initial, actions])

  if (!mat.session || !mat.state) {
    return null
  }

  return (
    <PracticeMat
      session={mat.session}
      state={mat.state}
      cardsById={CARDS}
      deckName="Test"
      onDispatch={mat.dispatch}
      onUndo={mat.undo}
      onSeek={mat.seek}
      onLoadCombo={(combo) => start(combo.initial, combo.actions, combo.names)}
      onNewHand={() => start(INITIAL)}
    />
  )
}

// La etiqueta de límite de las cartas lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)

const pointer = { button: 0, pointerId: 1 }
const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}
const hand = () => screen.getByRole('list', { name: 'Mano' })
const zone = (name: string) => screen.getByRole('group', { name })
const status = () => screen.getByRole('status', { name: 'Paso actual' })

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

describe('la mesa de práctica', () => {
  it('tocar una carta de la mano abre el menú, e invocarla la pone en la primera zona de monstruo', () => {
    render(<Harness />)

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocar en ataque' }))

    expect(screen.queryByRole('menu', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Invocás Ash Blossom en ataque')).toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()

    // Deshacer la devuelve a la mano y borra la jugada.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(hand()).getByRole('listitem', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('arrastrar una carta al cementerio la manda ahí; tocar el deck ofrece robar', () => {
    render(<Harness />)

    const gy = screen.getByRole('button', { name: 'Cementerio: 0' })
    document.elementFromPoint = () => gy

    const maxx = within(hand()).getByRole('listitem', { name: 'Maxx C' })
    fireEvent.pointerDown(maxx, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(maxx, { ...pointer, clientX: 80, clientY: 120 })

    expect(screen.getByRole('button', { name: 'Cementerio: 1' })).toBeInTheDocument()
    expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()

    tap(screen.getByRole('button', { name: 'Deck: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(screen.getByRole('button', { name: 'Deck: 0' })).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(within(status()).getByText('Robás Imperm')).toBeInTheDocument()
  })

  it('el visor del deck permite buscar una carta a la mano y baraja al cerrar', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Deck: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))

    const viewer = screen.getByRole('dialog', { name: 'Deck · 1' })
    fireEvent.click(within(viewer).getByRole('button', { name: 'Imperm' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))

    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Deck · 1' })).not.toBeInTheDocument()
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Barajás el deck')).toBeInTheDocument()
  })

  it('guarda el combo con nombre, lo lista y lo reproduce paso a paso', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocar en defensa' }))
    tap(within(hand()).getByRole('listitem', { name: 'Called by the Grave' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar combo' }))
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Línea básica' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(screen.queryByRole('dialog', { name: 'Guardar combo' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]')).toHaveLength(1)

    // El panel lateral lista el combo; cargarlo vuelve a la mano inicial y se avanza con Siguiente.
    const aside = screen.getByRole('complementary', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    expect(within(aside).getByText('Línea básica')).toBeInTheDocument()
    fireEvent.click(within(aside).getByRole('button', { name: 'Cargar Línea básica' }))

    expect(within(status()).getByText('0/2')).toBeInTheDocument()
    expect(within(status()).getByText('Mano inicial')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(within(status()).getByText('1/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocás Ash Blossom en defensa')).toBeInTheDocument()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(zone('Zona de magia y trampa 1')).getByRole('button', { name: 'Called by the Grave, boca abajo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    // Una jugada nueva a mitad de la reproducción deja de lado lo que seguía.
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocar en ataque' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocás Nibiru en ataque')).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Called by the Grave' })).toBeInTheDocument()
  })
})
