import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { landingStats } from '../../scripts/write-build-id.mjs'
import banlistsJson from '../data/banlists.json'
import { activeBanlist } from '../app/banlists'
import { fetchExpansions } from '../app/card-prices'
import { LANDING_ENTERED_KEY, SAVED_DECK_KEY, openingOdds, shouldShowLanding, type LandingInput } from '../app/landing'
import { META_DECKS, filterMetaDecks } from '../app/meta'
import { STORAGE_KEY } from '../app/model'
import { atLeastProbability } from '../app/quick-odds'

const base: LandingInput = { hash: '', search: '', savedDeck: null, standalone: false, entered: false }
const deck = (main: unknown[]) => JSON.stringify({ version: 16, deckBuilder: { deckName: 'x', main, extra: [], side: [] } })

describe('shouldShowLanding', () => {
  it.each<[string, Partial<LandingInput>, boolean]>([
    ['sin hash ni deck: la ve', {}, true],
    ['con «#» solo: la ve', { hash: '#' }, true],
    ['con un deck guardado sin cartas en el Main: la ve', { savedDeck: deck([]) }, true],
    ['con un deck con cartas: no', { savedDeck: deck([{ name: 'Ash Blossom' }]) }, false],
    ['con algo guardado que no se entiende: no (vuelve, no llega)', { savedDeck: '{roto' }, false],
    ['si el almacenamiento falla: no', { savedDeck: undefined }, false],
    ['un enlace a una pantalla: no', { hash: '#deck-builder' }, false],
    ['un duelo compartido: no', { hash: '#duel?room=ABC' }, false],
    ['un combo compartido: no', { hash: '#combo=xyz' }, false],
    ['un replay compartido: no', { hash: '#replay=xyz' }, false],
    ['la app instalada: no', { standalone: true }, false],
    ['ya entró en esta sesión: no', { entered: true }, false],
    ['?landing=1 la fuerza aunque haya deck y hash', { search: '?landing=1', hash: '#duel', savedDeck: deck([{}]), entered: true, standalone: true }, true],
  ])('%s', (_, input, expected) => {
    expect(shouldShowLanding({ ...base, ...input })).toBe(expected)
  })

  it('lee la misma clave del deck que la app y una marca propia', () => {
    expect(SAVED_DECK_KEY).toBe(STORAGE_KEY)
    expect(LANDING_ENTERED_KEY).toMatch(/^ygo-lab:/)
  })
})

describe('la cuenta de la calculadora', () => {
  it('es la de la Calculadora rápida: 3 copias en 40 dan 34 de cada 100 yendo 1º y 39 yendo 2º', () => {
    expect(Math.round(openingOdds(3, 'first') * 100)).toBe(34)
    expect(Math.round(openingOdds(3, 'second') * 100)).toBe(39)

    for (const copies of [1, 2, 3]) {
      expect(openingOdds(copies, 'first')).toBe(atLeastProbability(40, copies, 5, 1))
      expect(openingOdds(copies, 'second')).toBe(atLeastProbability(40, copies, 6, 1))
    }
  })

  it('coincide con la hipergeométrica escrita a mano (1 − C(40−k, n) / C(40, n))', () => {
    const choose = (n: number, k: number): number => (k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k)

    for (const copies of [1, 2, 3]) {
      expect(openingOdds(copies, 'first')).toBeCloseTo(1 - choose(40 - copies, 5) / choose(40, 5), 12)
      expect(openingOdds(copies, 'second')).toBeCloseTo(1 - choose(40 - copies, 6) / choose(40, 6), 12)
    }
  })
})

describe('las cifras de la landing (scripts/write-build-id.mjs)', () => {
  it('son las mismas que muestran Decks de torneo, Banlists y Expansiones', async () => {
    const prices = JSON.parse(readFileSync(new URL('../../public/prices/index.json', import.meta.url), 'utf8')) as { updated: string }
    const today = new Date().toISOString().slice(0, 10)
    const stats = landingStats({ metaDecks: META_DECKS, banlists: banlistsJson, prices, today })

    expect(stats.tcgDecks).toBe(filterMetaDecks(META_DECKS.decks, { region: 'tcg', text: '' }).length)
    expect(stats.weeks).toBe(Math.ceil(META_DECKS.windowDays / 7))
    expect(stats.banlist).toBe(activeBanlist('tcg', today)?.date)
    expect(stats.prices).toBe((await fetchExpansions(() => Promise.resolve(prices))).updated)
  })

  it('una banlist anunciada que todavía no rige no es la vigente', () => {
    const banlists = { lists: [{ region: 'tcg', date: '2026-01-01' }, { region: 'tcg', date: '2026-12-01' }, { region: 'ocg', date: '2026-11-01' }] }

    expect(landingStats({ metaDecks: { decks: [], windowDays: 56 }, banlists, prices: { updated: '2026-11-08' }, today: '2026-11-09' })).toEqual({ tcgDecks: 0, weeks: 8, banlist: '2026-01-01', prices: '2026-11-08' })
  })
})
