// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { countPlacements, filterMetaDecks, metaPlacements, placementRank, type MetaDeck } from '../app/meta'
import { TournamentDecksScreen } from '../components/meta/TournamentDecksScreen'

// Datos propios: los de verdad cambian todos los días con el workflow. Cinco decks TCG (con «Top 8» repetido) y uno de OCG, el único «Top 16».
vi.mock('../data/meta-decks.json', () => {
  const deck = (id: number, name: string, placement: string | null, region = 'tcg') => ({ id, region, name, date: '2026-10-11', tournament: 'Belen WCQ Regional', placement, players: 200, player: `Jugador ${id}`, cover: null, url: null, main: [], side: [] })

  return {
    default: {
      fetchedAt: '2026-10-12T00:00:00.000Z',
      windowDays: 56,
      source: 'test',
      cards: {},
      decks: [deck(201, 'Elfnote', 'Winner'), deck(202, 'Branded', 'Runner-Up'), deck(203, 'Elfnote', 'Top 4'), deck(204, 'Despia', 'Top 8'), deck(205, 'Sky Striker', 'Top 8'), deck(206, 'Voiceless', 'Top 16', 'ocg'), deck(207, 'Sin puesto', null)],
    },
  }
})

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
const group = () => screen.getByRole('group', { name: 'Puesto' })
const chip = (name: string) => within(group()).getByRole('button', { name })

describe('filtrar los decks de torneo por puesto', () => {
  it('los chips van del campeón para abajo, con cuántos decks hay de cada puesto; «Todos» arranca encendido', () => {
    renderScreen()

    expect(within(group()).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Todos', 'Winner 1', 'Runner-Up 1', 'Top 4 1', 'Top 8 2', 'Top 16 0'])
    expect(within(group()).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    // «Top 16» sólo existe en OCG: en TCG no tiene ninguno y no se puede elegir (pero sigue en su lugar: la fila no cambia de forma).
    expect(chip('Top 16 0')).toBeDisabled()
    expect(names()).toHaveLength(6)
  })

  it('elegir un puesto deja sólo esos decks, y se pueden elegir varios a la vez', () => {
    renderScreen()

    fireEvent.click(chip('Winner 1'))

    expect(names()).toEqual(['Elfnote'])
    expect(chip('Winner 1')).toHaveAttribute('aria-pressed', 'true')
    expect(within(group()).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 deck TCG, del más reciente al más viejo. Tocá uno para verlo entero.')).toBeInTheDocument()

    fireEvent.click(chip('Runner-Up 1'))

    expect(names().sort()).toEqual(['Branded', 'Elfnote'])
    expect(screen.getByText('2 decks TCG, del más reciente al más viejo. Tocá uno para verlo entero.')).toBeInTheDocument()

    // Tocar uno encendido lo apaga; «Todos» apaga todos.
    fireEvent.click(chip('Winner 1'))

    expect(names()).toEqual(['Branded'])

    fireEvent.click(within(group()).getByRole('button', { name: 'Todos' }))

    expect(names()).toHaveLength(6)
    expect(screen.getByText(/^Los 6 decks TCG de las últimas 8 semanas/)).toBeInTheDocument()
  })

  it('se combina con la búsqueda: cada chip cuenta lo que daría con lo demás, y uno elegido no desaparece aunque se quede en cero', () => {
    renderScreen()

    fireEvent.click(chip('Top 8 2'))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar decks' }), { target: { value: 'elfnote' } })

    // Con «elfnote» hay un Winner y un Top 4; ningún Top 8 (el chip elegido queda encendido y con cero, a la vista para apagarlo).
    expect(chip('Winner 1')).toBeEnabled()
    expect(chip('Top 4 1')).toBeEnabled()
    expect(chip('Runner-Up 0')).toBeDisabled()
    expect(chip('Top 8 0')).toBeEnabled()
    expect(chip('Top 8 0')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Ningún deck con esa búsqueda')).toBeInTheDocument()

    fireEvent.click(chip('Top 8 0'))

    expect(names()).toHaveLength(2)
  })
})

describe('los puestos como datos', () => {
  const deck = (placement: string | null, region: MetaDeck['region'] = 'tcg'): MetaDeck => ({ id: 1, region, name: 'D', date: '2026-10-11', tournament: null, placement, players: null, player: null, cover: null, url: null, main: [], side: [] })

  it('se ordenan de mejor a peor: Winner, Runner-Up, Top 4, Top 8, Top 16… y lo que no se reconoce, al final', () => {
    expect(['Top 16', 'Winner', 'Top 4', 'Runner-Up', 'Mejor jugador', 'Top 8'].sort((a, b) => placementRank(a) - placementRank(b))).toEqual(['Winner', 'Runner-Up', 'Top 4', 'Top 8', 'Top 16', 'Mejor jugador'])
    expect(placementRank(' winner ')).toBe(1)
    expect(placementRank('TOP32')).toBe(32)
  })

  it('metaPlacements junta los puestos distintos, y countPlacements cuenta los decks de cada uno', () => {
    const decks = [deck('Top 8'), deck('Winner'), deck('Top 8'), deck(null), deck('Zeta'), deck('Alfa')]

    expect(metaPlacements(decks)).toEqual(['Winner', 'Top 8', 'Alfa', 'Zeta'])
    expect([...countPlacements(decks)]).toEqual([['Top 8', 2], ['Winner', 1], ['Zeta', 1], ['Alfa', 1]])
  })

  it('el filtro acepta varios puestos, deja pasar a todos si no hay ninguno y descarta a los decks sin puesto', () => {
    const decks = [deck('Winner'), deck('Runner-Up'), deck('Top 8'), deck(null)]

    expect(filterMetaDecks(decks, { placements: ['Winner', 'Runner-Up'] }).map((item) => item.placement)).toEqual(['Winner', 'Runner-Up'])
    expect(filterMetaDecks(decks, { placements: [] })).toHaveLength(4)
    expect(filterMetaDecks(decks, {})).toHaveLength(4)
    expect(filterMetaDecks(decks, { placements: ['Top 8'], region: 'ocg' })).toEqual([])
  })
})
