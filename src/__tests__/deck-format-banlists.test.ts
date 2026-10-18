import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeBanlist, currentStatus, nextBanlist, upcomingChange } from '../app/banlists'
import { buildDeckFormatIssues, buildUpcomingLimitNotes, getCardCopyLimit } from '../app/deck-format'
import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import type { ApiCardSearchResult } from '../ygoprodeck'

// Cupsy★Yummy Way y Called by the Grave: limitadas en la lista del 21/9/2026 del TCG y prohibidas en la del 19/10/2026 (la que se anunció en partes).
const CUPSY = 31603289
const CALLED = 24224830
const UNLISTED = 1

const card = (ygoprodeckId: number, name: string, tcg: ApiCardSearchResult['banlist']['tcg'] = null): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4, linkValue: null, atk: '0', def: '0', archetype: null,
  ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg, ocg: null, goat: null }, genesys: { points: null },
})

const inDeck = (apiCard: ApiCardSearchResult, copies: number): DeckCardInstance[] =>
  Array.from({ length: copies }, (_, index) => ({ instanceId: `${apiCard.ygoprodeckId}-${index}`, name: apiCard.name, apiCard, origin: null, roles: [], needsReview: false }))

const deck = (main: DeckCardInstance[]): DeckBuilderState => ({ deckName: 'Yummy', main, extra: [], side: [], isEditingDeck: false })

describe('las banlists con su fecha de entrada en vigencia', () => {
  it('rige la más nueva que ya empezó; la que viene, la más cercana que todavía no', () => {
    expect(activeBanlist('tcg', '2026-10-18')!.date).toBe('2026-09-21')
    expect(nextBanlist('tcg', '2026-10-18')!.date).toBe('2026-10-19')
    expect(activeBanlist('tcg', '2026-10-19')!.date).toBe('2026-10-19')
    expect(nextBanlist('tcg', '2099-01-01')).toBeNull()
  })

  it('el estado de hoy sale de la lista que rige, y lo que nunca figuró en una lista no lo decide', () => {
    expect(currentStatus('tcg', CUPSY, '2026-10-18')).toBe('limited')
    expect(currentStatus('tcg', CUPSY, '2026-10-19')).toBe('forbidden')
    expect(currentStatus('tcg', UNLISTED, '2026-10-19')).toBeNull()
  })

  it('lo que cambia en la próxima lista dice el día y de qué a qué', () => {
    expect(upcomingChange('tcg', CUPSY, '2026-10-18')).toEqual({ date: '2026-10-19', from: 'limited', to: 'forbidden' })
    expect(upcomingChange('tcg', CUPSY, '2026-10-19')).toBeNull()
    expect(upcomingChange('tcg', UNLISTED, '2026-10-18')).toBeNull()
  })
})

describe('armar el deck con las banlists del sitio', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('la carta guardada con el estado viejo de la API se arma con la lista que rige, y al entrar la nueva pasa a prohibida sola', () => {
    // La API (y un deck guardado) todavía dice «limitada».
    const cupsy = card(CUPSY, 'Cupsy★Yummy Way', 'limited')

    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    expect(getCardCopyLimit(cupsy, 'tcg')).toBe(1)

    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    expect(getCardCopyLimit(cupsy, 'tcg')).toBe(0)
    expect(buildDeckFormatIssues(deck(inDeck(cupsy, 1)), 'tcg')).toEqual(['Cupsy★Yummy Way está prohibida en TCG.'])
  })

  it('una carta que nunca figuró en las listas sigue con lo que dice la carta, y los otros formatos no cambian', () => {
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    expect(getCardCopyLimit(card(UNLISTED, 'Una carta', 'limited'), 'tcg')).toBe(1)
    expect(getCardCopyLimit(card(CUPSY, 'Cupsy★Yummy Way', 'limited'), 'unlimited')).toBe(3)
  })

  it('el aviso de la próxima lista nombra las cartas del deck que se vuelven más estrictas y el día en que entra', () => {
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))

    const notes = buildUpcomingLimitNotes(deck([...inDeck(card(CUPSY, 'Cupsy★Yummy Way'), 1), ...inDeck(card(CALLED, 'Called by the Grave'), 1), ...inDeck(card(UNLISTED, 'Otra'), 3)]), 'tcg')

    expect(notes).toEqual({
      date: '2026-10-19',
      notes: [
        { name: 'Cupsy★Yummy Way', from: 'limited', to: 'forbidden' },
        { name: 'Called by the Grave', from: 'limited', to: 'forbidden' },
      ],
    })
    // Hoy el deck es legal: el aviso no es un error.
    expect(buildDeckFormatIssues(deck(inDeck(card(CUPSY, 'Cupsy★Yummy Way'), 1)), 'tcg')).toEqual([])
    // Sin próxima lista que cambie algo, o en un formato sin fechas, no hay aviso.
    expect(buildUpcomingLimitNotes(deck(inDeck(card(UNLISTED, 'Otra'), 3)), 'tcg')).toBeNull()
    expect(buildUpcomingLimitNotes(deck(inDeck(card(CUPSY, 'Cupsy★Yummy Way'), 1)), 'edison')).toBeNull()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    expect(buildUpcomingLimitNotes(deck(inDeck(card(CUPSY, 'Cupsy★Yummy Way'), 1)), 'tcg')).toBeNull()
  })
})
