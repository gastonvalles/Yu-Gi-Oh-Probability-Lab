// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect, useState, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadCardEffectMap, loadCardEffects, setCardEffectMapForTests } from '../app/card-effect-data'
import { EFFECT_FACT } from '../app/card-effect-facts'
import { effectSentences, type CardTextHighlight } from '../app/card-text'
import { createMatState, type MatAction } from '../app/practice-mat'
import { showToastMessage } from '../app/use-toast-message'
import { useMatSession } from '../app/use-mat-session'
import { DuelCardDock, type CardPeek } from '../components/duel/DuelCardDock'
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

function Harness({ cards = CARDS, initial = INITIAL }: { cards?: ReadonlyMap<string, MatCard>; initial?: typeof INITIAL }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(initial, NO_ACTIONS, NO_NAMES)
  }, [start, initial])

  if (!mat.session || !mat.state) return null

  return <PracticeMat session={mat.session} state={mat.state} cardsById={cards} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => start(initial)} />
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

// Masked HERO Dusk Crow: dos efectos de «una vez por turno» por nombre; el texto, con las dos frases en el orden del mapa.
const CROW_ID = 10808715
const CROW_TEXT =
  'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card. If this card is Normal or Special Summoned: You can add 1 "Masked HERO" monster from your Deck or GY to your hand. You can only use each effect of "Masked HERO Dusk Crow" once per turn.'
const ONCE_BY_NAME = EFFECT_FACT.once | EFFECT_FACT.hardOnce
const CROWS: ReadonlyMap<string, MatCard> = new Map([
  ['card-10808715-1', { name: 'Cuervo', apiCard: { ...card(CROW_ID, 'effect'), description: CROW_TEXT } }],
  ['card-10808715-2', { name: 'Cuervo', apiCard: { ...card(CROW_ID, 'effect'), description: CROW_TEXT } }],
  ['card-3-1', { name: 'Relleno A', apiCard: card(3, 'effect') }],
  ['card-4-1', { name: 'Relleno B', apiCard: card(4, 'effect') }],
  ['card-5-1', { name: 'Relleno C', apiCard: card(5, 'effect') }],
  ['card-6-1', { name: 'Relleno D', apiCard: card(6, 'effect') }],
])
const CROW_INITIAL = createMatState(['card-10808715-1', 'card-10808715-2', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5)

describe('el contador por efecto: una carta con varios efectos pregunta cuál se activa y cuenta cada uno por separado', () => {
  const crow = (index: number) => within(screen.getByRole('list', { name: 'Mano' })).getAllByRole('listitem', { name: 'Cuervo' })[index]!
  const open = (index: number) => {
    tap(crow(index))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
  }
  const effect = (index: number, copy = 0) => {
    open(copy)
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^Efecto ${index + 1} · `) }))
  }

  beforeEach(async () => {
    vi.mocked(showToastMessage).mockClear()
    localStorage.clear()
    HTMLElement.prototype.setPointerCapture = () => {}
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 1
    }
    window.cancelAnimationFrame = () => {}
    // Los datos de verdad primero (la carga es una sola vez); después, el mapa de esta prueba.
    await loadCardEffects()
    await loadCardEffectMap()
    const [first, second] = effectSentences(CROW_TEXT)
    setCardEffectMapForTests(
      new Map([
        [
          CROW_ID,
          [
            [first!.start, ONCE_BY_NAME | EFFECT_FACT.cost, 0],
            [second!.start, ONCE_BY_NAME, 0],
          ],
        ],
      ]),
    )
  })

  afterEach(() => {
    setCardEffectMapForTests(null)
  })

  it('«Activar efecto» pregunta cuál (cada efecto con sus rasgos confirmados), y elegir uno lo activa y lo anota con su número', () => {
    render(<Harness cards={CROWS} initial={CROW_INITIAL} />)

    tap(crow(0))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))

    // El segundo paso: un renglón por efecto y nada más (son todos los de la carta: no hay un «otro»).
    expect(screen.getByRole('menuitem', { name: /^Efecto 1 · If this card is in your hand.*You can banish 1 "HERO" monster from your GY; Special Summon this card\..*1 vez por turno, por nombre.*Con costo/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^Efecto 2 · If this card is Normal or Special Summoned.*You can add 1 "Masked HERO" monster from your Deck or GY to your hand.*1 vez por turno, por nombre/ })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem', { name: /^Efecto \d · / })).toHaveLength(2)
    expect(screen.queryByRole('menuitem', { name: 'Otro efecto' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /^Efecto 2 · / }))
    expect(screen.getAllByText('Activás el efecto 2 de Cuervo').length).toBeGreaterThanOrEqual(1)
    expect(showToastMessage).not.toHaveBeenCalled()
  })

  it('cada efecto cuenta lo suyo: usar el 1 y después el 2 no avisa; repetir el 1 (con otra copia: el límite es por nombre) sí, y dice cuál', () => {
    render(<Harness cards={CROWS} initial={CROW_INITIAL} />)

    effect(0, 0)
    effect(1, 0)
    expect(showToastMessage).not.toHaveBeenCalled()

    effect(0, 1)
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(showToastMessage).mock.calls[0]![0]).toMatch(/Ya activaste el efecto 1 de Cuervo este turno y es de «una vez por turno» por nombre \(otra copia comparte el límite\)\./)
    expect(vi.mocked(showToastMessage).mock.calls[0]![1]).toBe('warning')
  })

  it('la lista dice cuál ya se usó este turno (y lo sigue ofreciendo); al deshacer, deja de decirlo', () => {
    render(<Harness cards={CROWS} initial={CROW_INITIAL} />)

    effect(0, 0)
    open(1)
    expect(screen.getByRole('menuitem', { name: /^Efecto 1 · .*Ya lo usaste este turno/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^Efecto 2 · / })).not.toHaveAccessibleName(/Ya lo usaste/)
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    open(1)
    expect(screen.getByRole('menuitem', { name: /^Efecto 1 · / })).not.toHaveAccessibleName(/Ya lo usaste/)
  })

  it('una carta con varios efectos pero sin ningún límite confirmado se activa directo, sin preguntar', () => {
    setCardEffectMapForTests(new Map([[CROW_ID, effectSentences(CROW_TEXT).map((sentence) => [sentence.start, EFFECT_FACT.cost, 0] as [number, number, number])]]))
    render(<Harness cards={CROWS} initial={CROW_INITIAL} />)

    tap(crow(0))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    expect(screen.queryByRole('menuitem', { name: /^Efecto \d · / })).not.toBeInTheDocument()
    expect(screen.getAllByText('Activás el efecto de Cuervo').length).toBeGreaterThanOrEqual(1)
  })
})

describe('al elegir el efecto en escritorio, el detalle de la carta (a la izquierda) resalta la frase de cada opción', () => {
  /** La mesa con el detalle fijo a la izquierda, como en la práctica: la carta que se tocó y el pedazo de su texto que se resalta. */
  function WithDock() {
    const mat = useMatSession()
    const { start } = mat
    const [peek, setPeek] = useState<CardPeek | null>(null)
    const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)

    useEffect(() => {
      start(CROW_INITIAL, NO_ACTIONS, NO_NAMES)
    }, [start])

    if (!mat.session || !mat.state) return null

    return (
      <PracticeMat
        session={mat.session}
        state={mat.state}
        cardsById={CROWS}
        deckName="Test"
        onDispatch={mat.dispatch}
        onUndo={mat.undo}
        onSeek={mat.seek}
        onLoadCombo={() => {}}
        onNewHand={() => start(CROW_INITIAL)}
        detail={<DuelCardDock peek={peek} highlight={highlight} />}
        onPeek={setPeek}
        onHighlight={setHighlight}
      />
    )
  }

  const [FIRST, SECOND] = effectSentences(CROW_TEXT)
  const dock = () => screen.getByRole('region', { name: 'Detalle de la carta' })
  const marked = () => [...dock().querySelectorAll('mark[data-highlight]')].map((node) => node.textContent).join('')
  const row = (index: number) => screen.getByRole('menuitem', { name: new RegExp(`^Efecto ${index + 1} · `) })

  beforeEach(async () => {
    vi.mocked(showToastMessage).mockClear()
    localStorage.clear()
    HTMLElement.prototype.setPointerCapture = () => {}
    // Escritorio (el menú pegado a la carta, no la hoja del celular) con el detalle fijo: más de 1101 y de 1440 px.
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || query.includes('1101') || query.includes('1440'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 1
    }
    window.cancelAnimationFrame = () => {}
    await loadCardEffects()
    await loadCardEffectMap()
    setCardEffectMapForTests(
      new Map([
        [
          CROW_ID,
          [
            [FIRST!.start, ONCE_BY_NAME | EFFECT_FACT.cost, 0],
            [SECOND!.start, ONCE_BY_NAME, 0],
          ],
        ],
      ]),
    )
  })

  afterEach(() => {
    setCardEffectMapForTests(null)
    vi.restoreAllMocks()
  })

  const openEffects = () => {
    tap(within(screen.getByRole('list', { name: 'Mano' })).getAllByRole('listitem', { name: 'Cuervo' })[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
  }

  it('al pasar el mouse por una opción se resalta, a la izquierda, la frase de ese efecto (entera, tal cual) y al irse se apaga', () => {
    render(<WithDock />)
    openEffects()

    // Antes de pasar el mouse, nada resaltado.
    expect(marked()).toBe('')

    fireEvent.mouseEnter(row(1))
    expect(marked()).toBe(SECOND!.text)

    // Pasar a la otra opción cambia el resaltado.
    fireEvent.mouseLeave(row(1))
    fireEvent.mouseEnter(row(0))
    expect(marked()).toBe(FIRST!.text)

    fireEvent.mouseLeave(row(0))
    expect(marked()).toBe('')
  })

  it('el resaltado se apaga al elegir el efecto y al cerrar el menú (el mouse se va sin avisar)', () => {
    render(<WithDock />)
    openEffects()
    fireEvent.mouseEnter(row(0))
    expect(marked()).toBe(FIRST!.text)

    fireEvent.click(row(0))
    expect(marked()).toBe('')

    openEffects()
    fireEvent.mouseEnter(row(1))
    expect(marked()).toBe(SECOND!.text)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(marked()).toBe('')
  })

  it('con el teclado también (al enfocar una opción), pero el foco que se lleva el menú al abrirse con el mouse no resalta nada', () => {
    render(<WithDock />)
    openEffects()

    // El foco inicial (sin teclado): no resalta.
    fireEvent.focus(row(0))
    expect(marked()).toBe('')

    // Con el teclado (`:focus-visible`): sí.
    const matches = Element.prototype.matches

    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':focus-visible' || matches.call(this, selector)
    })
    fireEvent.focus(row(1))
    expect(marked()).toBe(SECOND!.text)
    fireEvent.blur(row(1))
    expect(marked()).toBe('')
  })
})

// Pot of Desires: una Mágica con «una vez por turno, por nombre» confirmado (activar 1 por turno). Para una Mágica activar es dejarla boca arriba en su zona, no una jugada «activar efecto».
const POT_ID = 35261759
const POTS: ReadonlyMap<string, MatCard> = new Map([
  ['card-35261759-1', { name: 'Pot of Desires', apiCard: card(POT_ID, 'spell') }],
  ['card-35261759-2', { name: 'Pot of Desires', apiCard: card(POT_ID, 'spell') }],
  ['card-3-1', { name: 'Relleno A', apiCard: card(3, 'effect') }],
  ['card-4-1', { name: 'Relleno B', apiCard: card(4, 'effect') }],
  ['card-5-1', { name: 'Relleno C', apiCard: card(5, 'effect') }],
  ['card-6-1', { name: 'Relleno D', apiCard: card(6, 'effect') }],
])
const POT_INITIAL = createMatState(['card-35261759-1', 'card-35261759-2', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 5)

describe('el asistente de la mesa: también cuenta las Mágicas y las Trampas (activar es dejarlas boca arriba)', () => {
  const pot = () => within(screen.getByRole('list', { name: 'Mano' })).getAllByRole('listitem', { name: 'Pot of Desires' })[0]!
  /** De la mano a una zona de Mágicas y Trampas, boca arriba (activar) o boca abajo (colocar). */
  const fromHand = (option: 'Activar' | 'Colocar', zone: number) => {
    tap(pot())
    fireEvent.click(screen.getByRole('menuitem', { name: option }))
    fireEvent.click(screen.getByRole('button', { name: `Zona de magia y trampa ${zone}: elegir` }))
  }

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

  it('una segunda Pot of Desires activada en el mismo turno avisa, y la jugada se hace igual', async () => {
    render(<Harness cards={POTS} initial={POT_INITIAL} />)
    await act(async () => {
      await loadCardEffects()
    })

    fromHand('Activar', 1)
    expect(showToastMessage).not.toHaveBeenCalled()

    fromHand('Activar', 2)
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(showToastMessage).mock.calls[0]![0]).toMatch(/Ya activaste Pot of Desires este turno.*por nombre.*otra copia comparte el límite/)
    expect(vi.mocked(showToastMessage).mock.calls[0]![1]).toBe('warning')
    expect(screen.getAllByText('Activás Pot of Desires').length).toBeGreaterThanOrEqual(2)
  })

  it('Colocar boca abajo no es activar: avisa recién al darla vuelta', async () => {
    render(<Harness cards={POTS} initial={POT_INITIAL} />)
    await act(async () => {
      await loadCardEffects()
    })

    fromHand('Activar', 1)
    fromHand('Colocar', 2)
    expect(showToastMessage).not.toHaveBeenCalled()

    tap(screen.getByRole('button', { name: 'Pot of Desires, boca abajo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(showToastMessage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(showToastMessage).mock.calls[0]![0]).toMatch(/Ya activaste Pot of Desires este turno/)
  })

  it('si se deshace la primera activación, la segunda ya no avisa', async () => {
    render(<Harness cards={POTS} initial={POT_INITIAL} />)
    await act(async () => {
      await loadCardEffects()
    })

    fromHand('Activar', 1)
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    fromHand('Activar', 2)
    expect(showToastMessage).not.toHaveBeenCalled()
  })
})
