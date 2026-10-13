// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState, replayMat, type MatAction, type MatState } from '../app/practice-mat'
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

function Harness({ initial = INITIAL, actions = NO_ACTIONS, cards = CARDS }: { initial?: MatState; actions?: MatAction[]; cards?: ReadonlyMap<string, MatCard> }) {
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
      cardsById={cards}
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
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
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
    // Invocación Normal, Colocar y la Especial son opciones aparte: la posición sólo se pregunta (después) en la Especial.
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent).slice(0, 3)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(screen.queryByRole('menu', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Tocá la zona para Invocación Normal')).toBeInTheDocument()
    // Se eligen sólo las cinco zonas principales: la Extra Monster Zone es para lo que viene del Extra Deck.
    expect(screen.getAllByRole('button', { name: /: elegir$/ }).map((cell) => cell.getAttribute('aria-label'))).toEqual(
      ['Zona de monstruo 1: elegir', 'Zona de monstruo 2: elegir', 'Zona de monstruo 3: elegir', 'Zona de monstruo 4: elegir', 'Zona de monstruo 5: elegir'],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Ash Blossom')).toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    // Jugando en vivo no hay controles de replay (sólo al ver un combo guardado).
    expect(screen.queryByRole('button', { name: 'Avance rápido' })).not.toBeInTheDocument()

    // Deshacer la devuelve a la mano y borra la jugada.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(hand()).getByRole('listitem', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('la carta de la que se ve el menú lleva un marco celeste mientras el menú está abierto, en la mano y en el campo', () => {
    render(<Harness />)

    const ash = within(hand()).getByRole('listitem', { name: 'Ash Blossom' })
    expect(ash).toHaveAttribute('data-selected', 'false')
    tap(ash)
    expect(ash).toHaveAttribute('data-selected', 'true')
    expect(ash.querySelector('[data-fx="frame"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    // Elegir cómo sale (la pregunta de la posición) no la suelta: sigue siendo la carta del menú.
    expect(ash).toHaveAttribute('data-selected', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const onField = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
    expect(onField).toHaveAttribute('data-selected', 'false')
    tap(onField)
    expect(onField).toHaveAttribute('data-selected', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onField).toHaveAttribute('data-selected', 'false')
  })

  it('el click fantasma del celular (justo después de abrir el menú) no lo cierra; un toque en el fondo más tarde, sí', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      const menu = screen.getByRole('menu', { name: 'Ash Blossom' })

      fireEvent.click(menu.parentElement!)
      expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()

      vi.advanceTimersByTime(400)
      fireEvent.click(menu.parentElement!)
      expect(screen.queryByRole('menu', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('las seis fases van arriba del campo; tocar una la enciende y queda anotada, y de la End Phase a la Draw Phase cambia el turno', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Draw Phase' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Turno 1')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Battle Phase' }))
    expect(screen.getByRole('button', { name: 'Battle Phase' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Draw Phase' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()

    // Turno nuevo: Draw Phase y se roba sola la carta del tope.
    fireEvent.click(screen.getByRole('button', { name: 'End Phase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Draw Phase' }))
    expect(screen.getByLabelText('Turno 2')).toBeInTheDocument()
    expect(within(status()).getByText('Turno 2: Draw Phase, robás Imperm')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Main: 0' })).toBeInTheDocument()
  })

  it('arrastrar una carta al cementerio la manda ahí; tocar el deck ofrece robar', () => {
    render(<Harness />)

    const gy = screen.getByRole('button', { name: 'GY: 0' })
    document.elementFromPoint = () => gy
    document.elementsFromPoint = () => [gy]

    const maxx = within(hand()).getByRole('listitem', { name: 'Maxx C' })
    fireEvent.pointerDown(maxx, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(maxx, { ...pointer, clientX: 80, clientY: 120 })

    expect(screen.getByRole('button', { name: 'GY: 1' })).toBeInTheDocument()
    expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()

    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(screen.getByRole('button', { name: 'Main: 0' })).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(within(status()).getByText('Robás Imperm')).toBeInTheDocument()
  })

  /** Arrastra una carta de la mano hasta una zona (la que devuelve `elementFromPoint`) y la suelta. */
  const dragToZone = (name: string, target: HTMLElement) => {
    document.elementFromPoint = () => target
    document.elementsFromPoint = () => [target]

    const dragged = within(hand()).getByRole('listitem', { name })
    fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(dragged, { ...pointer, clientX: 80, clientY: 120 })
  }
  const waitingIn = (target: HTMLElement) => target.querySelector('[data-pending="true"]')

  it('soltar una carta de la mano en una zona la deja ahí y pregunta cómo sale: Invocación Normal, Colocar o Especial, y la posición después', () => {
    render(<Harness />)

    const mz1 = zone('Zona de monstruo 1')
    dragToZone('Ash Blossom', mz1)

    // La carta se queda en la zona (no vuelve a la mano) mientras se elige; el menú es el de tocarla, sólo con lo que la saca ahí.
    expect(waitingIn(mz1)).toHaveAttribute('data-card-id', 'card-1-1')
    expect(waitingIn(mz1)).toHaveAttribute('aria-hidden', 'true')
    expect(waitingIn(mz1)?.querySelector('[data-fx="frame"]')).not.toBeNull()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(4)
    const menu = screen.getByRole('menu', { name: 'Ash Blossom' })
    expect(within(menu).getByText('Zona de monstruo 1')).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])

    // La posición se pregunta después, en el mismo menú, y la carta sigue en la zona.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invocación Especial' }))
    const question = screen.getByRole('menu', { name: 'Ash Blossom' })
    expect(within(question).getByText('Invocación Especial')).toBeInTheDocument()
    expect(within(question).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    expect(waitingIn(mz1)).not.toBeNull()
    fireEvent.click(within(question).getByRole('menuitem', { name: 'En defensa' }))

    expect(waitingIn(mz1)).toBeNull()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Especial de Ash Blossom en defensa')).toBeInTheDocument()
    // Ya estaba en la zona: el destello no espera ningún vuelo desde la mano.
    expect(mz1.querySelector('[data-fx="landing"] span')).toHaveStyle({ animationDelay: '0ms' })

    // Soltada en una zona extra de monstruo, una carta de la mano no cae: esa zona es para lo que viene del Extra Deck.
    const emz1 = zone('Zona extra de monstruo 1')
    dragToZone('Maxx C', emz1)
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
    expect(waitingIn(emz1)).toBeNull()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()

    // Una Mágica soltada en la zona de Mágicas y Trampas: Activar o Colocar (las posiciones ya las fija la jugada: no hay pregunta).
    const st1 = zone('Zona de magia y trampa 1')
    dragToZone('Called by the Grave', st1)
    expect(waitingIn(st1)).not.toBeNull()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    expect(waitingIn(st1)).toBeNull()
    expect(within(zone('Zona de magia y trampa 1')).getByRole('button', { name: 'Called by the Grave, boca abajo' })).toBeInTheDocument()
  })

  it('una Invocación Normal soltada en la zona sale por la opción sin preguntar nada más', () => {
    render(<Harness />)

    const mz2 = zone('Zona de monstruo 2')
    dragToZone('Maxx C', mz2)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Maxx C' })).getByRole('menuitem', { name: 'Invocación Normal' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(waitingIn(mz2)).toBeNull()
    expect(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Maxx C')).toBeInTheDocument()
  })

  it('si se cierra el menú sin elegir, la carta soltada vuelve a la mano', () => {
    render(<Harness />)

    const mz3 = zone('Zona de monstruo 3')
    dragToZone('Maxx C', mz3)
    expect(waitingIn(mz3)).not.toBeNull()
    expect(within(hand()).queryByRole('listitem', { name: 'Maxx C' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(waitingIn(mz3)).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
    // No hubo jugada: nada quedó anotado.
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('por Sacrificio, la carta soltada espera en la zona mientras se eligen los Sacrificios; cancelar la devuelve a la mano', () => {
    const cards = new Map([...CARDS, ['card-8-1', { name: 'Blue-Eyes', apiCard: { ...card(8, 'normal'), level: 8 } }]])
    const initial = replayMat(createMatState(['card-8-1', 'card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'], ['card-7-1'], 5), [
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'atk' },
    ])
    render(<Harness initial={initial} cards={cards} />)

    const mz3 = zone('Zona de monstruo 3')
    dragToZone('Blue-Eyes', mz3)
    const menu = screen.getByRole('menu', { name: 'Blue-Eyes' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación por Sacrificio (2)', 'Colocar por Sacrificio (2)', 'Invocación Especial'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invocación por Sacrificio (2)' }))

    // El menú se fue pero la carta sigue en la zona, esperando los Sacrificios.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('Tocá 2 monstruos para sacrificar (0/2)')).toBeInTheDocument()
    expect(waitingIn(mz3)).toHaveAttribute('data-card-id', 'card-8-1')
    expect(within(hand()).queryByRole('listitem', { name: 'Blue-Eyes' })).not.toBeInTheDocument()

    // Cancelar la devuelve a la mano.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(waitingIn(mz3)).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()

    // De nuevo, y esta vez se sacrifican los dos monstruos: sale en la zona donde se soltó.
    dragToZone('Blue-Eyes', mz3)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Blue-Eyes' })).getByRole('menuitem', { name: 'Invocación por Sacrificio (2)' }))
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    expect(waitingIn(mz3)).not.toBeNull()
    tap(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' }))

    expect(waitingIn(mz3)).toBeNull()
    expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Blue-Eyes' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación por Sacrificio de Blue-Eyes (sacrificás Ash Blossom y Maxx C)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 2' })).toBeInTheDocument()
  })

  it('la ficha pide la posición (en ataque o en defensa) al soltarla o al tocarla, y se ve con la imagen de una ficha', () => {
    render(<Harness />)

    // Arrastrada, la ficha es una carta con su imagen; soltada en una zona libre pregunta la posición ahí mismo.
    const mz4 = zone('Zona de monstruo 4')
    document.elementFromPoint = () => mz4
    document.elementsFromPoint = () => [mz4]
    const plus = within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Ficha' })
    fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
    expect(document.querySelectorAll('img[src$="/cards_small/73915052.jpg"]')).toHaveLength(1)
    fireEvent.pointerUp(plus, { ...pointer, clientX: 80, clientY: 120 })

    const dropped = screen.getByRole('menu', { name: 'Ficha' })
    expect(within(dropped).getByText('Zona de monstruo 4')).toBeInTheDocument()
    expect(within(dropped).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    fireEvent.click(within(dropped).getByRole('menuitem', { name: 'En ataque' }))
    expect(within(zone('Zona de monstruo 4')).getByRole('button', { name: 'Ficha' })).toBeInTheDocument()
    expect(within(status()).getByText('Ficha en ataque, zona 4')).toBeInTheDocument()

    // Soltada en una zona extra no pasa nada: una ficha no viene del Extra Deck.
    const emz1 = zone('Zona extra de monstruo 1')
    document.elementFromPoint = () => emz1
    document.elementsFromPoint = () => [emz1]
    fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(plus, { ...pointer, clientX: 80, clientY: 120 })
    expect(screen.queryByRole('menu', { name: 'Ficha' })).not.toBeInTheDocument()

    // Tocada, pregunta la posición y después la zona (sólo las principales).
    tap(plus)
    const menu = screen.getByRole('menu', { name: 'Ficha' })
    expect(within(menu).getByText('Invocación Especial')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'En defensa' }))
    expect(within(status()).getByText('Tocá la zona para la ficha')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /: elegir$/ })).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const token = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ficha, en defensa' })
    expect(within(token).getByRole('img', { name: 'Ficha' })).toHaveAttribute('src', '/api/card-image/cards_small/73915052.jpg')
    expect(within(status()).getByText('Ficha en defensa, zona 1')).toBeInTheDocument()

    // Como en DuelingBook: mover, seleccionar, pasar a ataque y quitar.
    tap(token)
    expect(within(screen.getByRole('menu', { name: 'Ficha' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Pasar a ataque', 'Contador +1', 'Seleccionar', 'Quitar la ficha'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pasar a ataque' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ficha' })).toBeInTheDocument()
  })

  it('desde el Extra, la Invocación Especial pide tocar los materiales en el campo y confirmar', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))

    expect(within(status()).getByText('Tocá los materiales en el campo (0) y confirmá')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom (Material)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    // Quedan varias zonas para elegir, incluida la de Ash (que se va como material y sigue marcada): tocar a Ash elige esa zona.
    tap(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).getByRole('button', { name: 'Ash Blossom (Material)' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Xyz de Zeus (materiales: Ash Blossom)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
  })

  it('al avanzar un paso del replay, activar un efecto destella la carta en el centro y marcar un objetivo sólo le pone el aro', () => {
    render(<Harness actions={[{ type: 'activate', id: 'card-1-1' }, { type: 'target', id: 'card-2-1' }]} />)

    expect(document.querySelector('[data-activation]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(document.querySelector('[data-activation="card-1-1"]')).not.toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Ash Blossom' })).toHaveAttribute('data-flash', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(document.querySelector('[data-activation]')).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C (seleccionada)' })).toHaveAttribute('data-flash', 'true')
  })

  it('mostrar o declarar una carta la pone grande en el centro con una línea de lo que pasó, cada uno con su color', () => {
    render(<Harness actions={[{ type: 'activate', id: 'card-1-1' }, { type: 'reveal', id: 'card-2-1' }, { type: 'declare', id: 'card-3-1' }]} />)

    const spotlight = () => document.querySelector('[data-activation]')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'activate')
    expect(spotlight()).toHaveTextContent(/Ash Blossom/)
    expect(spotlight()?.querySelector('[data-fx="frame"]')).toHaveAttribute('data-shine', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'reveal')
    expect(spotlight()).toHaveTextContent('Revelás Maxx C')
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toHaveAttribute('data-flash-kind', 'reveal')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'declare')
    expect(spotlight()).toHaveTextContent('Declarás Called by the Grave')
  })

  it('al reproducir un combo cada paso que mueve cartas las muestra grandes con su nombre y lo que pasó; las que salen del deck se dan vuelta; en vivo, no', () => {
    // Mano: Ash, Maxx C, Called, Nibiru, Droll; el deck guarda a Imperm.
    render(<Harness actions={[{ type: 'draw', count: 1 }, { type: 'move', id: 'card-2-1', to: 'gy' }]} />)

    const spotlight = () => document.querySelector('[data-activation]')
    expect(spotlight()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'hand')
    expect(spotlight()).toHaveTextContent('Robás Imperm')
    expect(spotlight()?.querySelector('figcaption')).toHaveTextContent('Imperm')
    // Sale del deck: aparece de dorso y se da vuelta en 3D; la mano se enmarca porque recibió una carta.
    expect(spotlight()?.querySelector('.animate-fx-flip-in')).not.toBeNull()
    expect(document.querySelector('[data-fx="hand"]')).not.toBeNull()

    // De la mano al cementerio: se ve la carta (que ya estaba a la vista, sin darse vuelta) y su paso.
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'gy')
    expect(spotlight()).toHaveTextContent('Maxx C')
    expect(spotlight()?.querySelector('.animate-fx-flip-in')).toBeNull()
  })

  it('deshacer corta lo que estaba en curso: la carta grande del paso y el destello de la zona', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      expect(document.querySelector('[data-activation]')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(document.querySelector('[data-activation]')).toBeNull()

      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      expect(document.querySelector('[data-fx="landing"]')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('jugando en vivo, robar enmarca la mano pero no agranda la carta', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(document.querySelector('[data-fx="hand"]')).not.toBeNull()
    expect(document.querySelector('[data-activation]')).toBeNull()
  })

  it('marcar un objetivo lo cubre con la mira; cambiar de fase muestra el cartel y una invocación cae con su destello, y se van solos', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)

      // La mira (con su nombre accesible) queda sobre la carta marcada y se va al quitar la marca.
      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Seleccionar' }))
      const marked = within(hand()).getByRole('listitem', { name: 'Maxx C (seleccionada)' })
      expect(marked).toHaveAttribute('data-targeted', 'true')
      expect(within(marked).getByRole('img', { name: 'Seleccionada' })).toHaveAttribute('data-fx', 'target')
      tap(marked)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar selección' }))
      expect(document.querySelector('[data-fx="target"]')).toBeNull()

      // Una Invocación Normal: el destello cae en la zona (dorado) y espera a que la carta aterrice.
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      const burst = zone('Zona de monstruo 1').querySelector('[data-fx="landing"]')
      expect(burst).toHaveAttribute('data-tone', 'normal')
      expect(burst?.querySelector('span')).toHaveStyle({ animationDelay: '360ms' })
      expect(zone('Zona de monstruo 2').querySelector('[data-fx="landing"]')).toBeNull()

      // Una fase nueva: el cartel con su nombre; y de la End Phase a la Draw Phase, con el turno.
      fireEvent.click(screen.getByRole('button', { name: 'Main Phase 1' }))
      expect(document.querySelector('[data-fx="banner"]')).toHaveTextContent('Main Phase 1')
      fireEvent.click(screen.getByRole('button', { name: 'End Phase' }))
      fireEvent.click(screen.getByRole('button', { name: 'Draw Phase' }))
      expect(document.querySelector('[data-fx="banner"]')).toHaveTextContent('Turno 2Draw Phase')

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()
      expect(document.querySelector('[data-fx="banner"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('seleccionar una carta del cementerio o del destierro le pone la mira en el visor y en la casilla, y el visor sigue abierto', () => {
    render(<Harness />)

    // Maxx C al cementerio y Nibiru al destierro, desde sus menús.
    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca arriba' }))

    const gy = () => screen.getByRole('button', { name: 'GY: 1' })
    const banish = () => screen.getByRole('button', { name: 'Banish: 1' })
    expect(gy()).toHaveAttribute('data-targeted', 'false')
    expect(gy().querySelector('[data-fx="target"]')).toBeNull()

    fireEvent.click(gy())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 1' })).getByRole('button', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Seleccionar' }))

    // Seleccionar no mueve la carta: el visor sigue abierto, con la mira sobre ella, y la casilla también la lleva.
    const viewer = screen.getByRole('dialog', { name: 'GY · 1' })
    const tile = within(viewer).getByRole('button', { name: 'Maxx C (seleccionada)' })
    expect(tile.querySelector('[data-fx="target"]')).not.toBeNull()
    expect(tile.querySelector('[data-targeted="true"]')).not.toBeNull()
    expect(gy()).toHaveAttribute('data-targeted', 'true')
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
    expect(within(status()).getByText('Seleccionás Maxx C')).toBeInTheDocument()

    // El destierro, igual.
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    fireEvent.click(banish())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Seleccionar' }))
    expect(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru (seleccionada)' }).querySelector('[data-fx="target"]')).not.toBeNull()
    expect(banish().querySelector('[data-fx="target"]')).not.toBeNull()

    // Quitar la selección saca la mira de las dos partes.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru (seleccionada)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar selección' }))
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Banish · 1' }).querySelector('[data-fx="target"]')).toBeNull()
    // La del cementerio sigue marcada.
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
  })

  it('el visor del deck: sacar una carta de ahí baraja el resto en la misma jugada; cerrarlo sin sacar nada baraja aparte', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))

    const viewer = screen.getByRole('dialog', { name: 'Main · 1' })
    fireEvent.click(within(viewer).getByRole('button', { name: 'Imperm' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))

    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Main · 1' })).not.toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    expect(within(status()).getByText('Buscás Imperm del deck a la mano y barajás')).toBeInTheDocument()

    // Un solo paso: deshacer devuelve la carta al deck.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByRole('button', { name: 'Main: 1' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()

    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Main · 1' })).getByRole('button', { name: 'Cerrar' }))
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    expect(within(status()).getByText('Barajás el deck')).toBeInTheDocument()
  })

  it('cada visor arranca sin filtro: lo buscado en el deck no se hereda al abrirlo de nuevo', () => {
    // Doce cartas: el deck queda con diez y muestra el buscador (sale con más de ocho).
    const ids = [...CARDS.keys(), 'card-1-2', 'card-2-2', 'card-3-2', 'card-4-2', 'card-5-2']
    render(<Harness initial={createMatState(ids, [], 2)} />)

    const openDeck = () => {
      tap(screen.getByRole('button', { name: 'Main: 10' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
      return screen.getByRole('dialog', { name: 'Main · 10' })
    }

    const viewer = openDeck()
    fireEvent.change(within(viewer).getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: 'nib' } })
    expect(within(viewer).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(within(status()).getByText('Barajás el deck')).toBeInTheDocument()

    const reopened = openDeck()
    expect(within(reopened).getByRole('searchbox', { name: 'Buscar carta' })).toHaveValue('')
    expect(within(reopened).getAllByRole('listitem')).toHaveLength(10)
  })

  it('guarda el combo con nombre, lo lista y lo reproduce paso a paso', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'En defensa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    tap(within(hand()).getByRole('listitem', { name: 'Called by the Grave' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de magia y trampa 1: elegir' }))

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

    // Se reproduce solo (botones redondos de pausa y avance rápido); la lista de pasos lleva la última jugada arriba.
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Avance rápido' }))
    expect(screen.getByRole('button', { name: 'Avance rápido' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(aside).getByRole('radio', { name: 'Pasos' }))
    expect(within(within(aside).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((item) => item.textContent)).toEqual(['2Colocás Called by the Grave', '1Invocación Especial de Ash Blossom en defensa', '0Mano inicial'])

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
    expect(within(status()).getByText('1/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Especial de Ash Blossom en defensa')).toBeInTheDocument()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(zone('Zona de magia y trampa 1')).getByRole('button', { name: 'Called by the Grave, boca abajo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    // Una jugada nueva a mitad de la reproducción deja de lado lo que seguía.
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Nibiru')).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Called by the Grave' })).toBeInTheDocument()
  })
})
