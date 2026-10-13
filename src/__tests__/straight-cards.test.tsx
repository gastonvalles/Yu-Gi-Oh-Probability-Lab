// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import type { DeckCardInstance } from '../app/model'
import { DeckZone } from '../components/DeckZone'
import type { ApiCardSearchResult } from '../ygoprodeck'

const source = (file: string) => readFileSync(path.join(process.cwd(), 'src', file), 'utf8')

const ASH: ApiCardSearchResult = {
  ygoprodeckId: 14558127, name: 'Ash Blossom & Joyous Spring', cardType: 'Tuner Monster', frameType: 'effect', description: null,
  race: 'Zombie', attribute: 'FIRE', level: 3, linkValue: null, atk: '0', def: '1800', archetype: null, ygoprodeckUrl: null,
  imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
}
const CARDS: DeckCardInstance[] = [0, 1, 2].map((index) => ({ instanceId: `ash-${index}`, name: ASH.name, apiCard: ASH, origin: null, roles: [], needsReview: false }))
const noop = () => {}
// La etiqueta de límite de las cartas lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

describe('las cartas van rectas', () => {
  it('la zona del builder recorta lo que sobra, así que no puede llevar esquinas redondeadas: se las daría a las cartas de las puntas', () => {
    render(
      <Provider store={store}>
        <DeckZone
          zone="main"
          title="Main Deck"
          cards={CARDS}
          activeDragInstanceId={null}
          variant="classic-builder"
          desktopCompact
          onDeckCardPointerDown={noop}
          onDeckCardClick={noop}
          onRemoveCard={noop}
        />
      </Provider>,
    )

    const surface = document.querySelector<HTMLElement>('div[data-deck-zone="main"]')

    expect(surface?.style.overflow).toBe('hidden')
    expect(surface?.style.borderRadius).toMatch(/^0(px)?$/)
  })

  it('las fichas de carta que son <button> se declaran rectas: el reset global le da radio a todo <button>', () => {
    // El Meta (con `overflow-hidden`, recortaría la imagen), el comparador (el contorno de lo que cambió) y la carta grande del builder (su foco).
    for (const file of ['components/meta/MetaScreen.tsx', 'components/comparison/BuildDeckView.tsx', 'components/deck-mode/DeckBuilderClassicPreview.tsx']) {
      expect(source(file), file).toContain('rounded-none')
    }
  })
})
