/** @vitest-environment jsdom */
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState, matReducer, type MatState } from '../app/practice-mat'
import { FLIGHT_MS, useCardFlights } from '../app/use-card-flights'

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Dónde mide el navegador cada carta (por `data-card-id`): el test lo mueve a mano, como lo mueven un vuelo o una transición. */
const boxes = new Map<string, Box>()
/** Los vuelos que arrancó el hook: la carta y el primer cuadro (desde dónde sale). */
let flights: Array<{ card: string | undefined; from: string }> = []

const original = {
  getBoundingClientRect: HTMLElement.prototype.getBoundingClientRect,
  animate: Element.prototype.animate,
  getAnimations: Element.prototype.getAnimations,
  matchMedia: window.matchMedia,
}

const CARD = { width: 80, height: 116 }
const at = (left: number, top: number): Box => ({ left, top, ...CARD })
const centerOf = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 })

/** Desde dónde salió la carta en su último vuelo: el centro donde quedó más el desplazamiento del primer cuadro. */
function flightOrigin(card: string) {
  const flight = flights.filter((entry) => entry.card === card).at(-1)
  const [dx, dy] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(flight?.from ?? '')?.slice(1).map(Number) ?? [NaN, NaN]
  const to = centerOf(boxes.get(card)!)

  return { x: to.x + dx!, y: to.y + dy! }
}

beforeEach(() => {
  vi.useFakeTimers()
  boxes.clear()
  flights = []
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const box = boxes.get(this.dataset.cardId ?? '') ?? { left: 0, top: 0, width: 0, height: 0 }

    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }
  }
  Element.prototype.getAnimations = () => []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
    if (this instanceof HTMLElement && this.dataset.cardId && Array.isArray(keyframes)) flights.push({ card: this.dataset.cardId, from: String(keyframes[0]?.transform ?? '') })

    return {} as Animation
  }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  HTMLElement.prototype.getBoundingClientRect = original.getBoundingClientRect
  Element.prototype.animate = original.animate
  Element.prototype.getAnimations = original.getAnimations
  window.matchMedia = original.matchMedia
})

/** La mesa mínima: las cartas de la mano y las de la zona de Mágicas y Trampas, cada una con su `data-card-id`. */
function Mat({ state }: { state: MatState }) {
  const ref = useRef<HTMLDivElement>(null)

  useCardFlights(ref, state, () => null, 'fijo')

  return (
    <div ref={ref}>
      <div data-drop="hand">
        {state.hand.map((id) => (
          <div key={id} data-card-id={id} />
        ))}
      </div>
      {state.st.map((placed, index) => (
        <div key={index} data-drop={`st:${index}`}>
          {placed ? <div data-card-id={placed.id} /> : null}
        </div>
      ))}
    </div>
  )
}

describe('de dónde sale volando una carta que se juega desde la mano', () => {
  it('una carta robada sale de la mano, no del mazo: la medida de cuando todavía volaba desde el mazo se renueva al quedar quieta', () => {
    const start = createMatState(['a', 'b', 'c', 'd'], [], 2)
    boxes.set('a', at(100, 600))
    boxes.set('b', at(200, 600))
    const { rerender } = render(<Mat state={start} />)

    // Se roba: la carta nueva se mide en pleno vuelo desde el mazo (arriba a la derecha, chica).
    const drawn = matReducer(start, { type: 'draw', count: 1 })
    boxes.set('c', { left: 900, top: 300, width: 20, height: 30 })
    rerender(<Mat state={drawn} />)

    // Aterriza en la mano y todo queda quieto.
    boxes.set('c', at(300, 600))
    act(() => {
      vi.advanceTimersByTime(FLIGHT_MS + 200)
    })

    // Se activa desde la mano: aparece en la zona de Mágicas y Trampas.
    boxes.set('c', at(500, 350))
    rerender(<Mat state={matReducer(drawn, { type: 'place', id: 'c', zone: 'st', index: 2, pos: 'atk' })} />)

    expect(flightOrigin('c')).toEqual(centerOf(at(300, 600)))
  })

  it('las vecinas de una carta jugada se corren con una transición: la próxima jugada sale de donde quedaron, no de donde estaban', () => {
    const start = createMatState(['a', 'b', 'c', 'd'], [], 3)
    boxes.set('a', at(100, 600))
    boxes.set('b', at(200, 600))
    boxes.set('c', at(300, 600))
    const { rerender } = render(<Mat state={start} />)

    // Se juega la primera: las otras dos se miden al arrancar su transición, todavía en el lugar de antes.
    const first = matReducer(start, { type: 'place', id: 'a', zone: 'st', index: 0, pos: 'atk' })
    boxes.set('a', at(400, 350))
    rerender(<Mat state={first} />)

    // La mano se reacomodó: b pasó a donde estaba a, y c a donde estaba b.
    boxes.set('b', at(100, 600))
    boxes.set('c', at(200, 600))
    act(() => {
      vi.advanceTimersByTime(FLIGHT_MS + 200)
    })

    boxes.set('b', at(530, 350))
    rerender(<Mat state={matReducer(first, { type: 'place', id: 'b', zone: 'st', index: 1, pos: 'atk' })} />)

    expect(flightOrigin('b')).toEqual(centerOf(at(100, 600)))
  })
})
