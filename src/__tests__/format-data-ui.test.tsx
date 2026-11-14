// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toPortableConfig } from '../app/app-state-codec'
import { createInitialState, type DeckBuilderState } from '../app/model'
import genesysCardData from '../data/genesys-card-data.json'

const [RATED_NAME, RATED_POINTS] = Object.entries(genesysCardData.cards as Record<string, number>).find(([, points]) => points > 0)!
const EMPTY_DECK: DeckBuilderState = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }

beforeEach(() => {
  // Las tablas arrancan sin cargar, como en la app.
  vi.resetModules()
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.doUnmock('../app/format-tables')
})

describe('lo que lee o elige la persona con las tablas de Genesys y Edison sin cargar', () => {
  it('importar un JSON resuelve igual los puntos de Genesys de las cartas que no los traen', async () => {
    const state = createInitialState()

    state.deckBuilder.main = [
      {
        instanceId: 'a', name: RATED_NAME, origin: null, roles: [], needsReview: false,
        apiCard: {
          ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: null, linkValue: null, atk: null, def: null,
          archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
        },
      },
    ]

    const { DeckImportDrawer } = await import('../components/deck-mode/DeckImportDrawer')
    const { formatDataLoaded } = await import('../app/format-data')
    // El registro limpio trae también un i18n nuevo, que arranca con el idioma del navegador de jsdom (inglés).
    ;(await import('../i18n')).applyLocale('es')
    const onApplyImport = vi.fn()

    expect(formatDataLoaded()).toBe(false)

    render(<DeckImportDrawer isOpen deckBuilder={EMPTY_DECK} deckFormat="unlimited" onApplyImport={onApplyImport} onClose={vi.fn()} />)
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File([JSON.stringify(toPortableConfig(state))], 'Mi deck.json', { type: 'application/json' })] },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Importar al builder' }))

    const imported = onApplyImport.mock.calls[0]![0] as DeckBuilderState

    expect(formatDataLoaded()).toBe(true)
    expect(imported.main.map((card) => card.apiCard.genesys.points)).toEqual([RATED_POINTS])
  })

  async function renderController() {
    const { useDeckModeController } = await import('../components/deck-mode/use-deck-mode-controller')
    const { deckBuilderReducer } = await import('../app/deck-builder-slice')
    const { patternsReducer } = await import('../app/patterns-slice')
    const { settingsReducer } = await import('../app/settings-slice')
    const { formatDataLoaded } = await import('../app/format-data')
    const store = configureStore({ reducer: { settings: settingsReducer, deckBuilder: deckBuilderReducer, patterns: patternsReducer } })
    const { result } = renderHook(() => useDeckModeController(), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    })

    return { changeFormat: (format: 'tcg' | 'genesys' | 'edison') => act(() => void result.current.deckBuilderStep.onDeckFormatChange(format)), formatDataLoaded, store }
  }

  it('elegir Genesys o Edison espera a que bajen las tablas; cualquier otro formato cambia al instante', async () => {
    const { changeFormat, formatDataLoaded, store } = await renderController()

    changeFormat('tcg')
    expect(store.getState().settings.deckFormat).toBe('tcg')
    expect(formatDataLoaded()).toBe(false)

    changeFormat('genesys')
    expect(store.getState().settings.deckFormat).toBe('tcg')
    await waitFor(() => expect(store.getState().settings.deckFormat).toBe('genesys'))
    expect(formatDataLoaded()).toBe(true)

    // Con las tablas ya cargadas no hay nada que esperar.
    changeFormat('edison')
    expect(store.getState().settings.deckFormat).toBe('edison')
  })

  it('si las tablas no bajan, el formato cambia igual', async () => {
    vi.doMock('../app/format-tables', () => {
      throw new Error('sin red')
    })

    const { changeFormat, formatDataLoaded, store } = await renderController()

    changeFormat('edison')
    await waitFor(() => expect(store.getState().settings.deckFormat).toBe('edison'))
    expect(formatDataLoaded()).toBe(false)
  })
})
