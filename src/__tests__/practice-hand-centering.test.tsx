// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'

import { PracticeHand, type HandCardData } from '../components/probability/PracticeHand'

afterEach(cleanup)

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const cards = (count: number): HandCardData[] => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, name: `Carta ${index}`, apiCard: null }))

function Hand({ count }: { count: number }) {
  return (
    <Provider store={store}>
      <PracticeHand
        cards={cards(count)}
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
        dealsFromDeck={() => false}
        getField={() => null}
        onReorder={() => undefined}
        onTap={() => undefined}
        onDragOver={() => undefined}
        onDrop={() => undefined}
      />
    </Provider>
  )
}

/** Dónde empieza (x) cada carta de la mano, de izquierda a derecha. */
const lefts = () =>
  screen.getAllByRole('listitem').map((item) => {
    const match = /translate3d\((-?[\d.]+)px/.exec(item.style.transform)

    return Number(match?.[1])
  })

describe('la mano en abanico', () => {
  it('al salir cartas, las que quedan se vuelven a centrar (la mano nunca queda corrida hacia un lado)', () => {
    // jsdom no mide: el ancho es el de reserva (340 px) y las cartas miden lo que da la mano inicial (5).
    const { rerender } = render(<Hand count={5} />)

    // El centro de la mano (entre el borde izquierdo de la primera y el derecho de la última) es el del contenedor, con 5, 4, 3, 2 y 1 cartas.
    const containerWidth = 340
    const widthOfCard = Math.min(110, containerWidth / (1 + 4 * 0.55))

    for (const count of [5, 4, 3, 2, 1]) {
      rerender(<Hand count={count} />)
      const xs = lefts()

      expect(xs).toHaveLength(count)
      expect((xs[0]! + xs[count - 1]! + widthOfCard) / 2).toBeCloseTo(containerWidth / 2, 1)
    }
  })
})
