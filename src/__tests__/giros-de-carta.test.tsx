// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EASE_IN_OUT } from '../app/motion'
import { PracticeHand, type HandCardData } from '../components/probability/PracticeHand'

const originalAnimate = Element.prototype.animate

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Element.prototype.animate = originalAnimate
})

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const card: HandCardData = { id: 'c0', name: 'Carta', apiCard: null }

interface Call {
  element: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

describe('repartir una carta desde el mazo', () => {
  it('el giro va aparte del camino, con la curva de los vuelos de punta a punta, y el dorso con el mismo reloj', () => {
    // Con composición (`composite`), como en un navegador de verdad: sin ella no hay giro aparte.
    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    const calls: Call[] = []

    Element.prototype.animate = function (this: Element, keyframes, options) {
      calls.push({ element: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions })

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }

    const hand = (cards: HandCardData[]) => (
      <Provider store={store}>
        <PracticeHand
          cards={cards}
          sizeSlots={5}
          maxCardWidth={110}
          fanDegrees={2.2}
          highlighted={new Set()}
          highlightKind={null}
          muted={false}
          flash={null}
          targeted={new Set()}
          selectedId={null}
          getDeckRect={() => null}
          dealsFromDeck={() => true}
          getField={() => null}
          onReorder={() => undefined}
          onTap={() => undefined}
          onDragOver={() => undefined}
          onDrop={() => undefined}
        />
      </Provider>
    )

    // La mano ya está montada cuando llega la carta (como en la mesa): la carta que se reparte se monta después.
    const { rerender } = render(hand([]))
    rerender(hand([card]))

    const element = document.querySelector('[data-card-id="c0"]')!
    const onCard = calls.filter((call) => call.element === element)
    const path = onCard.find((call) => call.options.composite === undefined)!
    const turn = onCard.find((call) => call.options.composite === 'add')!
    const back = calls.find((call) => call.element !== element && call.element.hasAttribute('data-back'))!

    // El camino no gira: el giro es la animación aditiva, de punta a punta con una sola curva.
    expect(path.keyframes.some((frame) => String(frame.transform).includes('rotateY'))).toBe(false)
    expect(path.keyframes[0]!.easing).toBe(EASE_IN_OUT)
    expect(turn.options.easing).toBe(EASE_IN_OUT)
    expect(turn.keyframes.every((frame) => String(frame.transform).includes('rotateY'))).toBe(true)
    expect(turn.keyframes.find((frame) => frame.offset === 0.5)).toBeDefined()

    // El dorso se cambia por la cara a mitad de la curva (al quedar de canto), con el mismo reloj que el giro.
    expect(back.options).toMatchObject({ duration: turn.options.duration, easing: EASE_IN_OUT })
    expect(back.keyframes.find((frame) => frame.offset === 0.5 && frame.opacity === 0)).toBeDefined()
  })
})
