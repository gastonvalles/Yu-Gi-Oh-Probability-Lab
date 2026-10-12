// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildVerdict, compareBuilds } from '../app/build-comparison'
import { buildMetaReport, type HandtrapStat, type MetaDeck, type MetaDecksData } from '../app/meta-handtraps'
import type { DeckCardInstance } from '../app/model'
import { matchReplays, readStage } from '../app/replays'
import { createSavedBuild, uniqueBuildName } from '../app/saved-builds'
import { ComparisonReport } from '../components/comparison/ComparisonReport'
import { KpiDetailModal } from '../components/comparison/KpiDetailModal'
import { MetaScreen } from '../components/meta/MetaScreen'
import { formatMetaDate, formatMetaDateFull, tierHint, tierLabel, trendText, usageText } from '../components/meta/meta-format'
import { ReplaysScreen } from '../components/replays/ReplaysScreen'
import { applyLocale, t } from '../i18n'
import type { ApiCardReference, CardEntry, CardRole } from '../types'

// Datos propios: los de verdad cambian todos los días con el workflow.
vi.mock('../data/replays.json', () => ({
  default: {
    fetchedAt: '2026-10-12T07:00:00.000Z',
    windowDays: 75,
    channels: {
      eu: { name: 'Yu-Gi-Oh! TCG Europe', url: 'https://www.youtube.com/@YuGiOhCardEU' },
      tcg: { name: 'Yu-Gi-Oh! TCG', url: 'https://www.youtube.com/@OfficialYuGiOhTCG' },
    },
    videos: [
      { id: 'aaaaaaaaaa1', channel: 'eu', title: 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.', duration: '31:38', date: '2026-09-21' },
      { id: 'aaaaaaaaaa2', channel: 'eu', title: 'YCS Paris 2026 - Day 2 - Round 13 - Usama B. vs. Pascal K.', duration: '40:31', date: '2026-09-21' },
      { id: 'aaaaaaaaaa3', channel: 'eu', title: 'YCS Paris 2026 - Day 1 - Round 5 - Muhammed K. vs. Nathan F.', duration: '50:45', date: '2026-09-21' },
    ],
  },
}))

vi.mock('../data/meta-decks.json', () => {
  const deck = (id: number, name: string, player: string, placement: string) => ({ id, region: 'tcg', name, date: '2026-09-19', tournament: 'YCS Paris', placement, players: 500, player, cover: null, url: null, main: [], side: [] })

  return {
    default: {
      fetchedAt: '2026-10-12T00:00:00.000Z',
      windowDays: 56,
      source: 'test',
      cards: {},
      decks: [deck(101, 'Elfnote', 'Timoti Baggio', 'Runner-Up'), deck(102, 'Azamina Mitsurugi', 'Vladis Baranovskis', 'Winner'), deck(103, 'Sky Striker', 'Pascal Kihm', 'Top 32')],
    },
  }
})

beforeEach(() => {
  window.history.replaceState(null, '', '#replays')
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  applyLocale('es')
})

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

const filler = (count: number) => Array.from({ length: count }, (_, index) => card(`f${index}`, 1, ['enabler']))
const OLD = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('b1', 3, ['brick']), ...filler(31)]
const NEW = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 3, ['starter']), ...filler(31)]
const RULES = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }

const clean = (first: number, second: number) => ({
  first: { a: 0.5, b: 0.5 + first, delta: first },
  second: { a: 0.5, b: 0.5 + second, delta: second },
  average: { a: 0.5, b: 0.5 + (first + second) / 2, delta: (first + second) / 2 },
})

describe('Comparar builds en inglés', () => {
  it('el veredicto nombra a la build ganadora, la letra si se llaman igual, y explica cada caso', () => {
    applyLocale('en')

    expect(buildVerdict('Mitsurugi', 'Gatos', clean(0.03, 0.02), false)).toMatchObject({ kind: 'b', title: 'Gatos is better', detail: 'Gets more clean hands on average.' })
    expect(buildVerdict('Deck', 'Deck', clean(0.03, 0.02), false).title).toBe('Deck (B) is better')
    expect(buildVerdict('Mitsurugi', 'Gatos', clean(0.03, -0.02), false)).toMatchObject({
      title: 'Depends on the turn',
      detail: 'Gatos is better going first and Mitsurugi going second.',
    })
    expect(buildVerdict('A', 'B', clean(0.001, -0.002), false).title).toBe('They perform the same')
    expect(buildVerdict('A', 'B', null, false).title).toBe('Missing information to compare')
    expect(buildVerdict('A', 'B', clean(0.03, 0.02), true).title).toBe("They're identical")
  })

  it('un Main Deck chico no se calcula y dice cuántas cartas hacen falta', () => {
    applyLocale('en')

    const tiny = compareBuilds({ name: 'A', cards: OLD }, { name: 'B', cards: [card('s1', 3, ['starter'])] }, RULES)

    expect(tiny.b.blockedReasons).toEqual(['The Main Deck needs at least 6 cards.'])
  })

  it('el informe lleva los títulos, los turnos y el aviso de cartas sin clasificar con su plural', () => {
    applyLocale('en')

    const better = compareBuilds({ name: 'Old', cards: OLD }, { name: 'New', cards: NEW }, RULES)
    const first = render(<ComparisonReport comparison={better} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    expect(screen.getByText('New is better')).toBeInTheDocument()
    for (const text of ['Clean hands', 'Going first', 'Going second', 'Average', 'What changes in the Main Deck', 'Where each one wins']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByText('Roles')).toBeInTheDocument()
    // Un anillo por turno y por build; cada uno dice de qué build es.
    expect(screen.getAllByLabelText(/^Clean hands of build [AB]: \d+\.\d%$/)).toHaveLength(6)
    first.unmount()

    const pending = [...OLD.slice(0, -1), { ...card('x', 1, []), origin: null }]
    const incomplete = compareBuilds({ name: 'Old', cards: OLD }, { name: 'New', cards: pending }, RULES)
    render(<ComparisonReport comparison={incomplete} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    expect(screen.getByText('Build B: 1 unclassified card')).toBeInTheDocument()
    expect(screen.getByText('Classify them so the comparison is accurate.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View cards' })).toBeInTheDocument()
  })

  it('el nombre de una build sin nombre y los plurales de las cartas', () => {
    applyLocale('en')

    const first = createSavedBuild('  ', { main: [], extra: [], side: [] }, [])

    expect(first.name).toBe('Untitled build')
    expect(uniqueBuildName('', [first])).toBe('Untitled build (2)')
    expect(t('meta.compare.pending', { side: 'A', count: 3 })).toBe('Build A: 3 unclassified cards')
    expect(t('meta.deckModal.loadedMissing', { name: 'Elfnote', count: 1 })).toBe('Elfnote loaded into the builder with 1 fewer card (outside the format or unknown).')
    expect(t('meta.deckModal.loadedMissing', { name: 'Elfnote', count: 4 })).toBe('Elfnote loaded into the builder with 4 fewer cards (outside the format or unknown).')
    expect(t('meta.deckModal.watchReplays', { count: 1 })).toBe('Watch the replay')
    expect(t('meta.deckModal.watchReplays', { count: 3 })).toBe('Watch 3 replays')
  })

  it('la ventana de cartas de un anillo cuenta las cartas en inglés', () => {
    applyLocale('en')

    const apiCard = { ygoprodeckId: 1, cardType: 'Effect Monster', frameType: 'effect', imageUrlSmall: null } as ApiCardReference
    const instance = (name: string, needsReview: boolean): DeckCardInstance => ({ instanceId: name, name, apiCard, origin: 'non_engine', roles: ['handtrap'], needsReview })
    const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' }) => state } })

    render(
      <Provider store={store}>
        <KpiDetailModal isOpen label="Handtrap" roles={['handtrap']} side="B" mainDeck={[instance('Ash Blossom', true), instance('Ash Blossom', true)]} onCardClick={() => {}} onClose={() => {}} />
      </Provider>,
    )

    expect(screen.getByText('Build B')).toBeInTheDocument()
    expect(screen.getByText('Which cards count as Handtrap?')).toBeInTheDocument()
    expect(screen.getByText('2 cards')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
  })
})

describe('Meta en inglés', () => {
  it('la pestaña se dibuja en inglés: encabezado, ayuda, controles y la lista de decks con su plural', () => {
    applyLocale('en')
    window.history.replaceState(null, '', '#meta')
    // En escritorio los controles del tier list se ven en la pantalla (en celular van en una ventana aparte).
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const store = configureStore({
      reducer: {
        settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state,
        deckBuilder: (state = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }) => state,
      },
    })
    const view = render(
      <Provider store={store}>
        <MetaScreen />
      </Provider>,
    )

    expect(screen.getByRole('heading', { name: 'Meta hand traps' })).toBeInTheDocument()
    // Con una zona vacía no hay tier list: la ventana lo dice.
    expect(screen.getByText('No hand traps in this window')).toBeInTheDocument()
    expect(screen.getByText('The 3 TCG decks from the last 8 weeks, from newest to oldest. Tap one to see it in full.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '4 wks' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Projection' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search decks' })).toHaveAttribute('placeholder', 'Deck, event or player')
    expect(screen.getByText('Top 32 (500 players)')).toBeInTheDocument()
    // La fecha de la actualización es la del usuario: se mira el formato (mes en letras), no el día.
    expect(view.container.querySelector('[title="Date of the last deck update"]')).toHaveTextContent(/^Updated [A-Z][a-z]{2} \d{1,2}, 2026$/)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search decks' }), { target: { value: 'elfnote' } })
    expect(screen.getByText('1 TCG deck from the last 8 weeks, from newest to oldest. Tap it to see it in full.')).toBeInTheDocument()
  })

  const stat = (patch: Partial<HandtrapStat>): HandtrapStat =>
    ({ id: 1, name: 'Ash', image: null, decks: 4, share: 0.25, tier: 'B', main: { decks: 0, copies: 0 }, side: { decks: 0, copies: 0 }, weekly: [], projectedShare: 0.25, projectedTier: 'B', trend: 'flat', archetypes: [], ...patch }) as HandtrapStat

  it('las etiquetas de los tiers y lo que dice cada piso', () => {
    applyLocale('en')

    expect([tierLabel('S'), tierLabel('C'), tierLabel('D')]).toEqual(['TIER S', 'MEH', '😭'])
    expect(tierHint('S')).toBe('At least 60% of decks')
    expect(tierHint('D')).toBe('Less than 5% of decks')
  })

  it('la tendencia dice si sube o baja, a cuánto y, si cambia, a qué tier', () => {
    applyLocale('en')

    expect(trendText(stat({}))).toBe('Steady')
    expect(trendText(stat({ trend: 'up', projectedShare: 0.31 }))).toBe('Rising to 31%')
    expect(trendText(stat({ trend: 'down', projectedShare: 0.12, projectedTier: 'C' }))).toBe('Falling to 12% · MEH')
    expect(usageText(2, 5, 4)).toBe('50% ×2.5')
    expect(usageText(0, 0, 4)).toBe('0%')
  })

  it('las fechas llevan el mes en letras en inglés y no cambian en español', () => {
    applyLocale('en')

    expect(formatMetaDate('2026-10-08')).toBe('Oct 8')
    expect(formatMetaDateFull('2026-10-08T12:00:00.000Z')).toBe('Oct 8, 2026')

    applyLocale('es')

    expect(formatMetaDate('2026-10-08')).toBe('8 oct')
    expect(formatMetaDateFull('2026-10-08T12:00:00.000Z')).toBe('08/10/2026')
    expect(tierHint('S')).toBe('Al menos el 60% de los decks')
    expect(trendText(stat({ trend: 'up', projectedShare: 0.31 }))).toBe('Sube a 31%')
    expect(usageText(2, 5, 4)).toBe('50% ×2,5')
  })

  it('una hand trap que los datos no conocen se llama Card + su id', () => {
    applyLocale('en')

    const deck = (id: number): MetaDeck => ({ id, region: 'tcg', name: 'Elfnote', date: '2026-10-03', tournament: null, placement: null, players: null, player: null, cover: null, url: null, main: [[999, 3]], side: [] })
    const data: MetaDecksData = { fetchedAt: '2026-10-08', windowDays: 56, source: 'test', cards: {}, decks: [deck(1), deck(2)] }

    expect(buildMetaReport(data, 'tcg', 'both', 4).handtraps.map((entry) => entry.name)).toEqual(['Card 999'])
  })
})

describe('Replays en inglés', () => {
  it('las instancias del torneo se nombran en inglés', () => {
    applyLocale('en')

    expect(readStage('FINAL')?.label).toBe('Final')
    expect(readStage('Semi Final 2')?.label).toBe('Semifinal 2')
    expect(readStage('Quarterfinals')?.label).toBe('Quarterfinal')
    expect(readStage('Top 8')?.label).toBe('Top 8')
    expect(readStage('Swiss Round 3')?.label).toBe('Round 3')
  })

  it('la búsqueda entiende la instancia en los dos idiomas, sin importar cuál se ve', () => {
    const video = { id: 'aaaaaaaaaa1', channel: 'eu' as const, title: 'YCS Paris 2026 - Day 2 - Round 13 - Usama B. vs. Pascal K.', duration: '40:31', date: '2026-09-21' }

    applyLocale('en')
    const [english] = matchReplays([video], [])

    applyLocale('es')
    const [spanish] = matchReplays([video], [])

    expect(english?.stage?.label).toBe('Round 13')
    expect(spanish?.stage?.label).toBe('Ronda 13')
    for (const entry of [english, spanish]) {
      expect(entry?.search).toContain('round 13')
    }
    expect(spanish?.search).toContain('ronda 13')
  })

  it('la pestaña se dibuja en inglés: descripción con plural, filtros, jugadores sin deck y los dos canales con su link', () => {
    applyLocale('en')
    const view = render(<ReplaysScreen />)

    expect(screen.getByRole('heading', { name: 'Replays' })).toBeInTheDocument()
    expect(screen.getByText('2 replays with at least one deck from the Meta tab, from newest to oldest. Tap one to watch it.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'With Meta deck' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('searchbox', { name: 'Search replays' })).toHaveAttribute('placeholder', 'Event, player or deck')
    expect(screen.getByText('YCS Paris 2026 · Final')).toBeInTheDocument()
    expect(screen.getByText('YCS Paris 2026 · Round 13')).toBeInTheDocument()
    expect(screen.getByText('unidentified deck')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watch the replay Timoti B. vs. Vladis B., YCS Paris 2026 · Final' })).toBeInTheDocument()

    const footer = view.container.querySelector('p.mt-4')!
    expect(footer).toHaveTextContent('The videos are from the official Yu-Gi-Oh! TCG Europe and Yu-Gi-Oh! TCG YouTube channels.')
    expect(within(footer as HTMLElement).getByRole('link', { name: 'Yu-Gi-Oh! TCG Europe' })).toHaveAttribute('href', 'https://www.youtube.com/@YuGiOhCardEU')
    expect(within(footer as HTMLElement).getByRole('link', { name: 'Yu-Gi-Oh! TCG' })).toHaveAttribute('href', 'https://www.youtube.com/@OfficialYuGiOhTCG')

    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(screen.getByText('3 replays from the channels, from newest to oldest. Tap one to watch it.')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search replays' }), { target: { value: 'no existe' } })
    expect(screen.getByText('No replays match that')).toBeInTheDocument()
  })

  it('con un deck elegido la descripción nombra el deck y el torneo, y el plural elige la forma', () => {
    applyLocale('en')
    window.history.replaceState(null, '', '#replays?deck=101')
    render(<ReplaysScreen />)

    expect(screen.getByText('1 Elfnote replay at YCS Paris, from newest to oldest.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'All' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove the Elfnote filter' })).toBeInTheDocument()
  })
})
