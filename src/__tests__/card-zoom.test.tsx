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

  it('con vecinos lleva las flechas a los costados (y ← → también); hacia el lado donde no hay carta la flecha no se muestra, y ninguna cierra el zoom', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const onClose = vi.fn()

    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" navigation={{ onPrevious, onNext }} onClose={onClose} />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onPrevious).toHaveBeenCalledTimes(2)
    expect(onNext).toHaveBeenCalledTimes(2)
    // Con una tecla de edición, las flechas no pasan de carta.
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('en la punta de la lista no hay flecha hacia ese lado, y sin vecinos no hay ninguna', () => {
    const { rerender } = render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" navigation={{ onPrevious: null, onNext: () => {} }} onClose={() => {}} />
      </Provider>,
    )

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carta siguiente' })).toBeInTheDocument()

    rerender(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={() => {}} />
      </Provider>,
    )
    expect(screen.queryByRole('button', { name: /^Carta (anterior|siguiente)$/ })).not.toBeInTheDocument()
  })

  it('al pasar a otra carta vuelve al frente (la que se había dado vuelta no queda del otro lado)', () => {
    const view = render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={() => {}} />
      </Provider>,
    )
    const flipped = () => view.container.ownerDocument.querySelector('[data-flipped]')?.getAttribute('data-flipped')

    fireEvent.keyDown(window, { key: 'f' })
    expect(flipped()).toBe('true')

    view.rerender(
      <Provider store={store}>
        <CardZoom card={{ ...card, ygoprodeckId: 2 }} name="Otra" onClose={() => {}} />
      </Provider>,
    )
    expect(flipped()).toBe('false')
  })
})
