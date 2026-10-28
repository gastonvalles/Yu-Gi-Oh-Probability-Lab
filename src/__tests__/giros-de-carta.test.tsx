// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEAL_EDGE_AT } from '../app/deal-flight'
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
  it('el camino y el giro van en una sola animación (sin `composite: add`), la sombra en capas que se funden con `opacity` y el dorso con el mismo reloj', () => {
    const calls: Call[] = []

    Element.prototype.animate = function (this: Element, keyframes, options) {
      calls.push({ element: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions })

      return { cancel() {}, finish() {}, addEventListener() {}, onfinish: null, oncancel: null } as unknown as Animation
    }

    const hand = (cards: HandCardData[]) => (
      <Provider store={store}>
        <PracticeHand
          cards={cards}
          sizeSlots={5}
          maxCardWidth={110}
          fanDegrees={2.2}
          glowOf={() => null}
          dimUnlit={false}
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
    // El camino y el giro 3D son la misma animación (`transform`, muestreada) y ninguna va en `add`: dos animaciones de `transform` sumadas no se componen en la GPU.
    expect(onCard.some((call) => call.options.composite === 'add')).toBe(false)
    const path = onCard.find((call) => call.keyframes.some((frame) => frame.transform !== undefined))!
    // Nada anima `box-shadow` (corre en el hilo principal): la sombra son capas fijas, hijas de la carta, que sólo animan su opacidad con el reloj del vuelo.
    expect(calls.some((call) => call.keyframes.some((frame) => frame.boxShadow !== undefined))).toBe(false)
    const shadows = calls.filter((call) => call.element.parentElement === element && call.element.hasAttribute('data-deal-shadow'))
    const back = calls.find((call) => call.element !== element && call.element.hasAttribute('data-back'))!

    expect(path.keyframes.every((frame) => String(frame.transform).includes('rotateY'))).toBe(true)
    // De canto, el giro salta de 90 a −90 en el mismo instante: dos cuadros con el mismo offset.
    const edge = path.keyframes.filter((frame) => frame.offset !== undefined && Math.abs(Number(frame.offset) - DEAL_EDGE_AT) < 0.001)

    expect(edge.map((frame) => /rotateY\((-?\d+(?:\.\d+)?)deg\)/.exec(String(frame.transform))![1])).toEqual(['90', '-90'])
    expect(shadows).toHaveLength(3)
    for (const shadow of shadows) {
      expect(shadow.keyframes.every((frame) => Object.keys(frame).every((key) => ['offset', 'easing', 'opacity'].includes(key)))).toBe(true)
      expect(shadow.options.duration).toBe(path.options.duration)
    }

    // El dorso se cambia por la cara a mitad de la curva (al quedar de canto), con el mismo reloj que el vuelo.
    expect(back.options).toMatchObject({ duration: path.options.duration, easing: EASE_IN_OUT })
    expect(back.keyframes.find((frame) => frame.offset === 0.5 && frame.opacity === 0)).toBeDefined()
  })
})
