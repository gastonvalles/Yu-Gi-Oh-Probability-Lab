/** @vitest-environment jsdom */
import { configureStore } from '@reduxjs/toolkit'
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { DuelTable } from '../components/duel/DuelTable'
import { EASE_IN_OUT } from '../app/motion'
import { FLIGHT_MS, FLIGHT_STAGGER_MS, LANDING_AT, cardPose, flightMs, poseIn, useCardFlights } from '../app/use-card-flights'

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
/** Los fantasmas que vuelan hasta una pila (una carta que se fue del campo): a dónde llegan. */
let ghostLandings: string[] = []
/** Todo lo que se animó: el elemento, sus cuadros, sus opciones y la animación que devolvió (para avisar que terminó o se cortó). */
let calls: Array<{ element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: Animation }> = []

/**
 * Con qué nombre se mide cada elemento: la carta propia o del rival por su id, las pilas propias como `mine-<pila>`, las del rival como `rival-<pila>` y
 * cualquier otro por su `data-box`.
 */
const keyOf = (element: HTMLElement) =>
  element.dataset.cardId ?? element.dataset.rivalCardId ?? element.dataset.box ?? (element.dataset.rivalDrop ? `rival-${element.dataset.rivalDrop}` : element.dataset.drop ? `mine-${element.dataset.drop}` : '')

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
  ghostLandings = []
  calls = []
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const box = boxes.get(keyOf(this)) ?? { left: 0, top: 0, width: 0, height: 0 }

    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }
  }
  Element.prototype.getAnimations = () => []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    if (this instanceof HTMLElement && (this.dataset.cardId ?? this.dataset.rivalCardId) && Array.isArray(keyframes)) flights.push({ card: this.dataset.cardId ?? this.dataset.rivalCardId, from: String(keyframes[0]?.transform ?? '') })
    if (this instanceof HTMLElement && 'flightGhost' in this.dataset && Array.isArray(keyframes) && keyframes[0]?.transform !== undefined && (typeof options !== 'object' || options.composite !== 'add')) ghostLandings.push(String(keyframes.at(-1)?.transform ?? ''))
    const animation = {} as Animation
    if (Array.isArray(keyframes)) calls.push({ element: this, keyframes, options: typeof options === 'object' ? options : {}, animation })

    return animation
  }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  HTMLElement.prototype.getBoundingClientRect = original.getBoundingClientRect
  Element.prototype.animate = original.animate
  Element.prototype.getAnimations = original.getAnimations
  window.matchMedia = original.matchMedia
  // Los fantasmas se quitan solos al terminar su vuelo, que acá nunca corre.
  document.querySelectorAll('[data-flight-ghost]').forEach((ghost) => ghost.remove())
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

/** La mesa del rival: su mano, su cementerio y las cartas de su campo, con las marcas del rival. */
function RivalMat({ state }: { state: MatState }) {
  const ref = useRef<HTMLDivElement>(null)

  useCardFlights(ref, state, () => null, 'fijo', 'theirs')

  return (
    <div ref={ref}>
      <div data-rival-drop="hand" />
      <div data-rival-drop="gy" />
      {state.mz.map((placed, index) => (placed ? <div key={index} data-rival-card-id={placed.id} /> : null))}
    </div>
  )
}

describe('de dónde sale la carta grande del centro (`cardPose`)', () => {
  it('de su carta a la vista; si no se ve, de la copia que vuela o de su pila; las del rival, de cabeza, y las de su mano, del medio de sus dorsos', () => {
    // a en la zona de monstruo 1, b en la mano, c y d en el deck.
    const state = matReducer(createMatState(['a', 'b', 'c', 'd'], [], 2), { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'normal' })
    const root = document.createElement('div')

    root.innerHTML = '<div data-card-id="a"></div><div data-drop="deck"></div><div data-rival-card-id="a"></div><div data-rival-drop="hand"><div role="img"><span data-box="dorso"></span></div></div><div data-flight-ghost="d" data-box="copia"></div>'
    document.body.append(root)
    boxes.set('a', at(100, 200))
    boxes.set('mine-deck', at(600, 400))
    boxes.set('rival-hand', { left: 300, top: 0, width: 200, height: 120 })
    boxes.set('dorso', { left: 300, top: 10, width: 60, height: 88 })
    boxes.set('copia', at(20, 30))

    expect(cardPose(root, state, 'a', 'mine')).toEqual({ x: 140, y: 258, width: 80, height: 116, angle: 0 })
    expect(cardPose(root, state, 'c', 'mine')).toEqual({ x: 640, y: 458, width: 80, height: 116, angle: 0 })
    expect(cardPose(root, state, 'd', 'mine')).toEqual({ x: 60, y: 88, width: 80, height: 116, angle: 0 })
    expect(cardPose(root, state, 'a', 'theirs')).toMatchObject({ x: 140, y: 258, angle: 180 })
    const hand = cardPose(root, state, 'b', 'theirs')!

    expect(hand).toMatchObject({ x: 400, y: 60, angle: 180 })
    expect(hand.width).toBeCloseTo(60, 6)
    expect(hand.height).toBeCloseTo(88, 6)
    // La copia que vuela ya viaja de cabeza: no se le suma otra media vuelta.
    expect(cardPose(root, state, 'd', 'theirs')?.angle).toBe(0)
    expect(cardPose(root, state, 'zz', 'mine')).toBeNull()
    expect(cardPose(null, state, 'a', 'mine')).toBeNull()
    root.remove()
  })

  it('una carta girada se mide sin su giro: de costado, el rectángulo que la encierra se da vuelta; un poco girada (el abanico), es más chica que él', () => {
    const sideways = poseIn({ left: 0, top: 0, width: 116, height: 80 }, 90)

    expect(sideways.width).toBeCloseTo(80, 6)
    expect(sideways.height).toBeCloseTo(116, 6)
    expect(sideways).toMatchObject({ x: 58, y: 40, angle: 90 })

    const radians = (4.4 * Math.PI) / 180
    const fan = poseIn({ left: 0, top: 0, width: 80 * Math.cos(radians) + 116 * Math.sin(radians), height: 80 * Math.sin(radians) + 116 * Math.cos(radians) }, -4.4)

    expect(fan.width).toBeCloseTo(80, 6)
    expect(fan.height).toBeCloseTo(116, 6)
    // A 45° no se puede despejar: queda el rectángulo.
    expect(poseIn({ left: 0, top: 0, width: 140, height: 140 }, 45)).toMatchObject({ width: 140, height: 140 })
  })
})

describe('las cartas del rival vuelan como las propias', () => {
  it('una carta suya que sale del campo viaja hasta su cementerio', () => {
    const start = matReducer(createMatState(['a', 'b', 'c'], [], 3), { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'normal' })
    boxes.set('a', at(100, 100))
    boxes.set('rival-gy', at(500, 100))
    const { rerender } = render(<RivalMat state={start} />)
    expect(ghostLandings).toHaveLength(0)

    rerender(<RivalMat state={matReducer(start, { type: 'move', id: 'a', to: 'gy' })} />)

    expect(document.querySelectorAll('[data-flight-ghost]')).toHaveLength(1)
    // Aterriza en el centro de su cementerio (el fantasma no tiene tamaño en jsdom, así que se centra sumando la mitad de la pila).
    expect(ghostLandings).toHaveLength(1)
    expect(ghostLandings[0]).toContain('translate(540px, 158px)')
    // Viaja de cabeza: así se ve su carta en su campo y en su pila.
    expect(ghostLandings[0]).toContain('rotate(180deg)')
  })

  it('una carta suya que baja de la mano al campo sale de su mano', () => {
    const start = createMatState(['a', 'b', 'c'], [], 3)
    boxes.set('rival-hand', at(300, 20))
    const { rerender } = render(<RivalMat state={start} />)

    boxes.set('b', at(600, 150))
    rerender(<RivalMat state={matReducer(start, { type: 'place', id: 'b', zone: 'mz', index: 2, pos: 'atk', how: 'normal' })} />)

    expect(flightOrigin('b')).toEqual(centerOf(at(300, 20)))
  })

  it('sin estado del rival todavía no hace nada', () => {
    function Empty() {
      const ref = useRef<HTMLDivElement>(null)

      useCardFlights(ref, null, () => null, 'fijo', 'theirs')

      return <div ref={ref} />
    }

    expect(() => render(<Empty />)).not.toThrow()
    expect(flights).toHaveLength(0)
  })
})

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

describe('la carta que sale de tu mano al campo vuela por encima de sus vecinas (el campo es su propio contexto de apilado y la mano se pinta encima)', () => {
  const offsets = { width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'), height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight') }

  beforeEach(() => {
    // El tamaño de layout de cada carta: el de su caja.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return boxes.get(keyOf(this))?.width ?? 0 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return boxes.get(keyOf(this))?.height ?? 0 } })
  })

  afterEach(() => {
    for (const [name, descriptor] of [['offsetWidth', offsets.width], ['offsetHeight', offsets.height]] as const) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, name)
    }
  })

  /** La mano de cuatro (a, b, c, d) y la del medio, c, colocada en la zona 3 de Mágicas y Trampas. */
  function playFromHand() {
    const start = createMatState(['a', 'b', 'c', 'd'], [], 4)
    ;['a', 'b', 'c', 'd'].forEach((id, index) => boxes.set(id, at(100 + index * 60, 600)))
    const view = render(<Mat state={start} />)

    boxes.set('c', at(500, 350))
    view.rerender(<Mat state={matReducer(start, { type: 'place', id: 'c', zone: 'st', index: 2, pos: 'set' })} />)

    return view
  }
  const flightOf = (element: Element) => calls.find((call) => call.element === element && call.keyframes[0]?.transform !== undefined)
  const hiddenOf = (element: Element) => calls.find((call) => call.element === element && call.keyframes[0]?.opacity === 0)

  it('vuela una copia en la capa de los fantasmas con el mismo vuelo, y la carta queda transparente y sin atajar el puntero hasta que toca su zona', () => {
    const { container } = playFromHand()
    const holder = document.querySelector<HTMLElement>('[data-flight-ghost="c"]')
    const card = container.querySelector<HTMLElement>('[data-drop="st:2"] [data-card-id="c"]')!

    // En la capa de los fantasmas de la mesa (z 110: encima del campo y de la mano, debajo de las cartas grandes del centro), sin toques, foco ni lectura.
    expect(holder?.parentElement).toBe(container.firstElementChild)
    expect(holder?.className).toContain('z-110')
    expect(holder?.className).toContain('pointer-events-none')
    expect(holder?.getAttribute('aria-hidden')).toBe('true')
    expect(holder?.hasAttribute('inert')).toBe(true)
    // La copia, sin la marca de la carta (la mesa no la mide ni la toma por ella), justo donde está la carta.
    const copy = holder!.firstElementChild as HTMLElement
    expect(copy.hasAttribute('data-card-id')).toBe(false)
    expect([copy.style.left, copy.style.top, copy.style.width, copy.style.height]).toEqual(['500px', '350px', '80px', '116px'])
    // El mismo vuelo que la carta (los mismos cuadros y el mismo reloj): sale de donde estaba en la mano.
    expect(flightOf(copy)!.keyframes).toBe(flightOf(card)!.keyframes)
    expect(flightOf(copy)!.options).toMatchObject({ duration: FLIGHT_MS, easing: EASE_IN_OUT })
    expect(flightOrigin('c')).toEqual(centerOf(at(220, 600)))
    // La carta, transparente y sin atajar el puntero (no se eleva bajo el mouse) hasta que toca su zona; otra jugada la corta (es un vuelo).
    expect(hiddenOf(card)!.keyframes).toEqual([{ opacity: 0, pointerEvents: 'none' }, { opacity: 0, pointerEvents: 'none' }])
    expect(hiddenOf(card)!.options).toEqual({ id: 'mat-flight', duration: Math.round(FLIGHT_MS * LANDING_AT) })
  })

  it('cuando la carta toca su zona la copia se va; si otra jugada corta el vuelo, también', () => {
    const first = playFromHand()
    const card = () => document.querySelector('[data-drop="st:2"] [data-card-id="c"]')!

    ;(hiddenOf(card())!.animation.onfinish as () => void)()
    expect(document.querySelector('[data-flight-ghost]')).toBeNull()
    first.unmount()

    calls = []
    playFromHand()
    expect(document.querySelector('[data-flight-ghost="c"]')).not.toBeNull()
    ;(hiddenOf(card())!.animation.oncancel as () => void)()
    expect(document.querySelector('[data-flight-ghost]')).toBeNull()
  })

  it('lo que no sale de tu mano vuela como siempre, sin copia (de una zona a otra), y con el movimiento reducido no vuela nada', () => {
    const placed = matReducer(createMatState(['a', 'b', 'c', 'd'], [], 4), { type: 'place', id: 'c', zone: 'st', index: 0, pos: 'atk' })
    boxes.set('c', at(400, 350))
    const first = render(<Mat state={placed} />)

    boxes.set('c', at(530, 350))
    first.rerender(<Mat state={matReducer(placed, { type: 'place', id: 'c', zone: 'st', index: 1, pos: 'atk' })} />)
    expect(document.querySelector('[data-flight-ghost]')).toBeNull()
    expect(flightOrigin('c')).toEqual(centerOf(at(400, 350)))
    expect(hiddenOf(document.querySelector('[data-card-id="c"]')!)).toBeUndefined()
    first.unmount()

    calls = []
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    playFromHand()
    expect(document.querySelector('[data-flight-ghost]')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

/** `CardArt` (en la mesa del duelo) lee el formato del deck del store: uno mínimo. */
const WATCH_STORE = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

/** El arte de una carta de la mesa de pilas: su id es su número de YGOPRODeck. */
const ygoArt = (id: string) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`

/** La mesa con sus pilas (`data-drop`) y las cartas de las zonas de monstruo: las cartas de las pilas no tienen elemento propio. */
function PileMat({ state }: { state: MatState }) {
  const ref = useRef<HTMLDivElement>(null)

  useCardFlights(ref, state, ygoArt, 'fijo')

  return (
    <div ref={ref}>
      {/* Cada pila muestra su carta de arriba (con su imagen, que `CardArt` deja transparente hasta que carga) y su contador, como en la mesa. */}
      {(['deck', 'extra', 'gy', 'banished'] as const).map((pile) => (
        <div key={pile} data-drop={pile}>
          <span>
            {state[pile].at(-1) ?? '-'}
            {state[pile].length > 0 ? <img alt="" loading="lazy" style={{ opacity: 0 }} /> : null}
          </span>
          <b>{state[pile].length}</b>
        </div>
      ))}
      {state.mz.map((placed, index) => (
        <div key={index} data-drop={`mz:${index}`}>
          {placed ? <div data-card-id={placed.id} /> : null}
        </div>
      ))}
    </div>
  )
}

/** La mesa del rival con su mano de dorsos (una fila de cartas sin id), su cementerio y su campo. */
function RivalPiles({ state }: { state: MatState }) {
  const ref = useRef<HTMLDivElement>(null)

  useCardFlights(ref, state, () => null, 'fijo', 'theirs')

  return (
    <div ref={ref}>
      <div data-rival-drop="hand">
        <div role="img">
          <span data-box="rival-hand-card" />
        </div>
      </div>
      <div data-rival-drop="gy" />
      {state.mz.map((placed, index) => (placed ? <div key={index} data-rival-card-id={placed.id} /> : null))}
    </div>
  )
}

/** Los fantasmas, en el orden en que salieron: de dónde, a dónde, cuánto esperan y su elemento. */
const ghosts = () =>
  calls
    .filter(({ element, keyframes, options }) => element instanceof HTMLElement && 'flightGhost' in element.dataset && keyframes[0]?.transform !== undefined && options.composite !== 'add')
    .map(({ element, keyframes, options }) => ({ element: element as HTMLElement, from: String(keyframes[0]?.transform), to: String(keyframes.at(-1)?.transform), delay: options.delay ?? 0, duration: Number(options.duration), easing: options.easing }))
/** Cómo cambia el dorso de un fantasma en el camino (de qué opacidad a cuál); null si no cambia. */
const backFade = (ghost: HTMLElement) => {
  const fade = calls.find(({ element }) => element.parentElement === ghost && element.tagName === 'SPAN')

  return fade ? [fade.keyframes[0]?.opacity, fade.keyframes.at(-1)?.opacity] : null
}
/** Los golpes de color (`impact`) que dio cada lugar: su elemento y cuándo. */
const impacts = (element: Element) => calls.filter((call) => call.element === element && 'boxShadow' in (call.keyframes[0] ?? {}))

// Mano: 101 y 102. Deck: 103 a 112 (el tope, 103). Extra: 901 (un Xyz).
const DECK = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112']
const fresh = () => createMatState(DECK, ['901'], 2)
const play = (state: MatState, ...actions: MatAction[]) => actions.reduce(matReducer, state)

describe('las cartas que van de una pila a otra vuelan (no tienen elemento propio)', () => {
  const offsets = { width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'), height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight') }

  beforeEach(() => {
    // El tamaño de layout de cada elemento medido: el de su caja.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return boxes.get(keyOf(this))?.width ?? 0 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return boxes.get(keyOf(this))?.height ?? 0 } })
    boxes.set('mine-deck', at(700, 500))
    boxes.set('mine-extra', at(20, 500))
    boxes.set('mine-gy', at(700, 350))
    boxes.set('mine-banished', at(700, 200))
  })

  afterEach(() => {
    for (const [name, descriptor] of [['offsetWidth', offsets.width], ['offsetHeight', offsets.height]] as const) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, name)
    }
  })

  const gy = () => document.querySelector<HTMLElement>('[data-drop="gy"]')!

  it('del deck al cementerio: sale del deck de dorso, se da vuelta en el camino y el cementerio da su golpe violeta', () => {
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'mill', count: 1 })} />)

    expect(ghosts()).toHaveLength(1)
    const [ghost] = ghosts()
    expect(ghost!.from).toBe('translate(700px, 500px)')
    expect(ghost!.to).toBe('translate(700px, 350px) scale(1)')
    expect(ghost!.delay).toBe(0)
    // La cara por el proxy de imágenes (no la de YGOPRODeck directa) y el dorso encima, que se va a mitad de camino.
    expect(ghost!.element.querySelector('img')?.getAttribute('src')).toBe('/api/card-image/cards/103.jpg')
    expect(backFade(ghost!.element)).toEqual([1, 0])
    expect(impacts(gy())).toHaveLength(1)
    expect(String(impacts(gy())[0]!.keyframes[0]!.boxShadow)).toContain('192 132 252')
  })

  it('del cementerio al destierro: viaja de cara (no hay dorso que dar vuelta) y el destierro da su golpe ámbar', () => {
    const milled = play(fresh(), { type: 'mill', count: 1 })
    const { rerender } = render(<PileMat state={milled} />)

    rerender(<PileMat state={play(milled, { type: 'move', id: '103', to: 'banished' })} />)

    const [ghost] = ghosts()
    expect(ghosts()).toHaveLength(1)
    expect(ghost!.from).toBe('translate(700px, 350px)')
    expect(ghost!.to).toBe('translate(700px, 200px) scale(1)')
    expect(ghost!.element.querySelector('span')).toBeNull()
    expect(String(impacts(document.querySelector('[data-drop="banished"]')!)[0]!.keyframes[0]!.boxShadow)).toContain('251 191 36')
  })

  it('del Extra al cementerio: sale del Extra de dorso y llega de cara', () => {
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'move', id: '901', to: 'gy' })} />)

    const [ghost] = ghosts()
    expect(ghost!.from).toBe('translate(20px, 500px)')
    expect(ghost!.to).toBe('translate(700px, 350px) scale(1)')
    expect(backFade(ghost!.element)).toEqual([1, 0])
  })

  /** Un Xyz (901) en la zona 3 con 101 y 102 de materiales. */
  const withXyz = () =>
    play(
      fresh(),
      { type: 'place', id: '101', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: '102', zone: 'mz', index: 1, pos: 'atk' },
      { type: 'summon', id: '901', how: 'xyz', materials: ['101', '102'], zone: 'mz', index: 2, pos: 'atk' },
    )

  it('un material que se desprende sale de debajo de su Xyz, de dorso, hasta el cementerio', () => {
    const xyz = withXyz()
    boxes.set('901', at(400, 300))
    const { rerender } = render(<PileMat state={xyz} />)

    rerender(<PileMat state={play(xyz, { type: 'move', id: '101', to: 'gy' })} />)

    const [ghost] = ghosts()
    expect(ghosts()).toHaveLength(1)
    expect(ghost!.from).toBe('translate(400px, 300px)')
    expect(ghost!.to).toBe('translate(700px, 350px) scale(1)')
    expect(backFade(ghost!.element)).toEqual([1, 0])
  })

  it('varias cartas de una jugada salen escalonadas, en el orden en que quedan en la pila, y la pila da un solo golpe', () => {
    const xyz = withXyz()
    boxes.set('901', at(400, 300))
    const { rerender } = render(<PileMat state={xyz} />)

    // El Xyz se va al cementerio y sus materiales con él: primero los materiales (quedan debajo) y al final el Xyz, la carta de arriba.
    rerender(<PileMat state={play(xyz, { type: 'move', id: '901', to: 'gy' })} />)

    expect(ghosts().map((ghost) => ghost.delay)).toEqual([0, FLIGHT_STAGGER_MS, 2 * FLIGHT_STAGGER_MS])
    expect(ghosts().map((ghost) => ghost.element.querySelector('img')?.getAttribute('src'))).toEqual(['101', '102', '901'].map((id) => `/api/card-image/cards/${id}.jpg`))
    // Los materiales salen de donde estaba el Xyz (ya no está en la mesa).
    expect(ghosts().every((ghost) => ghost.from === 'translate(400px, 300px)')).toBe(true)
    expect(impacts(gy())).toHaveLength(1)
    // El golpe, cuando la primera toca el cementerio (del Xyz, en 440, 358, al cementerio, en 740, 408).
    expect(impacts(gy())[0]!.options.delay).toBe(Math.round(flightMs(Math.hypot(300, 50)) * LANDING_AT))
  })

  it('las que salen de lugares distintos (los materiales de una Invocación Xyz) no se tapan: salen juntas, como siempre', () => {
    const field = play(fresh(), { type: 'place', id: '101', zone: 'mz', index: 0, pos: 'atk' }, { type: 'place', id: '102', zone: 'mz', index: 1, pos: 'atk' })
    boxes.set('101', at(200, 300))
    boxes.set('102', at(300, 300))
    const { rerender } = render(<PileMat state={field} />)

    boxes.set('901', at(400, 300))
    rerender(<PileMat state={play(field, { type: 'summon', id: '901', how: 'xyz', materials: ['101', '102'], zone: 'mz', index: 2, pos: 'atk' })} />)

    expect(ghosts().map((ghost) => [ghost.from, ghost.to, ghost.delay])).toEqual([
      ['translate(200px, 300px)', 'translate(400px, 300px) scale(1)', 0],
      ['translate(300px, 300px)', 'translate(400px, 300px) scale(1)', 0],
    ])
  })

  it('mandar tres del deck sale de a una; un cambio de muchas cartas a la vez (otra mano, un salto de pasos) no hace volar las pilas', () => {
    const start = fresh()
    const first = render(<PileMat state={start} />)

    first.rerender(<PileMat state={play(start, { type: 'mill', count: 3 })} />)
    expect(ghosts().map((ghost) => [ghost.from, ghost.delay])).toEqual([0, 1, 2].map((index) => ['translate(700px, 500px)', index * FLIGHT_STAGGER_MS]))
    first.unmount()

    // Más de quince de una pila a otra de una vez ya no es una jugada.
    calls = []
    const many = createMatState(Array.from({ length: 20 }, (_, index) => String(200 + index)), [], 2)
    const second = render(<PileMat state={many} />)
    second.rerender(<PileMat state={play(many, { type: 'mill', count: 16 })} />)
    expect(ghosts()).toHaveLength(0)
  })

  it('un lote de diez (Pot of Desires: el deck entero al destierro boca abajo) vuela entero, escalonado hasta la 8.ª', () => {
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'batch', actions: start.deck.map((id): MatAction => ({ type: 'move', id, to: 'banished', faceDown: true })) })} />)

    expect(ghosts()).toHaveLength(10)
    expect(ghosts().map((ghost) => ghost.delay)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7].map((index) => index * FLIGHT_STAGGER_MS))
    expect(ghosts().every((ghost) => ghost.from === 'translate(700px, 500px)' && ghost.to === 'translate(700px, 200px) scale(1)')).toBe(true)
    // El destierro da un solo golpe.
    expect(impacts(document.querySelector('[data-drop="banished"]')!)).toHaveLength(1)
  })

  it('un salto corto dura menos que uno largo: del deck al cementerio de al lado, 300 ms; del Extra al cementerio, cruzando la mesa, lo más (FLIGHT_MS)', () => {
    const start = fresh()
    const first = render(<PileMat state={start} />)

    first.rerender(<PileMat state={play(start, { type: 'mill', count: 1 })} />)
    expect(ghosts().map((ghost) => ghost.duration)).toEqual([flightMs(150)])
    expect(flightMs(150)).toBe(300)
    first.unmount()

    calls = []
    const second = render(<PileMat state={start} />)
    second.rerender(<PileMat state={play(start, { type: 'move', id: '901', to: 'gy' })} />)
    expect(ghosts().map((ghost) => ghost.duration)).toEqual([FLIGHT_MS])
  })

  it('el giro y el cambio de cara van con el vuelo (la misma duración, la misma espera y la misma curva): de canto justo a mitad de camino', () => {
    // El giro en 3D se suma al vuelo: hace falta que el navegador sepa sumar animaciones.
    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'mill', count: 1 })} />)

    const [ghost] = ghosts()
    const turn = calls.find(({ element, options }) => element === ghost!.element && options.composite === 'add')
    const face = calls.find(({ element }) => element.parentElement === ghost!.element && element.tagName === 'SPAN')
    expect(ghost!.easing).toBe(EASE_IN_OUT)

    for (const call of [turn, face]) {
      expect(call!.options).toMatchObject({ duration: ghost!.duration, delay: ghost!.delay, easing: EASE_IN_OUT })
      // De canto (90°) y el cambio de cara en la mitad del camino, que es la mitad de la curva del vuelo.
      expect(call!.keyframes.filter((frame) => frame.offset === 0.5)).toHaveLength(2)
    }
  })

  it('la pila no se adelanta: muestra su carta de arriba y su contador de antes hasta que la carta llega, y ahí da el golpe', () => {
    const milled = play(fresh(), { type: 'mill', count: 1 })
    const { rerender } = render(<PileMat state={milled} />)

    rerender(<PileMat state={play(milled, { type: 'mill', count: 1 })} />)

    const touch = Math.round(flightMs(150) * LANDING_AT)
    const hold = gy().querySelector<HTMLElement>('[data-flight-hold]')
    // La copia de lo que mostraba (el 103 arriba, 1 carta), encima y sin tocarse ni leerse; lo nuevo (el 104, 2 cartas) queda escondido hasta que la carta llega.
    expect(hold?.textContent).toBe('1031')
    expect(hold?.getAttribute('aria-hidden')).toBe('true')
    expect(hold?.hasAttribute('inert')).toBe(true)
    expect(hold?.className).toContain('pointer-events-none')
    // Su imagen se ve aunque la de la mesa todavía estuviera cargando, y se pide ya.
    expect(hold?.querySelector('img')?.style.opacity).toBe('1')
    expect(hold?.querySelector('img')?.loading).toBe('eager')
    const hidden = calls.filter(({ element, keyframes }) => element.parentElement === gy() && keyframes[0]?.opacity === 0)
    expect(hidden.map(({ element }) => element.textContent)).toEqual(['104', '2'])
    expect(hidden.every(({ options }) => options.duration === touch)).toBe(true)
    // El golpe, cuando la toca; el fantasma se funde con ella desde ese momento.
    expect(impacts(gy())[0]!.options.delay).toBe(touch)
    const fade = calls.find(({ element, keyframes }) => element === ghosts()[0]!.element && keyframes[0]?.opacity === 1 && keyframes[0]?.transform === undefined)
    expect(fade!.options.delay).toBe(touch)
  })

  it('varias a la misma pila: la pila se pone al día cuando llega la última y los fantasmas se funden juntos con ella', () => {
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'mill', count: 3 })} />)

    const first = Math.round(flightMs(150) * LANDING_AT)
    const last = 2 * FLIGHT_STAGGER_MS + first
    const fades = calls.filter(({ element, keyframes }) => 'flightGhost' in (element as HTMLElement).dataset && keyframes[0]?.opacity === 1 && keyframes[0]?.transform === undefined)
    expect(fades.map(({ options }) => options.delay)).toEqual([last, last, last])
    expect(calls.filter(({ element, keyframes }) => element.parentElement === gy() && keyframes[0]?.opacity === 0).every(({ options }) => options.duration === last)).toBe(true)
    // El golpe, con la primera.
    expect(impacts(gy())[0]!.options.delay).toBe(first)
  })

  it('otra jugada con la carta todavía en el aire suelta la pila: muestra ya lo suyo', () => {
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)
    const milled = play(start, { type: 'mill', count: 1 })

    rerender(<PileMat state={milled} />)
    expect(gy().querySelector('[data-flight-hold]')).not.toBeNull()

    rerender(<PileMat state={play(milled, { type: 'draw', count: 1 })} />)
    expect(gy().querySelector('[data-flight-hold]')).toBeNull()
  })

  it('el fantasma vuela dentro de la mesa, debajo de las cartas grandes del centro (z 110 < 120), y no ataja el puntero ni se lee', () => {
    const start = fresh()
    const { container, rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'mill', count: 1 })} />)

    const ghost = document.querySelector<HTMLElement>('[data-flight-ghost]')
    expect(ghost?.parentElement).toBe(container.firstElementChild)
    expect(ghost?.className).toContain('z-110')
    expect(ghost?.className).toContain('pointer-events-none')
    expect(ghost?.getAttribute('aria-hidden')).toBe('true')
  })

  it('con el movimiento reducido no vuela nada y las pilas cambian de una', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    const start = fresh()
    const { rerender } = render(<PileMat state={start} />)

    rerender(<PileMat state={play(start, { type: 'mill', count: 1 })} />)

    expect(ghosts()).toHaveLength(0)
    expect(document.querySelector('[data-flight-hold]')).toBeNull()
    expect(gy().textContent).toBe('1031')
  })

  it('quien mira un duelo también ve volar las cartas: las del de abajo por las marcas propias de la mesa del duelo y las del de arriba por las del rival', () => {
    // Así lo arma la pantalla de quien mira (`WatchFlights`): un vuelo por jugador sobre la misma mesa.
    function Watch({ bottom, top }: { bottom: MatState; top: MatState }) {
      const ref = useRef<HTMLDivElement>(null)

      useCardFlights(ref, bottom, ygoArt, 'watch')
      useCardFlights(ref, top, () => null, 'watch', 'theirs')

      return (
        <Provider store={WATCH_STORE}>
          <div ref={ref}>
            <DuelTable mine={{ state: bottom, artOf: ygoArt }} theirs={{ state: top, artOf: () => null, handCount: top.hand.length }} />
          </div>
        </Provider>
      )
    }
    boxes.set('rival-deck', at(20, 20))
    boxes.set('rival-gy', at(20, 170))
    const bottom = fresh()
    const top = createMatState(['c1', 'c2', 'c3', 'c4'], [], 2)
    const { rerender } = render(<Watch bottom={bottom} top={top} />)

    rerender(<Watch bottom={play(bottom, { type: 'mill', count: 1 })} top={play(top, { type: 'mill', count: 1 })} />)

    expect(ghosts().map((ghost) => [ghost.from, ghost.to])).toEqual([
      ['translate(700px, 500px)', 'translate(700px, 350px) scale(1)'],
      ['translate(20px, 20px) rotate(180deg)', 'translate(20px, 170px) scale(1) rotate(180deg)'],
    ])
  })

  it('de la mano del rival a su cementerio: sale del medio de su mano, de dorso y de cabeza', () => {
    boxes.set('rival-hand', { left: 300, top: 20, width: 240, height: 110 })
    boxes.set('rival-hand-card', { left: 390, top: 25, width: 60, height: 88 })
    boxes.set('rival-gy', at(500, 100))
    const start = createMatState(['c1', 'c2', 'c3', 'c4'], [], 3)
    const { rerender } = render(<RivalPiles state={start} />)

    rerender(<RivalPiles state={play(start, { type: 'move', id: 'c2', to: 'gy' })} />)

    const [ghost] = ghosts()
    expect(ghosts()).toHaveLength(1)
    // Del tamaño de la pila a la que va, centrado en la mano (420, 75).
    expect(ghost!.from).toBe('translate(380px, 17px) rotate(180deg)')
    expect(ghost!.to).toBe('translate(500px, 100px) scale(1) rotate(180deg)')
    // No se sabe qué carta es: dorso todo el camino, sin darse vuelta.
    expect(ghost!.element.querySelector('img')).toBeNull()
    expect(backFade(ghost!.element)).toBeNull()
  })

  it('una carta del rival que vuelve a su mano llega del tamaño de una carta de la mano, no del de toda la mano', () => {
    boxes.set('rival-hand', { left: 300, top: 20, width: 240, height: 110 })
    boxes.set('rival-hand-card', { left: 390, top: 25, width: 60, height: 88 })
    boxes.set('a', at(100, 300))
    const start = play(createMatState(['a', 'b', 'c'], [], 3), { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' })
    const { rerender } = render(<RivalPiles state={start} />)

    rerender(<RivalPiles state={play(start, { type: 'move', id: 'a', to: 'hand' })} />)

    expect(ghosts().map((ghost) => ghost.to)).toEqual(['translate(380px, 17px) scale(0.75) rotate(180deg)'])
  })
})
