// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { CardZoom } from '../components/card-detail/CardZoom'
import type { ApiCardReference } from '../types'

// El aviso de límite de copias de la carta lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const card = {
  ygoprodeckId: 1,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: 4,
  linkValue: null,
  atk: '0',
  def: '0',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardReference

describe('la carta en grande', () => {
  it('se cierra sólo con la X o con Escape: un clic suelto no la cierra', () => {
    const onClose = vi.fn()
    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={onClose} />
      </Provider>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Maxx en grande' })

    fireEvent.click(dialog)
    fireEvent.click(dialog.firstElementChild!)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
