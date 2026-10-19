// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { filterMetaDecks, metaMonth, type MetaDeck } from '../app/meta'
import { TournamentDecksScreen } from '../components/meta/TournamentDecksScreen'

// Datos propios: los de verdad cambian todos los días. Cinco decks TCG: tres de octubre (el mes de la última actualización) y dos de septiembre; dos de ellos tienen replay.
vi.mock('../data/meta-decks.json', () => {
  const deck = (id: number, name: string, date: string, placement = 'Top 8') => ({ id, region: 'tcg', name, date, tournament: 'Belen WCQ Regional', placement, players: 200, player: `Jugador ${id}`, cover: null, url: null, main: [], side: [] })

  return {
    default: {
      fetchedAt: '2026-10-12T00:00:00.000Z',
      windowDays: 56,
      source: 'test',
      cards: {},
      decks: [deck(301, 'Elfnote', '2026-10-11', 'Winner'), deck(302, 'Branded', '2026-10-05', 'Top 4'), deck(303, 'Despia', '2026-10-02'), deck(304, 'Sky Striker', '2026-09-27', 'Winner'), deck(305, 'Voiceless', '2026-09-20')],
    },
  }
})

// Los decks con replay (302 y 304): el cruce de verdad se prueba en replays.test.ts.
vi.mock('../app/replays', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/replays')>()), deckIdsWithReplay: () => new Set([302, 304]) }))

// Al cambiar de filtro la lista muestra lugares vacíos un segundo (como en los replays): acá se prueba lo que queda después.
vi.mock('../app/use-brief-loading', () => ({ BRIEF_LOADING_MS: 0, useBriefLoading: () => false }))

beforeEach(() => {
  window.history.replaceState(null, '', '#tournaments')
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(cleanup)

function renderScreen() {
  const store = configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state,
      deckBuilder: (state = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }) => state,
    },
  })

  return render(
    <Provider store={store}>
      <TournamentDecksScreen />
    </Provider>,
  )
}

const names = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
const extras = () => screen.getByRole('group', { name: 'Cuándo y replays' })
const extra = (name: string) => within(extras()).getByRole('button', { name })
const placement = (name: string) => within(screen.getByRole('group', { name: 'Puesto' })).getByRole('button', { name })

describe('«Este mes» y «Con replay» en los decks de torneo', () => {
  it('están al lado de los puestos, con cuántos decks da cada uno; son interruptores sueltos (sin «Todos»), apagados al arrancar', () => {
    renderScreen()

    expect(within(extras()).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Este mes 3', 'Con replay 2'])
    expect(extra('Este mes 3')).toHaveAttribute('aria-pressed', 'false')
    expect(extra('Con replay 2')).toHaveAttribute('aria-pressed', 'false')
    expect(names()).toHaveLength(5)
  })

  it('«Este mes» deja los del mes de la última actualización de los datos', () => {
    renderScreen()

    fireEvent.click(extra('Este mes 3'))

    expect(names().sort()).toEqual(['Branded', 'Despia', 'Elfnote'])
    expect(extra('Este mes 3')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3 decks TCG, del más reciente al más viejo. Tocá uno para verlo entero.')).toBeInTheDocument()
  })

  it('«Con replay» deja los que tienen replay, y los dos se suman: cada chip cuenta lo que daría con el otro encendido', () => {
    renderScreen()

    fireEvent.click(extra('Con replay 2'))
    expect(names().sort()).toEqual(['Branded', 'Sky Striker'])

    // Con replay y de este mes queda uno (el de septiembre sale), y «Este mes» cuenta los de octubre que tienen replay.
    expect(extra('Este mes 1')).toBeInTheDocument()
    fireEvent.click(extra('Este mes 1'))
    expect(names()).toEqual(['Branded'])
    expect(extra('Con replay 1')).toBeInTheDocument()
  })

  it('se combinan con el puesto y cada uno se apaga tocándolo de nuevo', () => {
    renderScreen()

    fireEvent.click(placement('Winner 2'))
    expect(names().sort()).toEqual(['Elfnote', 'Sky Striker'])

    fireEvent.click(extra('Este mes 1'))
    expect(names()).toEqual(['Elfnote'])
    // Los chips de puesto cuentan lo que daría «Este mes».
    expect(placement('Winner 1')).toBeInTheDocument()

    fireEvent.click(extra('Este mes 1'))
    expect(names().sort()).toEqual(['Elfnote', 'Sky Striker'])
    expect(extra('Este mes 1')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('filterMetaDecks con mes y con ids', () => {
  const deck = (id: number, date: string) => ({ id, date }) as MetaDeck

  it('el mes es el que empieza la fecha del torneo, y los ids, los que se pidieron', () => {
    const decks = [deck(1, '2026-10-11'), deck(2, '2026-09-30'), deck(3, '2026-10-01')]

    expect(filterMetaDecks(decks, { month: '2026-10' }).map((item) => item.id)).toEqual([1, 3])
    expect(filterMetaDecks(decks, { ids: new Set([2, 3]) }).map((item) => item.id)).toEqual([2, 3])
    expect(filterMetaDecks(decks, { month: '2026-10', ids: new Set([2, 3]) }).map((item) => item.id)).toEqual([3])
    expect(filterMetaDecks(decks, {}).map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('«este mes» es el mes de la última actualización de los datos (en UTC, como el snapshot)', () => {
    expect(metaMonth({ fetchedAt: '2026-10-31T23:59:00.000Z' })).toBe('2026-10')
    expect(metaMonth({ fetchedAt: '2026-11-01T00:00:00.000Z' })).toBe('2026-11')
  })
})
