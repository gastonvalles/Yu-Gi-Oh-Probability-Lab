// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EASE_IN_OUT } from '../app/motion'
import { addCards, moveCard, moveTierTo, newList, removeTier, resetPlacements, type MakerCard, type MakerList, type Place } from '../app/tierlist-maker'
import { TIER_FLIGHT_LIMIT, TIER_FLIGHT_MS } from '../app/use-tier-flights'
import { rowDropIndex, rowShifts } from '../app/use-tier-row-drag'
import { TierMakerBoard } from '../components/meta/TierMakerBoard'

// El arte real pide la imagen a la red: acá sólo importa dónde queda cada carta.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))

// jsdom no hace layout. Como en el navegador, cada fila va en su caja (`data-tier-row`) de 200 px de alto (198 de fila y 2 de aire), en el orden del tablero: S a F, los botones
// de abajo (sin alto) y «Sin clasificar». Cada carta mide desde su fila (su `section`), la fila desde su caja y la caja desde el tablero. `shift` corre todo a la derecha: un tablero que
// cambió de ancho.
const ROW_PX = 200
const ROW_HEIGHT_PX = 198
const COLUMN_PX = 100
let shift = 0

/** Las cajas del tablero que tienen una fila adentro y que están antes de `box` (los botones de abajo no tienen alto). */
const rowsBefore = (box: HTMLElement) => {
  const boxes = [...(box.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-tier-row]') ?? [])]

  return boxes.slice(0, boxes.indexOf(box)).filter((candidate) => candidate.querySelector('section')).length
}

/** El desplazamiento de un elemento hasta su `offsetParent` (la fila de una carta, la caja de una fila, el tablero de una caja) y ese `offsetParent`. */
function offsetOf(element: HTMLElement): { left: number; top: number; parent: HTMLElement | null } {
  if (element.dataset.tierCardId) return { left: [...(element.parentElement?.children ?? [])].indexOf(element) * COLUMN_PX, top: 0, parent: element.closest<HTMLElement>('section') }
  if (element.tagName === 'SECTION') return { left: 0, top: 0, parent: element.closest<HTMLElement>('[data-tier-row]') }
  if (element.dataset.tierRow !== undefined) return { left: shift, top: rowsBefore(element) * ROW_PX, parent: element.parentElement }

  return { left: 0, top: 0, parent: null }
}

const originalOffsets = {
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft'),
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
  offsetParent: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
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
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.dataset.tierRow !== undefined && this.querySelector('section') ? ROW_HEIGHT_PX : 0 } })
  HTMLElement.prototype.setPointerCapture = () => {}
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
function setup(list: MakerList, onMoveTier = vi.fn()) {
  const props = { selectedId: null, onSelect: vi.fn(), onMove: vi.fn(), onRemoveCard: vi.fn(), onEditTier: vi.fn(), onMoveTier }
  const view = render(<TierMakerBoard list={list} {...props} />)

  return (next: MakerList) => view.rerender(<TierMakerBoard list={next} {...props} />)
}

const movedIds = () => calls.filter((call) => call.element.dataset.tierCardId).map((call) => call.element.dataset.tierCardId).sort()

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

describe('dónde cae la fila que se arrastra y cuánto se corren las demás', () => {
  // Cuatro filas con 2 px de aire; la segunda, de dos renglones.
  const rows = [
    { top: 0, height: 98 },
    { top: 100, height: 198 },
    { top: 300, height: 98 },
    { top: 400, height: 98 },
  ]

  it('cae después de cada fila cuyo centro quedó más arriba que el suyo', () => {
    expect(rowDropIndex(rows, 0, 160)).toBe(1)
    expect(rowDropIndex(rows, 0, 90)).toBe(0)
    expect(rowDropIndex(rows, 3, 0)).toBe(0)
    expect(rowDropIndex(rows, 3, 400)).toBe(3)
  })

  it('las del medio se corren lo que mide la levantada más el aire: hacia arriba si baja, hacia abajo si sube; las demás, nada', () => {
    expect(rowShifts(rows, 0, 2, 2)).toEqual([0, -100, -100, 0])
    expect(rowShifts(rows, 3, 1, 2)).toEqual([0, 100, 100, 0])
    expect(rowShifts(rows, 1, 3, 2)).toEqual([0, 0, -200, -200])
    expect(rowShifts(rows, 2, 2, 2)).toEqual([0, 0, 0, 0])
  })
})

/** Las filas que vuelan (su clave) con el primer cuadro de cada una. */
const rowFlights = () => Object.fromEntries(calls.filter((call) => call.element.dataset.tierRow).map((call) => [call.element.dataset.tierRow, call.keyframes[0]]))
const keyOf = (list: MakerList, label: string) => list.tiers.find((tier) => tier.label === label)?.id ?? ''

describe('las filas del tablero de la tier list vuelan al cambiar de lugar, y sus cartas viajan con ellas', () => {
  it('al mover una fila, ella y las que se corren viajan a su lugar en 280 ms con la curva de lo que viaja; sus cartas no vuelan solas', () => {
    const start = [1, 2].reduce((list, id) => moveCard(list, id, tier(list, 0)), pool([1, 2, 3]))
    const show = setup(start)

    show(moveTierTo(start, keyOf(start, 'S'), 2))

    // S baja dos lugares (400 px) y A y B suben uno; las demás y la bandeja, quietas.
    expect(rowFlights()).toEqual({
      [keyOf(start, 'S')]: { transform: 'translate(0px, -400px)' },
      [keyOf(start, 'A')]: { transform: 'translate(0px, 200px)' },
      [keyOf(start, 'B')]: { transform: 'translate(0px, 200px)' },
    })
    expect(calls.find((call) => call.element.dataset.tierRow)?.options).toMatchObject({ duration: 280, easing: EASE_IN_OUT })
    expect(movedIds()).toEqual([])
  })

  it('al quitar una fila, las de abajo y la bandeja suben con sus cartas, y las cartas de la fila quitada vuelan a la bandeja desde su lugar', () => {
    // La 1 en A, la 2 en B y la 3 en «Sin clasificar».
    const base = pool([1, 2, 3])
    const withA = moveCard(moveCard(base, 1, tier(base, 1)), 2, tier(base, 2))
    const show = setup(withA)

    show(removeTier(withA, keyOf(withA, 'A')))

    const flights = rowFlights()

    // B a F suben una fila (200 px); la bandeja también. Los botones de abajo no tienen alto en esta prueba: también suben.
    expect(flights[keyOf(withA, 'B')]).toEqual({ transform: 'translate(0px, 200px)' })
    expect(flights.pool).toEqual({ transform: 'translate(0px, 200px)' })
    expect(flights[keyOf(withA, 'S')]).toBeUndefined()
    // La 2 sigue en B y la 3 en la bandeja (viajan con su fila); la 1 sale de A (estaba a 200 px) y entra segunda en la bandeja (1200 px, 100 px a la derecha), que a su vez sube 200: vuela lo que le falta.
    expect(movedIds()).toEqual(['1'])
    expect(calls.find((call) => call.element.dataset.tierCardId === '1')?.keyframes[0]).toEqual({ transform: 'translate(-100px, -1200px)' })
  })

  it('arrastrar una fila por su agarre (con el puntero) la deja en su lugar nuevo y vuela desde donde se la soltó; las que se corrieron ya están en su lugar y no vuelan', () => {
    const start = pool([1])
    const onMoveTier = vi.fn()
    const show = setup(start, onMoveTier)
    const grip = screen.getByRole('button', { name: 'Mover la fila S' })

    // Se la agarra a 100 px de su borde de arriba y se la baja 480 px: su centro (579) queda pasando el de B (499) y antes del de C (699).
    fireEvent.pointerDown(grip, { pointerId: 1, pointerType: 'touch', button: 0, clientY: 100 })
    fireEvent.pointerMove(grip, { pointerId: 1, pointerType: 'touch', clientY: 340 })
    fireEvent.pointerMove(grip, { pointerId: 1, pointerType: 'touch', clientY: 580 })

    const box = (label: string) => grip.ownerDocument.querySelector<HTMLElement>(`[data-tier-row="${keyOf(start, label)}"]`)

    // La levantada sigue al dedo; A y B se corren una fila hacia arriba para dejarle el hueco.
    expect(box('S')?.style.transform).toBe('translateY(480px)')
    expect(box('A')?.style.transform).toBe('translateY(-200px)')
    expect(box('B')?.style.transform).toBe('translateY(-200px)')
    expect(box('C')?.style.transform).toBe('')

    fireEvent.pointerUp(grip, { pointerId: 1, pointerType: 'touch', clientY: 580 })
    expect(onMoveTier).toHaveBeenCalledWith(keyOf(start, 'S'), 2)
    expect(box('S')?.style.transform).toBe('')

    show(moveTierTo(start, keyOf(start, 'S'), 2))

    // S quedó a 480 px de su lugar de antes y su lugar nuevo está a 400: vuela los 80 que le faltan. A y B ya estaban corridas: no vuelan. Ninguna carta.
    expect(rowFlights()).toEqual({ [keyOf(start, 'S')]: { transform: 'translate(0px, 80px)' } })
    expect(movedIds()).toEqual([])
  })
})
