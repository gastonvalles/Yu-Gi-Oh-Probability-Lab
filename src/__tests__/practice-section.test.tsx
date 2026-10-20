// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { createMatState, type MatState } from '../app/practice-mat'
import { useMatSession } from '../app/use-mat-session'
import { buildPracticeDeck, evaluatePracticeHand } from '../components/probability/practice'

/** La fase de ahora es un solo botón en el medio del campo (el mismo que en un duelo): al tocarlo muestra las seis y elegir una pasa a ella. */
const goToPhase = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^Fases:/ }))
  fireEvent.click(screen.getByRole('menuitem', { name }))
}
import { PracticeSection } from '../components/probability/PracticeSection'
import type { CardEntry, CardRole } from '../types'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))
vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))
// La evaluación real, pero contada: para ver cuántas veces se vuelve a calcular la mano.
vi.mock('../components/probability/practice', async (importActual) => {
  const actual = await importActual<typeof import('../components/probability/practice')>()
  return { ...actual, evaluatePracticeHand: vi.fn(actual.evaluatePracticeHand) }
})

function card(id: string, name: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

const CARDS = [card('card-1', 'Starter', 2, ['starter']), card('card-2', 'Brick', 2, ['brick']), card('card-3', 'Relleno', 6, ['enabler'])]
const PATTERNS = [
  createMatcherPattern('Salida básica', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }]),
  createMatcherPattern('2 bricks', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }]),
]
const DECK = buildPracticeDeck(CARDS)
const CARDS_BY_ID = new Map(DECK.map((entry) => [entry.drawId, { name: entry.name, apiCard: entry.apiCard }]))
// Mano: Starter, Relleno ×3, Brick; el tope del deck es el otro Brick.
const ORDER = ['card-1-1', 'card-3-1', 'card-3-2', 'card-3-3', 'card-2-1', 'card-2-2', 'card-1-2', 'card-3-4', 'card-3-5', 'card-3-6']
const INITIAL = createMatState(ORDER, [], 5)

function Harness({ initial = INITIAL }: { initial?: MatState }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(initial)
  }, [start, initial])

  if (!mat.session || !mat.state) {
    return null
  }

  return (
    <PracticeSection
      handSize={5}
      derivedMainCards={CARDS}
      patterns={PATTERNS}
      hasCompletedClassification
      missingOriginCount={0}
      missingRoleCount={0}
      pendingReviewCount={0}
      reviewPendingPatternCount={0}
      session={mat.session}
      state={mat.state}
      cardsById={CARDS_BY_ID}
      deckName="Test"
      onDispatch={mat.dispatch}
      onUndo={mat.undo}
      onSeek={mat.seek}
      onLoadCombo={(combo) => start(combo.initial, combo.actions, combo.names)}
      // Una mano nueva es otro estado (como en la app): copia nueva de la misma.
      onNewHand={() => start({ ...INITIAL })}
    />
  )
}

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)
const hand = () => screen.getByRole('list', { name: 'Mano' })
const pointer = { button: 0, pointerId: 1 }
const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

describe('la práctica integrada en la mesa', () => {
  it('abre con las cinco cartas en la mano y las salidas debajo, sin veredicto; tocar una salida ilumina sus cartas', () => {
    render(<Harness />)

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    const openings = screen.getByRole('list', { name: 'Salidas' })
    const chip = within(openings).getByRole('button', { name: 'Salida básica' })
    expect(screen.queryByRole('list', { name: 'Problemas' })).not.toBeInTheDocument()

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(within(hand()).getByRole('listitem', { name: 'Starter' })).toHaveAttribute('data-glow', 'true')
    expect(within(hand()).getByRole('listitem', { name: 'Brick' })).toHaveAttribute('data-dim', 'true')
    expect(screen.getByRole('region', { name: 'Salida básica' })).toBeInTheDocument()

    // Tocar dentro de la explicación no la cierra; tocar en cualquier otro lado sí.
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Salida básica' }))
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(screen.getByRole('group', { name: 'Zona de monstruo 1' }))
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Salida básica' })).not.toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Brick' })).toHaveAttribute('data-dim', 'false')
  })

  it('sin ninguna salida, la mano se ve gris y el chip "Mano no jugable" explica qué faltó', () => {
    // Cinco cartas de relleno: no hay starter.
    render(<Harness initial={createMatState(['card-3-1', 'card-3-2', 'card-3-3', 'card-3-4', 'card-3-5', 'card-1-1', 'card-3-6'], [], 5)} />)

    expect(within(hand()).getAllByRole('listitem', { name: 'Relleno' })[0]).toHaveAttribute('data-muted', 'true')

    const chip = within(screen.getByRole('list', { name: 'Problemas' })).getByRole('button', { name: 'Mano no jugable' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    const why = screen.getByRole('region', { name: 'Mano no jugable' })
    expect(within(why).getByText(/Ninguna salida se cumple/)).toBeInTheDocument()
    expect(within(why).getByText('Salida básica:')).toBeInTheDocument()
    expect(within(why).getByText(/Falta/)).toBeInTheDocument()
  })

  it('robar la carta de ir 2º reevalúa la mano inicial: aparece el problema', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Main: 5' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(6)
    expect(within(screen.getByRole('list', { name: 'Problemas' })).getByRole('button', { name: '2 bricks' })).toBeInTheDocument()

    // Jugar una carta después ya no es evaluar la mano inicial: los chips se van, y vuelven al deshacer.
    tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByRole('list', { name: 'Salidas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Problemas' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' })).toBeInTheDocument()
  })

  it('con la primera jugada los chips de salidas y problemas desaparecen (y con ellos lo que marcan en la mano); al deshacerla vuelven', () => {
    render(<Harness />)

    const chip = within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' })

    fireEvent.click(chip)
    expect(within(hand()).getByRole('listitem', { name: 'Starter' })).toHaveAttribute('data-glow', 'true')

    // Cambiar de fase ya es empezar a jugar.
    goToPhase('Battle Phase')
    expect(screen.queryByRole('list', { name: 'Salidas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Salida básica' })).not.toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Starter' })).toHaveAttribute('data-glow', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' })).toBeInTheDocument()
  })

  it('una mano no jugable deja de verse gris cuando se empieza a jugar con ella', () => {
    render(<Harness initial={createMatState(['card-3-1', 'card-3-2', 'card-3-3', 'card-3-4', 'card-3-5', 'card-1-1', 'card-3-6'], [], 5)} />)

    expect(within(hand()).getAllByRole('listitem', { name: 'Relleno' })[0]).toHaveAttribute('data-muted', 'true')

    goToPhase('Battle Phase')
    expect(within(hand()).getAllByRole('listitem', { name: 'Relleno' })[0]).toHaveAttribute('data-muted', 'false')
    expect(screen.queryByRole('button', { name: 'Mano no jugable' })).not.toBeInTheDocument()
  })

  it('en el celular la explicación de un chip flota sobre los chips: no ocupa lugar, así que no corre el campo', () => {
    render(<Harness />)

    fireEvent.click(within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' }))

    const explanation = screen.getByRole('region', { name: 'Salida básica' })

    // Sale del flujo (sólo hasta 1100 px: en el panel de escritorio crece hacia arriba sobre la lista de pasos).
    expect(explanation.parentElement).toHaveClass('max-[1100px]:absolute', 'max-[1100px]:bottom-full')
    expect(explanation.parentElement?.parentElement).toHaveClass('max-[1100px]:relative')
  })

  it('en el celular las salidas y problemas flotan arriba de la mano y no ocupan lugar: aparecer o irse no corre el campo', () => {
    render(<Harness />)

    const overlay = screen.getByRole('list', { name: 'Salidas' }).closest('.absolute')

    expect(overlay).toHaveClass('bottom-full', 'pointer-events-none')
    // La mano es su ancla: cuelgan de arriba de ella.
    expect(overlay?.parentElement).toContainElement(hand())
  })

  it('en una pantalla angosta no hay panel de detalle: la carta se ve desde su menú', () => {
    render(<Harness />)

    expect(screen.queryByRole('region', { name: 'Detalle de la carta' })).not.toBeInTheDocument()
    // La barra de arriba (turno, nueva mano, deshacer, guardar) queda en la primera columna: no hay otra.
    expect(screen.getByRole('toolbar', { name: 'Mesa' })).not.toHaveClass('min-[1440px]:col-start-2')
  })

  it('en pantalla ancha el detalle de la carta que se toca queda fijo a la izquierda de la mesa (como en un duelo)', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1440') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<Harness />)

    // La columna está desde el principio (vacía hasta la primera carta): la mesa no se corre cuando se llena.
    const dock = screen.getByRole('region', { name: 'Detalle de la carta' })

    expect(dock).toHaveTextContent('Tocá una carta para ver su detalle acá.')
    // La barra de arriba va sobre la mesa (columna 2), no encima del detalle (columna 1): un día se la vio apilada sobre la carta.
    expect(screen.getByRole('toolbar', { name: 'Mesa' })).toHaveClass('min-[1440px]:col-start-2')

    tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
    expect(within(dock).getByRole('heading', { name: 'Starter' })).toBeInTheDocument()
    expect(dock).not.toHaveTextContent('Tocá una carta para ver su detalle acá.')

    tap(within(hand()).getByRole('listitem', { name: 'Brick' }))
    expect(within(dock).getByRole('heading', { name: 'Brick' })).toBeInTheDocument()
  })

  describe('el menú de una carta en escritorio', () => {
    /** Escritorio (desde 1101 px) con o sin el detalle fijo a la izquierda (desde 1440 px). */
    const desktop = (docked: boolean) => {
      window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || (docked && query.includes('1440')) || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    }

    it('con el detalle fijo a la izquierda no lleva «Ver carta» ni rasgos (ya está ahí); con menos ancho, «Ver carta» queda: es la forma de verlo', () => {
      desktop(true)
      const wide = render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
      expect(screen.getByRole('menu', { name: 'Starter' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Ver carta' })).not.toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Rasgos confirmados de los efectos' })).not.toBeInTheDocument()
      wide.unmount()

      desktop(false)
      render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
      expect(screen.getByRole('menuitem', { name: 'Ver carta' })).toBeInTheDocument()
    })

    it('una carta elegida en el visor del Deck también se muestra en el detalle fijo (sin «Ver carta» tiene que verse ahí)', () => {
      desktop(true)
      render(<Harness />)

      const dock = screen.getByRole('region', { name: 'Detalle de la carta' })

      tap(screen.getByRole('button', { name: /^Main: \d+/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: /Main/ })).getAllByRole('button', { name: /Brick/ })[0]!)
      expect(within(dock).getByRole('heading', { name: 'Brick' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Ver carta' })).not.toBeInTheDocument()
    })
  })

  it('el detalle fijo muestra la carta a la que se le pasa el mouse; un click la deja fija hasta un click afuera o en otra carta', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('1440') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<Harness />)

    const dock = screen.getByRole('region', { name: 'Detalle de la carta' })
    const shown = () => within(dock).queryByRole('heading')?.textContent ?? null
    const over = (name: string) => fireEvent.pointerOver(within(hand()).getByRole('listitem', { name }), { pointerType: 'mouse' })

    expect(dock).toHaveTextContent('Tocá una carta para ver su detalle acá.')

    // El mouse sobre una carta la muestra; sobre otra, la otra; al sacarlo queda la última.
    over('Starter')
    expect(shown()).toBe('Starter')
    over('Brick')
    expect(shown()).toBe('Brick')
    fireEvent.pointerOver(screen.getByRole('group', { name: 'Zona de monstruo 1' }), { pointerType: 'mouse' })
    expect(shown()).toBe('Brick')

    // Un click la fija: el mouse por otras cartas ya no la cambia.
    tap(within(hand()).getByRole('listitem', { name: 'Starter' }))
    expect(shown()).toBe('Starter')
    fireEvent.keyDown(document, { key: 'Escape' })
    over('Brick')
    expect(shown()).toBe('Starter')

    // Tocar el panel no la suelta (se puede leer y desplazar el texto).
    fireEvent.pointerDown(dock)
    over('Brick')
    expect(shown()).toBe('Starter')

    // Un click en otra carta la fija a ésa.
    tap(within(hand()).getByRole('listitem', { name: 'Brick' }))
    expect(shown()).toBe('Brick')
    over('Starter')
    expect(shown()).toBe('Brick')

    // Un click afuera (el campo, un lugar vacío) la suelta: vuelve a seguir al mouse, empezando por la última carta a la que se le pasó.
    fireEvent.pointerDown(screen.getByRole('group', { name: 'Zona de monstruo 1' }))
    expect(shown()).toBe('Starter')
    over('Brick')
    expect(shown()).toBe('Brick')
  })

  it('con el dedo no hay mouse que pasar: tocar la carta la muestra y la fija', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('1440') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<Harness />)

    const dock = screen.getByRole('region', { name: 'Detalle de la carta' })

    fireEvent.pointerOver(within(hand()).getByRole('listitem', { name: 'Brick' }), { pointerType: 'touch' })
    expect(dock).toHaveTextContent('Tocá una carta para ver su detalle acá.')

    tap(within(hand()).getByRole('listitem', { name: 'Brick' }))
    expect(within(dock).getByRole('heading', { name: 'Brick' })).toBeInTheDocument()
  })

  it('las jugadas que no cambian la mano inicial no la vuelven a evaluar; robar la carta de ir 2º, sí', () => {
    render(<Harness />)

    const evaluations = () => vi.mocked(evaluatePracticeHand).mock.calls.length
    const mounted = evaluations()

    for (const phase of ['Battle Phase', 'Main Phase 2', 'End Phase']) {
      goToPhase(phase)
    }

    // En el celular, la End Phase pregunta si se termina el turno: se sigue jugando.
    fireEvent.click(screen.getByRole('button', { name: 'Seguir jugando' }))

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(evaluations()).toBe(mounted)

    // La primera jugada es robar una sola carta: la mano inicial pasa a tener una más.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    tap(screen.getByRole('button', { name: 'Main: 5' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(evaluations()).toBe(mounted + 1)
  })
})
