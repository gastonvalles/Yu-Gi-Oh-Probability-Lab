// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOCATION as L } from '../app/auto/protocol'
import { SHUFFLE_ID } from '../app/shuffle-fx'
import { SPOTS, fakeSession } from './support/auto-session-fake'
import { core, renderAuto, status } from './support/auto-screen-harness'

// Gastón: «se perdio la animacion de barajado de mano». El barajado de una mano que ordena un efecto (`shuffle_hand` del núcleo) llega por su propio canal (`handShuffles`): la mano de quien
// barajó hace el barajado de la mesa (`shuffleHand`), sin sumar un paso.

const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }

afterEach(() => {
  Object.assign(Element.prototype, { animate: original.animate, getAnimations: original.getAnimations })
  window.matchMedia = original.matchMedia
  vi.unstubAllGlobals()
})

describe('el barajado de una mano por un efecto', () => {
  it('baraja a la vista sólo la mano de quien barajó (la tuya o la del rival), una vez por barajado y sin sumar un paso', () => {
    const fake = renderAuto(fakeSession([...SPOTS, { side: 'theirs', id: 'c2', code: 0, location: L.HAND, sequence: 0 }, { side: 'theirs', id: 'c3', code: 0, location: L.HAND, sequence: 1 }]))
    const steps = status().textContent
    const animated: Element[] = []

    // Con la mano ya repartida (sin movimiento), se pide movimiento: sólo se cuenta el barajado.
    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    Element.prototype.getAnimations = () => []
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: KeyframeAnimationOptions | number) {
      if (typeof options === 'object' && options.id === SHUFFLE_ID) animated.push(this)

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    core(() => fake.set({ handShuffles: [{ at: 0, mine: true }] }))
    expect(animated).toHaveLength(2)
    expect(animated.every((card) => card.closest('[data-drop="hand"]'))).toBe(true)

    animated.length = 0
    core(() => fake.set({ handShuffles: [{ at: 0, mine: true }, { at: 0, mine: false }] }))
    expect(animated).toHaveLength(2)
    expect(animated.every((card) => card.closest('[data-rival-drop="hand"]'))).toBe(true)

    // Rearmar la mesa (deshacer) con menos barajados no baraja nada.
    animated.length = 0
    core(() => fake.set({ handShuffles: [] }))
    expect(animated).toHaveLength(0)
    expect(status().textContent).toBe(steps)
  })
})
