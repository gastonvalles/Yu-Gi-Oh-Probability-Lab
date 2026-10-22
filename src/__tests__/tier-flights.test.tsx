// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EASE_IN_OUT } from '../app/motion'
import { addCards, addTierAt, moveCard, moveTierTo, newList, removeTier, resetPlacements, updateTier, type MakerCard, type MakerList, type Place } from '../app/tierlist-maker'
import { TIER_FLIGHT_MS } from '../app/use-tier-flights'
import { rowDropIndex, rowShifts } from '../app/use-tier-row-drag'
import { TierMakerBoard } from '../components/meta/TierMakerBoard'

// El arte real pide la imagen a la red: acá sólo importa dónde queda cada cosa.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))

// jsdom no hace layout. Como en el navegador, cada fila va en su caja (`data-tier-row`), una abajo de otra y en el orden del tablero (S a F, los botones de abajo, sin alto, y «Sin clasificar»):
// cada renglón de cuatro cartas mide 200 px (198 de fila y 2 de aire), y una fila sin cartas, uno. `shift` corre todo a la derecha: un tablero que cambió de ancho.
const ROW_PX = 200
const PER_LINE = 4
let shift = 0

const linesOf = (box: HTMLElement) => Math.max(1, Math.ceil(box.querySelectorAll('[data-tier-card-id]').length / PER_LINE))
/** Las cajas del tablero que tienen una fila adentro (los botones de abajo no tienen alto). */
const hasRow = (box: HTMLElement) => box.dataset.tierRow !== undefined && Boolean(box.querySelector('section'))
/** Dónde arranca la caja de una fila: lo que miden las de antes. */
function topOf(box: HTMLElement): number {
  const boxes = [...(box.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-tier-row]') ?? [])]

  return boxes
    .slice(0, boxes.indexOf(box))
    .filter(hasRow)
    .reduce((sum, previous) => sum + linesOf(previous) * ROW_PX, 0)
}

const originalOffsets = {
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft'),
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
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
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get(this: HTMLElement) { return this.dataset.tierRow !== undefined ? shift : 0 } })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get(this: HTMLElement) { return this.dataset.tierRow !== undefined ? topOf(this) : 0 } })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return hasRow(this) ? linesOf(this) * ROW_PX - 2 : 0 } })
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
const keyOf = (list: MakerList, label: string) => list.tiers.find((candidate) => candidate.label === label)?.id ?? ''

/** Pinta el tablero con `list` y devuelve cómo mostrar otra versión de la misma lista (un cambio de lugar). */
function setup(list: MakerList, onMoveTier = vi.fn()) {
  const props = { selectedId: null, onSelect: vi.fn(), onMove: vi.fn(), onRemoveCard: vi.fn(), onEditTier: vi.fn(), onMoveTier }
  const view = render(<TierMakerBoard list={list} {...props} />)

  return (next: MakerList) => view.rerender(<TierMakerBoard list={next} {...props} />)
}

const movedIds = () => calls.filter((call) => call.element.closest('[data-tier-card-id]')).map((call) => call.element.closest<HTMLElement>('[data-tier-card-id]')?.dataset.tierCardId)
/** Las filas que vuelan (su clave) con el primer cuadro de cada una. */
const rowFlights = () => Object.fromEntries(calls.filter((call) => call.element.dataset.tierRow).map((call) => [call.element.dataset.tierRow, call.keyframes[0]]))

describe('las cartas del tablero de la tier list no vuelan (Gastón, 2026-10-22: no le gustaba la animación)', () => {
  it('una carta que cambia de fila, de lugar en su fila o vuelve a la bandeja aparece de una en el lugar nuevo: no vuela nada, ni ella ni las que se corren', () => {
    const start = [1, 2, 3].reduce((list, id) => moveCard(list, id, tier(list, 0)), pool([1, 2, 3, 4]))
    const show = setup(start)
    const toA = moveCard(start, 4, tier(start, 1))
    const reordered = moveCard(toA, 3, tier(toA, 0), 1)
    const back = moveCard(reordered, 1, { kind: 'pool' })

    show(toA)
    show(reordered)
    show(back)

    expect(calls).toHaveLength(0)
  })

  it('«Volver todo a Sin clasificar» tampoco vuela, con pocas o con muchas cartas', () => {
    const ids = Array.from({ length: 30 }, (_, index) => index + 1)
    const start = ids.reduce((list, id) => moveCard(list, id, tier(list, id % 3)), pool(ids))
    const show = setup(start)

    show(resetPlacements(start))

    expect(calls).toHaveLength(0)
  })

  it('una carta que entra en una fila y le agrega un renglón corre de una a las filas de abajo y a la bandeja: tampoco vuelan', () => {
    const start = [1, 2, 3, 4].reduce((list, id) => moveCard(list, id, tier(list, 0)), pool([1, 2, 3, 4, 5]))
    const show = setup(start)
    const box = (key: string) => document.querySelector<HTMLElement>(`[data-tier-row="${key}"]`) as HTMLElement

    expect(box(keyOf(start, 'A')).offsetTop).toBe(200)
    show(moveCard(start, 5, tier(start, 0)))

    // S pasó a dos renglones: A bajó 200 px, sin vuelo.
    expect(box(keyOf(start, 'A')).offsetTop).toBe(400)
    expect(calls).toHaveLength(0)
  })
})

describe('las filas del tablero de la tier list vuelan sólo al reordenarlas, y sus cartas viajan con ellas', () => {
  it(`al mover una fila (con ↑ y ↓, o soltándola), ella y las que se corren viajan a su lugar en ${TIER_FLIGHT_MS} ms con la curva de lo que viaja; sus cartas no vuelan solas`, () => {
    const start = [1, 2].reduce((list, id) => moveCard(list, id, tier(list, 0)), pool([1, 2, 3]))
    const show = setup(start)

    show(moveTierTo(start, keyOf(start, 'S'), 2))

    // S baja dos lugares (400 px) y A y B suben uno; las demás y la bandeja, quietas.
    expect(rowFlights()).toEqual({
      [keyOf(start, 'S')]: { transform: 'translate(0px, -400px)' },
      [keyOf(start, 'A')]: { transform: 'translate(0px, 200px)' },
      [keyOf(start, 'B')]: { transform: 'translate(0px, 200px)' },
    })
    expect(TIER_FLIGHT_MS).toBe(280)
    expect(calls.find((call) => call.element.dataset.tierRow)?.options).toMatchObject({ duration: 280, easing: EASE_IN_OUT })
    expect(movedIds()).toEqual([])
  })

  it('una fila que se mueve otra vez a mitad de vuelo sigue desde donde se ve, no desde donde quedó su lugar anterior', () => {
    const start = pool([1])
    const show = setup(start)
    const once = moveTierTo(start, keyOf(start, 'S'), 1)

    show(once)
    expect(rowFlights()[keyOf(start, 'S')]).toEqual({ transform: 'translate(0px, -200px)' })

    // La curva ya hizo la mitad: S se ve a 100 px de su lugar (200), y de ahí le faltan 300 px para llegar al tercero (400).
    progress = 0.5
    calls = []
    show(moveTierTo(once, keyOf(start, 'S'), 2))

    expect(rowFlights()[keyOf(start, 'S')]).toEqual({ transform: 'translate(0px, -300px)' })
  })

  it('mientras una fila vuela, una carta que cambia de lugar no corta ni rehace el vuelo', () => {
    const start = pool([1, 2])
    const show = setup(start)
    const moved = moveTierTo(start, keyOf(start, 'S'), 1)

    show(moved)

    const flights = [...calls]

    progress = 0.5
    show(moveCard(moved, 2, tier(moved, 0)))

    expect(calls).toHaveLength(flights.length)
    for (const flight of flights) expect(flight.animation.cancel).not.toHaveBeenCalled()
  })

  it('agregar una fila en el medio, quitar una, cambiarle el nombre o el color no vuela: las de abajo y la bandeja cambian de lugar de una', () => {
    const base = pool([1, 2, 3])
    const start = moveCard(moveCard(base, 1, tier(base, 1)), 2, tier(base, 2))
    const show = setup(start)
    const added = addTierAt(start, 1, 'Nueva')
    const removed = removeTier(added, keyOf(start, 'A'))

    show(added)
    show(removed)
    show(updateTier(removed, keyOf(start, 'B'), { label: 'Bien', color: '#7fbfff' }))

    expect(calls).toHaveLength(0)
  })

  it('con movimiento reducido no se anima nada, y la fila queda en su lugar nuevo', () => {
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia
    const start = pool([1, 2])
    const show = setup(start)

    show(moveTierTo(start, keyOf(start, 'S'), 2))

    expect(calls).toHaveLength(0)
  })

  it('cambiar a otra lista no vuela, aunque tenga sus filas en otro orden', () => {
    const show = setup(pool([1, 2]))
    const other = pool([1, 2], newList('Otra', 'otra'))

    show(moveTierTo(other, keyOf(other, 'S'), 3))

    expect(calls).toHaveLength(0)
  })

  it('si el tablero cambia de ancho sin una jugada, se mide de nuevo sin vuelo: el reordenamiento siguiente parte de donde están las filas ahora', () => {
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

    show(moveTierTo(start, keyOf(start, 'S'), 1))

    // S estaba ya en x = 50 (y no en 0): sólo baja; si no se hubiera medido de nuevo, volaría también 50 px de costado.
    expect(rowFlights()[keyOf(start, 'S')]).toEqual({ transform: 'translate(0px, -200px)' })
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
