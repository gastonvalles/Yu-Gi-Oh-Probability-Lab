/** @vitest-environment jsdom */
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render as renderBare } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EASE_IN_OUT } from '../app/motion'
import type { CardPose } from '../app/use-card-flights'
import { SPOTLIGHT_TRAVEL_MS, Spotlight } from '../components/probability/MatFx'

// La carta grande del centro sale de su carta en la mesa: jsdom no anima ni mide, así que un `animate` falso anota cada animación y cada elemento mide lo que se le pide.
const original = { animate: Element.prototype.animate, getBoundingClientRect: HTMLElement.prototype.getBoundingClientRect, matchMedia: window.matchMedia }
let calls: Array<{ element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = []

/** El recuadro de la carta grande (400 × 800) y dónde termina la carta, al centro (200 × 292, con su centro en 200, 400). */
const BOUNDS = { left: 0, top: 0, width: 400, height: 800 }
const END = { left: 100, top: 254, width: 200, height: 292 }
const box = (rect: { left: number; top: number; width: number; height: number }) => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect
const reduced = (on: boolean) => ((query: string) => ({ matches: on && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    if (Array.isArray(keyframes)) calls.push({ element: this, keyframes, options: typeof options === 'object' ? options : {} })

    return { cancel: () => {} } as Animation
  }
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    return box(this.hasAttribute('data-activation') ? BOUNDS : this.hasAttribute('data-stage-card') ? END : { left: 0, top: 0, width: 0, height: 0 })
  }
  window.matchMedia = reduced(false)
})

afterEach(() => {
  cleanup()
  Element.prototype.animate = original.animate
  HTMLElement.prototype.getBoundingClientRect = original.getBoundingClientRect
  window.matchMedia = original.matchMedia
})

// La carta lleva su insignia de la banlist (lee el formato del mazo).
const STORE = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={STORE}>{ui}</Provider>)

const CARD = { id: 'c1', name: 'Carta 1', art: null }
/** La carta en la mesa: abajo a la izquierda, de 50 × 73 (un cuarto de la grande). */
const ON_MAT: CardPose = { x: 50, y: 700, width: 50, height: 73, angle: 0 }
const travels = () => calls.filter(({ keyframes }) => keyframes[0]?.transform !== undefined)
const root = () => document.querySelector<HTMLElement>('[data-activation]')!

describe('la carta grande sale de su carta', () => {
  it('viaja desde donde se ve en la mesa (su centro, su tamaño) hasta el centro, en 320 ms y con la curva de lo que viaja; el CSS ya no la hace entrar', () => {
    render(<Spotlight kind="activate" cards={[CARD]} caption="Activás el efecto de Carta 1" origin={() => ON_MAT} />)

    expect(travels()).toHaveLength(1)
    const [travel] = travels()
    expect(travel!.element.getAttribute('data-stage-card')).toBe('c1')
    expect(travel!.keyframes[0]!.transform).toBe('translate(-150px, 300px) rotate(0deg) scale(0.25, 0.25)')
    expect(travel!.keyframes[1]!.transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)')
    expect(travel!.options).toMatchObject({ duration: SPOTLIGHT_TRAVEL_MS, easing: EASE_IN_OUT })
    expect(SPOTLIGHT_TRAVEL_MS).toBe(320)
    // La entrada del CSS (al 55 % y transparente) se apaga, y el cartel aparece en la segunda mitad del viaje.
    expect(root().style.getPropertyValue('--stage-entered')).toBe('1')
    const caption = calls.find(({ element }) => element.textContent === 'Activás el efecto de Carta 1')
    expect(caption!.options).toMatchObject({ delay: SPOTLIGHT_TRAVEL_MS / 2, duration: SPOTLIGHT_TRAVEL_MS / 2, fill: 'backwards' })
  })

  it('la del rival sale de cabeza y se endereza en el camino; una de costado, por el lado más corto', () => {
    render(<Spotlight kind="activate" cards={[CARD, { id: 'c2', name: 'Carta 2', art: null }]} caption={null} origin={(id) => ({ ...ON_MAT, angle: id === 'c1' ? 180 : 270 })} />)

    expect(travels().map(({ keyframes }) => /rotate\(([-\d.]+)deg\)/.exec(String(keyframes[0]!.transform))?.[1])).toEqual(['-180', '-90'])
  })

  it('sin origen (la carta ya no está en la mesa, o queda fuera de la vista) aparece en el centro como siempre: no viaja y el CSS la hace entrar', () => {
    const { unmount } = render(<Spotlight kind="reveal" cards={[CARD]} caption={null} origin={() => null} />)

    expect(calls).toHaveLength(0)
    expect(root().style.getPropertyValue('--stage-entered')).toBe('')
    unmount()

    render(<Spotlight kind="reveal" cards={[CARD]} caption={null} origin={() => ({ ...ON_MAT, y: 900 })} />)
    render(<Spotlight kind="reveal" cards={[CARD]} caption={null} />)
    expect(calls).toHaveLength(0)
  })

  it('con movimiento reducido no se anima nada: la carta está en el centro, como hoy', () => {
    window.matchMedia = reduced(true)

    render(<Spotlight kind="activate" cards={[CARD]} caption="Activás" origin={() => ON_MAT} />)

    expect(calls).toHaveLength(0)
    expect(root().style.getPropertyValue('--stage-entered')).toBe('')
  })
})
