// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { PileViewer } from '../components/probability/MatDialogs'

// El aviso de límite de copias de la carta lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const NAMES: Record<string, string> = { a: 'Carta A', b: 'Carta B', c: 'Carta C' }

/** Los nombres que se leen debajo de cada carta, en el orden en que salen. */
const names = (cards: HTMLElement[]) => cards.map((card) => card.querySelector('.truncate')?.textContent)

function open(pile: 'extra' | 'gy', faceUp: readonly string[]) {
  render(
    <Provider store={store}>
    <PileViewer
      pile={pile}
      ids={['a', 'b', 'c']}
      info={(id) => ({ name: NAMES[id]!, art: null, faceUp: faceUp.includes(id) })}
      targeted={new Set()}
      onPick={vi.fn()}
      onClose={vi.fn()}
    />
    </Provider>,
  )

  return within(screen.getByRole('dialog'))
}

describe('el visor de una pila con cartas boca arriba (el Extra Deck con Monstruos de Péndulo)', () => {
  it('en el Extra, las boca arriba van primero y llevan su etiqueta y su nombre accesible; las demás quedan en su orden', () => {
    const viewer = open('extra', ['c'])

    expect(names(viewer.getAllByRole('listitem'))).toEqual(['Carta C (boca arriba)', 'Carta A', 'Carta B'])
    expect(viewer.getAllByText('Boca arriba')).toHaveLength(1)
  })

  it('sin cartas boca arriba no cambia nada: el orden del Extra es el de siempre', () => {
    const viewer = open('extra', [])

    expect(names(viewer.getAllByRole('listitem'))).toEqual(['Carta A', 'Carta B', 'Carta C'])
    expect(viewer.queryByText('Boca arriba')).not.toBeInTheDocument()
  })
})
