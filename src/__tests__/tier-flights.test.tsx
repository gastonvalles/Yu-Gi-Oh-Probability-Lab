// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EASE_IN_OUT } from '../app/motion'
import { addCards, moveCard, newList, resetPlacements, type MakerCard, type MakerList, type Place } from '../app/tierlist-maker'
import { TIER_FLIGHT_LIMIT, TIER_FLIGHT_MS } from '../app/use-tier-flights'
import { TierMakerBoard } from '../components/meta/TierMakerBoard'

// El arte real pide la imagen a la red: acá sólo importa dónde queda cada carta.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))

// jsdom no hace layout. Como en el navegador, cada fila es una `section` de 200 px de alto (en el orden del tablero: S a F y, al final, «Sin clasificar»): cada carta
// mide desde su fila (su `offsetParent`) y cada fila desde el tablero (`.stagger`). `shift` corre todo a la derecha: un tablero que cambió de ancho.
const ROW_PX = 200
const COLUMN_PX = 100
let shift = 0

/** El desplazamiento de un elemento hasta su `offsetParent` (la fila de una carta, el tablero de una fila) y ese `offsetParent`. */
function offsetOf(element: HTMLElement): { left: number; top: number; parent: HTMLElement | null } {
  const row = element.closest<HTMLElement>('section')
  const board = element.closest<HTMLElement>('.stagger')

  if (element.dataset.tierCardId && row) return { left: [...(element.parentElement?.children ?? [])].indexOf(element) * COLUMN_PX, top: 0, parent: row }
  if (element.tagName === 'SECTION' && board) return { left: shift, top: [...board.querySelectorAll('section')].indexOf(element) * ROW_PX, parent: board }

  return { left: 0, top: 0, parent: null }
}

const originalOffsets = {
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft'),
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
  offsetParent: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent'),
}
const originalMatchMedia = window.matchMedia

interface FakeAnimation {
  cancel: () => void
  onfinish: (() => void) | null
  effect: { getComputedTiming: () => { progress: number | null } }
}
interface Call {
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: FakeAnimation
}

/** Hasta dónde llegó la curva de un vuelo cuando se le pregunta (null: no vuela). Lo ajusta cada prueba. */
let progress: number | null = null
let calls: Call[] = []

/** El `animate` que jsdom no tiene: guarda cada llamada para verla. */
function fakeAnimate(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): FakeAnimation {
  const animation: FakeAnimation = { cancel: vi.fn(), onfinish: null, effect: { getComputedTiming: () => ({ progress }) } }

  calls.push({ element: this, keyframes, options, animation })

  return animation
}

beforeEach(() => {
  calls = []
  progress = null
  shift = 0
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: fakeAnimate })
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get(this: HTMLElement) { return offsetOf(this).left } })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get(this: HTMLElement) { return offsetOf(this).top } })
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return offsetOf(this).parent } })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  for (const [name, descriptor] of Object.entries(originalOffsets)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, name)
  }
  window.matchMedia = originalMatchMedia
  vi.unstubAllGlobals()
})

const card = (id: number): MakerCard => ({ id, name: `Carta ${id}`, image: null })
/** Una lista con estas cartas en «Sin clasificar». */
const pool = (ids: number[], list: MakerList = newList('Prueba', 'prueba')): MakerList => addCards(list, ids.map(card))
const tier = (list: MakerList, index: number): Place => ({ kind: 'tier', id: list.tiers[index]?.id ?? '' })

/** Pinta el tablero con `list` y devuelve cómo mostrar otra versión de la misma lista (un cambio de lugar). */
function setup(list: MakerList) {
  const props = { selectedId: null, onSelect: vi.fn(), onMove: vi.fn(), onRemoveCard: vi.fn(), onEditTier: vi.fn() }
  const view = render(<TierMakerBoard list={list} {...props} />)

  return (next: MakerList) => view.rerender(<TierMakerBoard list={next} {...props} />)
}

const movedIds = () => calls.map((call) => call.element.dataset.tierCardId).sort()

describe('las cartas del tablero de la tier list vuelan al cambiar de lugar', () => {
  it('la carta que cambia de fila viaja desde su lugar viejo en 280 ms con la curva de lo que viaja, y las demás no', () => {
    const before = pool([1, 2, 3])
    const show = setup(before)

    show(moveCard(before, 3, tier(before, 0)))

    expect(TIER_FLIGHT_MS).toBe(280)
    expect(movedIds()).toEqual(['3'])
    // Estaba en «Sin clasificar», en el tercer lugar (200 px a la derecha y siete filas abajo), y ahora es el primero de la fila S.
    expect(calls[0]?.keyframes).toEqual([{ transform: 'translate(200px, 1400px)' }, { transform: 'translate(0px, 0px)' }])
    expect(calls[0]?.options).toMatchObject({ duration: 280, easing: EASE_IN_OUT })
  })

  it('las cartas que se corren porque otra entró o salió de su fila también vuelan, y las que quedaron quietas no', () => {
    const start = [1, 2, 3].reduce((list, id) => moveCard(list, id, tier(list, 0)), pool([1, 2, 3, 4]))
    const show = setup(start)

    show(moveCard(start, 1, tier(start, 1)))

    // La 1 sube a la fila A; la 2 y la 3 se corren un lugar a la izquierda; la 4, en «Sin clasificar», no se mueve.
    expect(movedIds()).toEqual(['1', '2', '3'])
    expect(calls.find((call) => call.element.dataset.tierCardId === '1')?.keyframes[0]).toEqual({ transform: 'translate(0px, -200px)' })
    expect(calls.find((call) => call.element.dataset.tierCardId === '2')?.keyframes[0]).toEqual({ transform: 'translate(100px, 0px)' })
  })

  it(`más de ${TIER_FLIGHT_LIMIT} cartas que cambian de lugar a la vez no vuelan: cambian de una`, () => {
    const ids = Array.from({ length: TIER_FLIGHT_LIMIT + 1 }, (_, index) => index + 1)
    const start = ids.reduce((list, id) => moveCard(list, id, tier(list, 0)), pool(ids))
    const show = setup(start)

    // «Volver todo a Sin clasificar»: todas cambian de lugar.
    show(resetPlacements(start))

    expect(calls).toHaveLength(0)
  })

  it(`hasta ${TIER_FLIGHT_LIMIT} cartas que cambian de lugar a la vez sí vuelan`, () => {
    const ids = Array.from({ length: TIER_FLIGHT_LIMIT }, (_, index) => index + 1)
    const start = ids.reduce((list, id) => moveCard(list, id, tier(list, 0)), pool(ids))
    const show = setup(start)

    show(resetPlacements(start))

    expect(calls).toHaveLength(TIER_FLIGHT_LIMIT)
  })

  it('con movimiento reducido no se anima nada, y la carta queda en su fila', () => {
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia
    const before = pool([1, 2])
    const show = setup(before)

    show(moveCard(before, 2, tier(before, 0)))

    expect(calls).toHaveLength(0)
  })

  it('cambiar a otra lista no vuela: sus cartas aparecen donde están', () => {
    const show = setup(pool([1, 2]))
    const other = addCards(newList('Otra', 'otra'), [card(1), card(2)])

    show(moveCard(other, 2, tier(other, 0)))

    expect(calls).toHaveLength(0)
  })

  it('una carta que cambia otra vez a mitad de vuelo sigue desde donde se ve, no desde donde quedó su lugar anterior', () => {
    const start = pool([1])
    const show = setup(start)
    const inS = moveCard(start, 1, tier(start, 0))

    show(inS)
    expect(calls[0]?.keyframes[0]).toEqual({ transform: 'translate(0px, 1400px)' })

    // La curva ya hizo la mitad: la carta se ve a 700 px de la bandeja, y de ahí le faltan 500 px para llegar a la fila A.
    progress = 0.5
    show(moveCard(inS, 1, tier(inS, 1)))

    expect(calls[1]?.keyframes[0]).toEqual({ transform: 'translate(0px, 500px)' })
  })

  it('la imagen de la carta que llega a otra fila se muestra de una (React la monta de nuevo) y el vuelo la suelta al terminar', () => {
    const start = pool([1])
    const show = setup(start)

    show(moveCard(start, 1, tier(start, 0)))

    const image = calls[0]?.element.querySelector('img')

    expect(image?.style.transition).toBe('none')
    expect(image?.loading).toBe('eager')
    calls[0]?.animation.onfinish?.()
    expect(image?.style.transition).toBe('')
  })

  it('si el tablero cambia de ancho sin una jugada, se mide de nuevo sin vuelo: la siguiente jugada parte de donde están las cartas ahora', () => {
    let resized: (() => void) | undefined

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }

        observe() {
          // jsdom no mide el tablero: la prueba avisa el cambio a mano.
        }

        disconnect() {
          // Nada que soltar.
        }
      },
    )

    const start = pool([1, 2])
    const show = setup(start)

    // Se abrió el menú lateral y todo el tablero se corrió 50 px a la derecha, sin una jugada.
    shift = 50
    resized?.()

    show(moveCard(start, 2, tier(start, 0)))

    // La 2 estaba en 150 px (y no en 100): viaja desde ahí hasta el primer lugar de la fila S, que también está corrido.
    expect(calls[0]?.keyframes[0]).toEqual({ transform: 'translate(100px, 1400px)' })
  })
})
