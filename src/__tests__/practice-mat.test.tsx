// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Profiler, useEffect, type ReactElement } from 'react'
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

/** Cuántas veces se dibujó la mesa (un commit de React): para ver que un arrastre no la vuelve a dibujar. */
let commits = 0
const countCommit = () => {
  commits += 1
}

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
    <Profiler id="mat" onRender={countCommit}>
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
    </Profiler>
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

  it('en el celular las fases van abajo, solas y centradas (sin texto al lado: ya están Deshacer arriba y la lista de pasos); el campo no las lleva', () => {
    render(<Harness />)

    const phases = screen.getByRole('group', { name: 'Fases' })

    expect(within(screen.getByLabelText('Campo')).queryByRole('button', { name: 'Battle Phase' })).not.toBeInTheDocument()
    expect(within(phases).getAllByRole('button')).toHaveLength(6)
    expect(within(phases).getByRole('button', { name: 'Draw Phase' })).toHaveAttribute('aria-pressed', 'true')
    // La barra las centra y el estado (la pista, la última jugada) queda sólo para el lector de pantalla: a la vista no hay nada más que las fases.
    expect(phases.parentElement).toHaveClass('justify-center')
    expect(status()).toHaveClass('sr-only')

    fireEvent.click(within(phases).getByRole('button', { name: 'Battle Phase' }))
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()
    // En vivo no hay Anterior ni Siguiente: se vuelve con Deshacer, arriba.
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('en escritorio las fases siguen entre las zonas del campo', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') })) as typeof window.matchMedia

    try {
      render(<Harness />)

      expect(within(screen.getByLabelText('Campo')).getAllByRole('button', { name: /Phase( \d)?$/ })).toHaveLength(6)
      expect(screen.getAllByRole('group', { name: 'Fases' })).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: 'Battle Phase' }))
      expect(screen.getByRole('button', { name: 'Battle Phase' })).toHaveAttribute('aria-pressed', 'true')
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('la lista de pasos no repite nada: los cambios de fase hacen de separador y abajo no sobran ni Anterior / Siguiente ni el contador ni la frase de la última jugada', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Battle Phase' }))

    const list = within(screen.getByRole('complementary', { name: 'Pasos y combos' })).getByRole('list', { name: 'Jugadas' })
    const rows = within(list).getAllByRole('button')

    // De la última a la primera, con la frase de siempre (sin insignias ni encabezados que la repitan); el cambio de fase es el separador.
    expect(rows.map((row) => row.textContent)).toEqual(['2Pasás a la Battle Phase', '1Invocación Normal de Ash Blossom', '0Mano inicial'])
    expect(rows.map((row) => row.getAttribute('data-divider'))).toEqual(['true', 'false', 'false'])

    // Abajo: sin Anterior / Siguiente; el contador y la frase de la última jugada siguen en el estado, pero sólo para el lector de pantalla.
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
    expect(status()).toHaveClass('sr-only')
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()
  })

  it('el turno va arriba a la izquierda y los botones de la mesa, a la derecha', () => {
    render(<Harness />)

    const toolbar = screen.getByRole('toolbar', { name: 'Mesa' })

    expect(toolbar.firstElementChild).toBe(screen.getByLabelText('Turno 1'))
    expect(screen.getByRole('button', { name: 'Nueva mano' })).toHaveClass('ml-auto')
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
    // Eligiendo, lo que falta sí se ve (y las fases se van para dejarle el lugar).
    expect(status()).not.toHaveClass('sr-only')
    expect(screen.queryByRole('group', { name: 'Fases' })).not.toBeInTheDocument()
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

  describe('si la mesa cambia mientras la carta soltada espera que se elija cómo sale', () => {
    const cards = new Map([...CARDS, ['card-8-1', { name: 'Blue-Eyes', apiCard: { ...card(8, 'normal'), level: 8 } }]])
    /** Blue-Eyes y la Mágica quedan en la mano; Ash y Maxx (y, si se pide, Droll) están en las zonas de monstruo 1, 2 y 3. */
    const withField = (...ids: string[]) =>
      replayMat(
        createMatState(['card-8-1', 'card-1-1', 'card-2-1', 'card-5-1', 'card-3-1', 'card-4-1'], ['card-7-1'], 5),
        ids.map((id, index) => ({ type: 'place' as const, id, zone: 'mz' as const, index, pos: 'atk' as const })),
      )
    const dropBlueEyesForTributes = (target: HTMLElement) => {
      dragToZone('Blue-Eyes', target)
      fireEvent.click(within(screen.getByRole('menu', { name: 'Blue-Eyes' })).getByRole('menuitem', { name: 'Invocación por Sacrificio (2)' }))
      expect(waitingIn(target)).not.toBeNull()
    }

    it('deshacer cancela la selección de Sacrificios y la carta soltada vuelve a la mano, no desaparece', () => {
      render(<Harness initial={withField('card-1-1', 'card-2-1', 'card-5-1')} cards={cards} />)
      const mz3 = zone('Zona de monstruo 3')

      // Droll al cementerio libera la zona 3 (y deja una jugada para deshacer); ahí se suelta Blue-Eyes por Sacrificio.
      tap(within(mz3).getByRole('button', { name: 'Droll' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
      dropBlueEyesForTributes(mz3)

      // Deshacer devuelve a Droll a la zona 3: ya no hay nada esperando ahí, la selección se cerró y Blue-Eyes está en la mano.
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Droll' })).toBeInTheDocument()
      expect(waitingIn(zone('Zona de monstruo 3'))).toBeNull()
      expect(within(status()).queryByText(/Tocá 2 monstruos/)).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })

    it('arrastrar un monstruo del campo a la zona donde espera la carta cancela la selección y la carta vuelve a la mano', () => {
      render(<Harness initial={withField('card-1-1', 'card-2-1')} cards={cards} />)
      const mz3 = zone('Zona de monstruo 3')

      dropBlueEyesForTributes(mz3)

      // Ash (zona 1) arrastrado a la zona 3, que se ve ocupada por la carta que espera pero para la mesa está libre.
      const ash = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
      document.elementFromPoint = () => mz3
      document.elementsFromPoint = () => [mz3]
      fireEvent.pointerDown(ash, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(ash, { ...pointer, clientX: 40, clientY: 60 })
      fireEvent.pointerMove(ash, { ...pointer, clientX: 80, clientY: 120 })
      fireEvent.pointerUp(ash, { ...pointer, clientX: 80, clientY: 120 })

      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(waitingIn(zone('Zona de monstruo 3'))).toBeNull()
      expect(within(status()).queryByText(/Tocá 2 monstruos/)).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })

    it('deshacer a mitad de la selección no deja anotar después una invocación que no pasó: lo que se toca vuelve a ser una carta común', () => {
      render(<Harness initial={withField('card-1-1')} cards={cards} />)

      // Maxx C entra por su menú (la jugada que se va a deshacer) y se suelta Blue-Eyes por Sacrificio en la zona 4.
      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
      dropBlueEyesForTributes(zone('Zona de monstruo 4'))
      tap(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' }))
      expect(within(status()).getByText('Tocá 2 monstruos para sacrificar (1/2)')).toBeInTheDocument()

      // Deshacer saca a Maxx del campo: la selección ya no vale, y tocar a Ash abre su menú en vez de contar como el segundo Sacrificio.
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))

      expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(within(status()).queryByText(/Invocación por Sacrificio/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })
  })

  it('abrir un menú (tocando una carta o soltándola en una zona) pausa la reproducción del combo', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar combo' }))
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Uno' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    const aside = screen.getByRole('complementary', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    fireEvent.click(within(aside).getByRole('button', { name: 'Cargar Uno' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()

    // Tocar una carta abre su menú y pausa: si no, los pasos seguirían avanzando por debajo de lo que se elige.
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Soltarla en una zona (el menú de soltar) también.
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    dragToZone('Ash Blossom', zone('Zona de monstruo 3'))
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
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

    // Como en DuelingBook: mover, target, pasar a ataque y quitar.
    tap(token)
    expect(within(screen.getByRole('menu', { name: 'Ficha' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Pasar a ataque', 'Contador +1', 'Target', 'Quitar la ficha'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pasar a ataque' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ficha' })).toBeInTheDocument()
  })

  describe('al arrastrar una carta, la zona de abajo se enciende sin volver a dibujar la mesa', () => {
    // Acá los cuadros se juntan y se sueltan a mano, como en el navegador (el de los demás tests corre de inmediato y sólo deja pasar el primer movimiento).
    let frames: FrameRequestCallback[] = []
    const flush = () => act(() => { frames.splice(0).forEach((frame) => frame(0)) })
    const lit = () => [...document.querySelectorAll('[data-over="true"]')].map((element) => element.getAttribute('data-drop'))
    const over = (target: HTMLElement) => {
      document.elementFromPoint = () => target
      document.elementsFromPoint = () => [target]
    }

    beforeEach(() => {
      frames = []
      window.requestAnimationFrame = (callback) => {
        frames.push(callback)
        return frames.length
      }
    })

    it('desde la mano: se enciende la zona que se cruza y se apaga la anterior; al soltar o cancelar no queda ninguna', () => {
      render(<Harness />)

      const mz2 = zone('Zona de monstruo 2')
      const gy = screen.getByRole('button', { name: 'GY: 0' })
      const dragged = within(hand()).getByRole('listitem', { name: 'Maxx C' })
      over(mz2)
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      // El movimiento se aplica en el cuadro siguiente.
      expect(lit()).toEqual([])
      flush()
      expect(lit()).toEqual(['mz:1'])
      const drawn = commits

      over(gy)
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
      flush()
      expect(lit()).toEqual(['gy'])
      expect(mz2).toHaveAttribute('data-over', 'false')
      over(zone('Zona de magia y trampa 3'))
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 90, clientY: 130 })
      flush()
      expect(lit()).toEqual(['st:2'])
      expect(commits).toBe(drawn)

      fireEvent.pointerCancel(dragged, { ...pointer, clientX: 90, clientY: 130 })
      expect(lit()).toEqual([])
      expect(within(status()).queryByText(/1\/1/)).not.toBeInTheDocument()

      // Soltada sobre una zona: se juega y tampoco queda ninguna encendida.
      over(gy)
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['gy'])
      fireEvent.pointerUp(dragged, { ...pointer, clientX: 40, clientY: 60 })
      expect(lit()).toEqual([])
      expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()
    })

    it('desde la mesa (la ficha): lo mismo, y las pilas se encienden igual que las zonas', () => {
      render(<Harness />)

      const plus = within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Ficha' })
      over(zone('Zona de monstruo 4'))
      fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['mz:3'])
      const drawn = commits

      over(screen.getByRole('button', { name: 'Banish: 0' }))
      fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
      flush()
      expect(lit()).toEqual(['banished'])
      over(screen.getByRole('button', { name: 'Main: 1' }))
      fireEvent.pointerMove(plus, { ...pointer, clientX: 90, clientY: 130 })
      flush()
      expect(lit()).toEqual(['deck'])
      expect(commits).toBe(drawn)

      // Soltada en el deck no se juega nada; cancelada, tampoco.
      fireEvent.pointerUp(plus, { ...pointer, clientX: 90, clientY: 130 })
      expect(lit()).toEqual([])
      over(zone('Zona de monstruo 1'))
      fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['mz:0'])
      fireEvent.pointerCancel(plus, { ...pointer, clientX: 40, clientY: 60 })
      expect(lit()).toEqual([])
      expect(screen.queryByRole('menu', { name: 'Ficha' })).not.toBeInTheDocument()
    })

    it('la carta de la mano sigue al puntero por su transform, y volver a dibujar la mano a mitad del arrastre no la devuelve a su lugar', () => {
      render(<Harness />)

      const dragged = within(hand()).getByRole('listitem', { name: 'Maxx C' })
      const atRest = /^translate3d\(.+px, .+px, 0\) rotate\(.+deg\)$/
      expect(dragged).toHaveAttribute('data-state', 'rest')
      expect(dragged.style.transform).toMatch(atRest)

      document.elementsFromPoint = () => []
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      // Levantada de entrada (sin esperar al cuadro): ya no lleva la transición del transform.
      expect(dragged).toHaveAttribute('data-state', 'dragging')
      expect(dragged.style.zIndex).toBe('100')
      flush()
      expect(dragged.style.transform).toContain('perspective(900px)')
      const following = dragged.style.transform

      // Una vecina cambia de lugar (se reordena la mano): la carta arrastrada sigue donde la puso el puntero.
      fireEvent.keyDown(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }), { key: 'ArrowRight' })
      expect(dragged.style.transform).toBe(following)

      fireEvent.pointerUp(dragged, { ...pointer, clientX: 40, clientY: 60 })
      expect(dragged).toHaveAttribute('data-state', 'rest')
      expect(dragged.style.transform).toMatch(atRest)
    })
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
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })).toHaveAttribute('data-flash', 'true')
  })

  it('mostrar o declarar una carta la pone grande en el centro con una línea de lo que pasó, cada uno con su color', () => {
    render(<Harness actions={[{ type: 'activate', id: 'card-1-1' }, { type: 'reveal', id: 'card-2-1' }, { type: 'declare', id: 'card-3-1' }]} />)

    const spotlight = () => document.querySelector('[data-activation]')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'activate')
    // Las cartas grandes se dibujan sobre la mesa (centradas en ella), no en un portal sobre toda la pantalla.
    expect(screen.getByRole('region', { name: 'Mesa de práctica' })).toContainElement(spotlight() as HTMLElement)
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
      fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
      const marked = within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })
      expect(marked).toHaveAttribute('data-targeted', 'true')
      expect(within(marked).getByRole('img', { name: 'Target' })).toHaveAttribute('data-fx', 'target')
      tap(marked)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar target' }))
      expect(document.querySelector('[data-fx="target"]')).toBeNull()

      // Una Invocación Normal: el destello cae en la zona (dorado) y espera a que la carta aterrice.
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      const burst = zone('Zona de monstruo 1').querySelector('[data-fx="landing"]')
      expect(burst).toHaveAttribute('data-tone', 'normal')
      expect(burst?.querySelector('span')).toHaveStyle({ animationDelay: '360ms' })
      expect(zone('Zona de monstruo 2').querySelector('[data-fx="landing"]')).toBeNull()

      // Una fase nueva: el cartel con su nombre y nada más (sin los círculos de las seis fases, que ya están en los botones); y de la End Phase a la Draw Phase, con el turno.
      fireEvent.click(screen.getByRole('button', { name: 'Main Phase 1' }))
      expect(document.querySelector('[data-fx="banner"]')?.textContent).toBe('Main Phase 1')
      fireEvent.click(screen.getByRole('button', { name: 'End Phase' }))
      fireEvent.click(screen.getByRole('button', { name: 'Draw Phase' }))
      expect(document.querySelector('[data-fx="banner"]')?.textContent).toBe('Turno 2Draw Phase')

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()
      expect(document.querySelector('[data-fx="banner"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('poner un target a una carta del cementerio o del destierro le pone la mira en el visor y en la casilla, y el visor sigue abierto', () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

    // Un target no mueve la carta: el visor sigue abierto, con la mira sobre ella, y la casilla también la lleva.
    const viewer = screen.getByRole('dialog', { name: 'GY · 1' })
    const tile = within(viewer).getByRole('button', { name: 'Maxx C (target)' })
    expect(tile.querySelector('[data-fx="target"]')).not.toBeNull()
    expect(tile.querySelector('[data-targeted="true"]')).not.toBeNull()
    expect(gy()).toHaveAttribute('data-targeted', 'true')
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
    expect(within(status()).getByText('Marcás Maxx C como target')).toBeInTheDocument()

    // El destierro, igual.
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    fireEvent.click(banish())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    expect(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru (target)' }).querySelector('[data-fx="target"]')).not.toBeNull()
    expect(banish().querySelector('[data-fx="target"]')).not.toBeNull()

    // Quitar el target saca la mira de las dos partes.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru (target)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar target' }))
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Banish · 1' }).querySelector('[data-fx="target"]')).toBeNull()
    // La del cementerio sigue marcada.
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
  })

  it('una carta desterrada boca abajo y marcada como target dice las dos cosas en el visor', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca abajo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Banish: 1' }))

    const viewer = () => screen.getByRole('dialog', { name: 'Banish · 1' })
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Nibiru (boca abajo)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

    // La mira se suma al "boca abajo": el nombre accesible no pierde ninguno de los dos.
    expect(within(viewer()).getByRole('button', { name: 'Nibiru (boca abajo) (target)' })).toBeInTheDocument()
  })

  it('las casillas de las pilas y sus cartas en el visor no van redondeadas (el reset global le da radio a todo <button>)', () => {
    render(<Harness />)

    for (const name of ['Extra: 1', 'GY: 0', 'Banish: 0']) {
      expect(screen.getByRole('button', { name })).toHaveClass('rounded-none')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    expect(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' })).toHaveClass('rounded-none')
  })

  it('las zonas del centro son cuadradas y las de los costados, de carta: acostada en defensa, la carta mide lo mismo que parada y no pisa a la vecina', () => {
    const initial = replayMat(INITIAL, [
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'def' },
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'atk' },
      { type: 'place', id: 'card-3-1', zone: 'field', index: 0, pos: 'atk' },
    ])
    render(<Harness initial={initial} />)

    // Cuadradas: la carta parada ocupa el alto de la casilla y la acostada, el ancho; así dos en defensa, una al lado de la otra, no se tocan.
    for (const name of ['Zona de monstruo 1', 'Zona de magia y trampa 1', 'Zona extra de monstruo 1']) {
      expect(zone(name)).toHaveClass('aspect-square')
    }

    // Las de los costados tienen la forma de una carta (la de campo y las pilas nunca se acuestan), y miden 0,6857 de una del centro.
    expect(screen.getByLabelText('Campo')).toHaveClass('grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)]')
    for (const cell of [zone('Zona de campo'), ...['Main: 1', 'Extra: 1', 'GY: 0', 'Banish: 0'].map((name) => screen.getByRole('button', { name }))]) {
      expect(cell).toHaveClass('aspect-[421/614]')
      expect(cell).not.toHaveClass('aspect-square')
    }

    // En una casilla cuadrada la carta mide el alto de la casilla y 421/614 de ancho, parada o acostada; sólo cambia el giro.
    const sideways = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })
    const upright = within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' })

    for (const placed of [sideways, upright]) {
      expect(placed).toHaveClass('aspect-[421/614]', 'w-[68.57%]')
    }

    expect(sideways).toHaveClass('[transform:rotate(90deg)]')
    expect(upright).not.toHaveClass('[transform:rotate(90deg)]')
    // La casilla de campo tiene el tamaño de la carta: la llena.
    expect(within(zone('Zona de campo')).getByRole('button', { name: 'Called by the Grave' })).toHaveClass('w-full')
  })

  describe('los controles del replay (como los de YGOPocket)', () => {
    // Mano inicial, robar, y las fases Battle, End y Draw (que empieza el turno 2).
    const ACTIONS: MatAction[] = [{ type: 'draw', count: 1 }, { type: 'phase', phase: 'battle' }, { type: 'phase', phase: 'end' }, { type: 'phase', phase: 'draw' }]
    const slider = () => screen.getByRole('slider', { name: 'Línea de tiempo del replay' })

    it('viendo un combo hay reiniciar, anterior, reproducir, siguiente, la línea de tiempo, la lista de pasos y la velocidad; en vivo, no', () => {
      const { unmount } = render(<Harness />)
      expect(screen.queryByRole('group', { name: 'Controles del replay' })).not.toBeInTheDocument()
      unmount()

      render(<Harness actions={ACTIONS} />)
      const bar = screen.getByRole('group', { name: 'Controles del replay' })

      expect(within(bar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        'Volver al principio',
        'Anterior',
        'Reproducir',
        'Siguiente',
        'Ver los pasos',
        'Velocidad: 1×',
      ])
      // Al principio no hay a dónde volver.
      expect(within(bar).getByRole('button', { name: 'Volver al principio' })).toBeDisabled()
      expect(within(bar).getByRole('button', { name: 'Anterior' })).toBeDisabled()
    })

    it('la línea de tiempo tiene una pastilla por paso (y la mano inicial), marca los cambios de fase y separa los turnos', () => {
      render(<Harness actions={ACTIONS} />)

      const pills = [...slider().querySelectorAll('[data-state]')]
      expect(pills).toHaveLength(5)
      expect(pills.map((pill) => pill.getAttribute('data-state'))).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
      expect(pills.map((pill) => pill.hasAttribute('data-phase'))).toEqual([false, false, true, true, true])
      // El turno 2 empieza con la última jugada: una sola línea, antes de su pastilla.
      expect(slider().querySelectorAll('[data-fx="turn"]')).toHaveLength(1)
      expect(slider().querySelector('[data-fx="turn"]')?.nextElementSibling).toBe(pills[4])

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect([...slider().querySelectorAll('[data-state]')].map((pill) => pill.getAttribute('data-state'))).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
    })

    it('la línea de tiempo se maneja con el teclado como un deslizador y se toca o arrastra para ir a un paso', () => {
      render(<Harness actions={ACTIONS} />)
      const status = () => within(screen.getByRole('status', { name: 'Paso actual' }))

      expect(slider()).toHaveAttribute('aria-valuenow', '0')
      expect(slider()).toHaveAttribute('aria-valuetext', 'Mano inicial')
      fireEvent.keyDown(slider(), { key: 'ArrowRight' })
      expect(slider()).toHaveAttribute('aria-valuenow', '1')
      expect(slider()).toHaveAttribute('aria-valuetext', 'Paso 1 de 4: Robás Imperm')
      expect(status().getByText('1/4')).toBeInTheDocument()
      fireEvent.keyDown(slider(), { key: 'End' })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
      fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
      expect(slider()).toHaveAttribute('aria-valuenow', '3')
      fireEvent.keyDown(slider(), { key: 'Home' })
      expect(slider()).toHaveAttribute('aria-valuenow', '0')

      // Tocar la línea: la posición dice el paso (cinco pastillas en 500 px).
      slider().getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 36, width: 500, height: 36, x: 0, y: 0, toJSON: () => ({}) })
      fireEvent.pointerDown(slider(), { ...pointer, clientX: 250 })
      expect(slider()).toHaveAttribute('aria-valuenow', '2')
      fireEvent.pointerMove(slider(), { ...pointer, clientX: 499 })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
      fireEvent.pointerUp(slider(), { ...pointer, clientX: 499 })
      // Soltada, ya no sigue al puntero.
      fireEvent.pointerMove(slider(), { ...pointer, clientX: 10 })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
    })

    it('volver al principio, la lista de pasos que se abre aparte y la velocidad con su menú', () => {
      render(<Harness actions={ACTIONS} />)

      fireEvent.keyDown(slider(), { key: 'End' })
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      expect(slider()).toHaveAttribute('aria-valuenow', '0')

      fireEvent.click(screen.getByRole('button', { name: 'Ver los pasos' }))
      expect(screen.getByRole('dialog', { name: 'Pasos y combos' })).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Pasos y combos' })).not.toBeInTheDocument()

      // 0,5× · 1× · 1,5× · 2×, con el elegido tildado.
      fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
      const menu = screen.getByRole('menu', { name: 'Velocidad' })
      expect(within(menu).getAllByRole('menuitemradio').map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([['0,5×', 'false'], ['1×', 'true'], ['1,5×', 'false'], ['2×', 'false']])
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('menu', { name: 'Velocidad' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
      fireEvent.click(within(screen.getByRole('menu', { name: 'Velocidad' })).getByRole('menuitemradio', { name: '0,5×' }))
      expect(screen.queryByRole('menu', { name: 'Velocidad' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Velocidad: 0,5×' })).toBeInTheDocument()
    })

    it('reproduce solo: cada paso espera 1,4 s a velocidad normal, la mitad a 2× y el doble a 0,5×; pausar lo frena', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

      try {
        render(<Harness actions={ACTIONS} />)

        fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
        act(() => {
          vi.advanceTimersByTime(1399)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '0')
        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '1')

        fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
        fireEvent.click(screen.getByRole('menuitemradio', { name: '2×' }))
        act(() => {
          vi.advanceTimersByTime(700)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '2')

        fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 2×' }))
        fireEvent.click(screen.getByRole('menuitemradio', { name: '0,5×' }))
        act(() => {
          vi.advanceTimersByTime(2799)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '2')
        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '3')

        fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
        act(() => {
          vi.advanceTimersByTime(10_000)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '3')
      } finally {
        vi.useRealTimers()
      }
    })
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

    // Se reproduce solo, con los controles del replay (el botón grande, la línea de tiempo y la velocidad); la lista de pasos lleva la última jugada arriba.
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Línea de tiempo del replay' })).toHaveAttribute('aria-valuemax', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '2×' }))
    expect(screen.getByRole('button', { name: 'Velocidad: 2×' })).toBeInTheDocument()
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

  it('un combo guardado se renombra desde la lista, sin tocar sus jugadas', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar combo' }))
    const saving = screen.getByRole('dialog', { name: 'Guardar combo' })
    fireEvent.change(within(saving).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Línea básica' } })
    fireEvent.click(within(saving).getByRole('button', { name: 'Guardar' }))

    const aside = screen.getByRole('complementary', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    fireEvent.click(within(aside).getByRole('button', { name: 'Renombrar Línea básica' }))

    // El campo arranca con el nombre de siempre y no repite el aviso de qué se guarda.
    const dialog = screen.getByRole('dialog', { name: 'Renombrar combo' })
    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveValue('Línea básica')
    expect(within(dialog).queryByText(/Se guardan la mano/)).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Apertura Ash' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(screen.queryByRole('dialog', { name: 'Renombrar combo' })).not.toBeInTheDocument()
    expect(within(aside).getByText('Apertura Ash')).toBeInTheDocument()
    expect(within(aside).queryByText('Línea básica')).not.toBeInTheDocument()

    const [saved] = JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]') as Array<{ name: string; actions: unknown[] }>
    expect(saved?.name).toBe('Apertura Ash')
    expect(saved?.actions).toHaveLength(1)
  })
})
