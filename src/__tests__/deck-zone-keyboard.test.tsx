// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import type { DeckCardInstance } from '../app/model'
import { DeckZone } from '../components/DeckZone'
import { navItemDescription } from '../components/shell/nav-model'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../app/store', () => ({ stopPersisting: () => {} }))

const apiCard = (ygoprodeckId: number): ApiCardSearchResult => ({
  ygoprodeckId, name: `Carta ${ygoprodeckId}`, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4, linkValue: null, atk: '0', def: '0',
  archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

const cards: DeckCardInstance[] = [1, 2].map((id) => ({ instanceId: `i${id}`, name: `Carta ${id}`, apiCard: apiCard(id), origin: null, roles: [], needsReview: false }))

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

function setup(extra: { keyboardRemove?: boolean; cardAction?: boolean } = {}) {
  const onDeckCardClick = vi.fn()
  const onRemoveCard = vi.fn()

  render(
    <Provider store={store}>
      <DeckZone
        zone="main"
        title="Main Deck"
        cards={cards}
        activeDragInstanceId={null}
        cardAction={extra.cardAction === false ? undefined : (card) => `${card.name}. Enter para ver el detalle, Supr para quitarla del deck.`}
        keyboardRemove={extra.keyboardRemove}
        onDeckCardPointerDown={() => {}}
        onDeckCardClick={onDeckCardClick}
        onRemoveCard={onRemoveCard}
      />
    </Provider>,
  )

  return { onDeckCardClick, onRemoveCard }
}

describe('las cartas del deck con teclado', () => {
  it('cada carta se enfoca con Tab, dice qué hacen Enter y Supr, y Enter abre el detalle', () => {
    const { onDeckCardClick } = setup({ keyboardRemove: true })
    const card = screen.getByRole('button', { name: /^Carta 1\. Enter para ver el detalle/ })

    expect(card).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onDeckCardClick).toHaveBeenCalledTimes(2)
    expect(onDeckCardClick).toHaveBeenCalledWith('i1')
  })

  it('Supr y Retroceso la quitan del deck, como el clic derecho, sólo donde se pidió (el builder)', () => {
    const { onRemoveCard } = setup({ keyboardRemove: true })

    fireEvent.keyDown(screen.getByRole('button', { name: /^Carta 2\./ }), { key: 'Delete' })
    expect(onRemoveCard).toHaveBeenCalledWith('i2')
    fireEvent.keyDown(screen.getByRole('button', { name: /^Carta 1\./ }), { key: 'Backspace' })
    expect(onRemoveCard).toHaveBeenCalledWith('i1')
  })

  it('al quitar una con Supr el foco pasa a la que ocupa su lugar (la última si era la última), no se pierde en el body', async () => {
    const three = [1, 2, 3].map((id) => ({ instanceId: `i${id}`, name: `Carta ${id}`, apiCard: apiCard(id), origin: null, roles: [], needsReview: false }))

    function Zone() {
      const [current, setCurrent] = useState(three)

      return (
        <Provider store={store}>
          <DeckZone
            zone="main"
            title="Main Deck"
            cards={current}
            activeDragInstanceId={null}
            cardAction={(card) => `${card.name}. Supr para quitarla.`}
            keyboardRemove
            onDeckCardPointerDown={() => {}}
            onDeckCardClick={() => {}}
            onRemoveCard={(id) => setCurrent((cards_) => cards_.filter((card) => card.instanceId !== id))}
          />
        </Provider>
      )
    }

    render(<Zone />)
    const second = screen.getByRole('button', { name: /^Carta 2\./ })

    second.focus()
    fireEvent.keyDown(second, { key: 'Delete' })
    await waitFor(() => expect(screen.getByRole('button', { name: /^Carta 3\./ })).toHaveFocus())

    // La última de la zona: el foco retrocede a la que queda antes.
    fireEvent.keyDown(screen.getByRole('button', { name: /^Carta 3\./ }), { key: 'Delete' })
    await waitFor(() => expect(screen.getByRole('button', { name: /^Carta 1\./ })).toHaveFocus())
  })

  it('sin pedirlo (otras pantallas), Supr no quita nada', () => {
    const { onRemoveCard } = setup()

    fireEvent.keyDown(screen.getByRole('button', { name: /^Carta 1\./ }), { key: 'Delete' })
    expect(onRemoveCard).not.toHaveBeenCalled()
  })
})

describe('los nombres accesibles del menú', () => {
  it('un paso dice cómo viene («Listo»); una referencia (con su línea que explica) no dice «Pendiente»', () => {
    expect(navItemDescription({ key: 'deck-builder', label: 'Deck', title: 'Deck Builder', icon: 'cards', detail: 'Base principal lista.', tone: 'complete' })).toBe('Deck Builder. Listo. Base principal lista.')
    expect(navItemDescription({ key: 'meta', label: 'Tier lists', title: 'Tier lists', icon: 'chart', detail: 'Hand traps y boardbreakers.', tone: 'pending', blurb: 'Hand traps y boardbreakers de los torneos' })).toBe('Tier lists. Hand traps y boardbreakers.')
  })
})
