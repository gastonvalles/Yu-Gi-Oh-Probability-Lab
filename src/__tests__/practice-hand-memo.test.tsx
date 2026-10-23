// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandCardData } from '../components/probability/PracticeHand'

// El arte sin `memo` y con un contador: cada vez que se redibuja una carta de la mano, se redibuja su arte.
const artRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock('../components/CardArt', () => ({
  CardArt: () => {
    artRenders.count += 1
    return null
  },
}))

const { PracticeHand } = await import('../components/probability/PracticeHand')

afterEach(cleanup)

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const CARDS: HandCardData[] = Array.from({ length: 3 }, (_, index) => ({ id: `c${index}`, name: `Carta ${index}`, apiCard: null }))

function Hand({ selectedId }: { selectedId: string | null }) {
  return (
    <Provider store={store}>
      <PracticeHand
        cards={CARDS}
        sizeSlots={5}
        maxCardWidth={110}
        fanDegrees={2.2}
        highlighted={new Set()}
        highlightKind={null}
        muted={false}
        flash={null}
        targeted={new Set()}
        selectedId={selectedId}
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

describe('la mano de la mesa no se redibuja entera', () => {
  it('un toque que elige una carta sólo redibuja esa carta, aunque la mesa vuelva a dibujar la mano con funciones nuevas', () => {
    const view = render(<Hand selectedId={null} />)

    artRenders.count = 0
    view.rerender(<Hand selectedId={null} />)
    expect(artRenders.count).toBe(0)

    view.rerender(<Hand selectedId="c1" />)
    expect(artRenders.count).toBe(1)
  })
})
