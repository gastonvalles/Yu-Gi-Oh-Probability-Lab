// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toPortableConfig } from '../app/app-state-codec'
import { createInitialState, STORAGE_KEY } from '../app/model'
import genesysCardData from '../data/genesys-card-data.json'
import type { DeckFormat } from '../types'

const { render } = vi.hoisted(() => ({ render: vi.fn() }))

// La pantalla de verdad no hace falta: interesa cuándo se pinta y con qué deck.
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render }) }))
vi.mock('../App', () => ({ default: () => null }))

const [RATED_NAME, RATED_POINTS] = Object.entries(genesysCardData.cards as Record<string, number>).find(([, points]) => points > 0)!

/** Lo que había guardado: un deck con una carta cuyos puntos de Genesys quedaron sin resolver (así están casi todos los decks guardados). */
function saveState(deckFormat: DeckFormat) {
  const state = createInitialState()

  state.deckFormat = deckFormat
  state.deckBuilder.main = [
    {
      instanceId: 'a', name: RATED_NAME, origin: null, roles: [], needsReview: false,
      apiCard: {
        ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: null, linkValue: null, atk: null, def: null,
        archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
      },
    },
  ]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPortableConfig(state)))
}

async function boot() {
  await import('../main')

  const { formatDataLoaded } = await import('../app/format-data')
  const { store } = await import('../app/store')

  return { formatDataLoaded, pointsOfSavedCard: () => store.getState().deckBuilder.main[0]!.apiCard.genesys.points }
}

beforeEach(() => {
  vi.resetModules()
  render.mockClear()
  localStorage.clear()
  document.body.innerHTML = '<div id="app"></div>'
})

afterEach(async () => {
  // Nada de guardados atrasados de este arranque mientras empieza el siguiente.
  ;(await import('../app/store')).stopPersisting()
  vi.doUnmock('../app/format-tables')
  vi.unstubAllGlobals()
})

describe('el arranque con las tablas de Genesys y Edison bajo demanda', () => {
  it('con Genesys guardado, la primera pantalla espera las tablas y el deck ya sale con sus puntos resueltos', async () => {
    saveState('genesys')

    let release!: () => void
    const tablesArrive = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.doMock('../app/format-tables', async (importOriginal) => {
      await tablesArrive
      return importOriginal<typeof import('../app/format-tables')>()
    })

    const { formatDataLoaded, pointsOfSavedCard } = await boot()

    // Se leyó el deck sin las tablas: los puntos quedaron en null y todavía no se pinta nada.
    expect(pointsOfSavedCard()).toBeNull()
    expect(render).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    expect(formatDataLoaded()).toBe(true)
    expect(pointsOfSavedCard()).toBe(RATED_POINTS)
  })

  it('con otro formato pinta enseguida y las tablas llegan después, en un momento ocioso', async () => {
    saveState('tcg')

    const idle: Array<() => void> = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => idle.push(callback))

    const { formatDataLoaded, pointsOfSavedCard } = await boot()

    // Pinta sin esperar las tablas: sólo espera los textos del idioma de la página (el español ya viene con el archivo principal: son un par de microtareas).
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))
    expect(formatDataLoaded()).toBe(false)
    expect(idle).toHaveLength(1)

    idle[0]!()
    await vi.waitFor(() => expect(pointsOfSavedCard()).toBe(RATED_POINTS))

    expect(formatDataLoaded()).toBe(true)
  })

  it('si las tablas no bajan, la primera pantalla se pinta igual y el deck guardado queda como estaba', async () => {
    saveState('edison')
    vi.doMock('../app/format-tables', () => {
      throw new Error('sin red')
    })

    const { formatDataLoaded, pointsOfSavedCard } = await boot()

    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    expect(formatDataLoaded()).toBe(false)
    expect(pointsOfSavedCard()).toBeNull()
  })
})
