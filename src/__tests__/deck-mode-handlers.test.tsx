// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'

import { addSearchResultToDeckZone, deckBuilderReducer, setDeckName } from '../app/deck-builder-slice'
import { patternsReducer } from '../app/patterns-slice'
import { settingsReducer } from '../app/settings-slice'
import { useDeckModeController } from '../components/deck-mode/use-deck-mode-controller'
import type { ApiCardSearchResult } from '../ygoprodeck'

const CARD: ApiCardSearchResult = {
  ygoprodeckId: 1, name: 'Carta 1', cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
}

afterEach(cleanup)

describe('los manejadores de las cartas del deck', () => {
  it('no cambian al editar el deck (las zonas con memo no se redibujan) y aun así ven el deck de ahora', () => {
    const store = configureStore({ reducer: { settings: settingsReducer, deckBuilder: deckBuilderReducer, patterns: patternsReducer } })
    const { result } = renderHook(() => useDeckModeController(), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    })
    const { onDeckCardClick, onDeckCardPointerDown } = result.current.deckBuilderStep

    act(() => void store.dispatch(setDeckName('Otro nombre')))
    act(() => void store.dispatch(addSearchResultToDeckZone({ apiCardId: 1, deckFormat: 'unlimited', index: 0, results: [CARD], zone: 'main' })))

    expect(result.current.deckBuilderStep.onDeckCardClick).toBe(onDeckCardClick)
    expect(result.current.deckBuilderStep.onDeckCardPointerDown).toBe(onDeckCardPointerDown)

    // La carta se sumó después de armar el manejador: igual la encuentra.
    act(() => onDeckCardClick(store.getState().deckBuilder.main[0]!.instanceId))
    expect(result.current.deckBuilderStep.selectedDetailCard?.name).toBe('Carta 1')
  })
})
