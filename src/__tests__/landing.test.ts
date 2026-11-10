import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { landingStats } from '../../scripts/write-build-id.mjs'
import banlistsJson from '../data/banlists.json'
import { activeBanlist } from '../app/banlists'
import { fetchExpansions } from '../app/card-prices'
import { LANDING_ENTERED_KEY, openingOdds, shouldShowLanding, type LandingInput } from '../app/landing'
import { META_DECKS, filterMetaDecks } from '../app/meta'
import { atLeastProbability } from '../app/quick-odds'
import { getRecommendedStep } from '../components/deck-mode/deck-workflow-navigation'

const base: LandingInput = { hash: '', search: '', entered: false }

describe('shouldShowLanding', () => {
  // Ni el deck guardado ni la app instalada cambian nada: la primera carga de la sesión en `/` va a «Inicio» para todos.
  it.each<[string, Partial<LandingInput>, boolean]>([
    ['la primera carga de la sesión sin hash: la ve', {}, true],
    ['con «#» solo: la ve', { hash: '#' }, true],
    ['un enlace a una pantalla: no', { hash: '#deck-builder' }, false],
    ['un duelo compartido: no', { hash: '#duel?room=ABC' }, false],
    ['un combo compartido: no', { hash: '#combo=xyz' }, false],
    ['un replay compartido: no', { hash: '#replay=xyz' }, false],
    ['ya entró en esta sesión (recargar, volver a /): no', { entered: true }, false],
    ['?landing=1 la fuerza aunque haya hash y ya haya entrado', { search: '?landing=1', hash: '#duel', entered: true }, true],
  ])('%s', (_, input, expected) => {
    expect(shouldShowLanding({ ...base, ...input })).toBe(expected)
  })

  it('la marca de sesión es propia', () => {
    expect(LANDING_ENTERED_KEY).toMatch(/^ygo-lab:/)
  })
})

describe('el paso recomendado (el de «Seguir con tu deck» y el de `/` sin hash)', () => {
  it('arma hasta 40, clasifica y, con todo hecho, el Lab: nunca Exportar', () => {
    expect(getRecommendedStep(0, false)).toBe('deck-builder')
    expect(getRecommendedStep(39, true)).toBe('deck-builder')
    expect(getRecommendedStep(40, false)).toBe('categorization')
    expect(getRecommendedStep(40, true)).toBe('probability-lab')
    expect(getRecommendedStep(60, true)).toBe('probability-lab')
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

    expect(landingStats({ metaDecks: { decks: [], windowDays: 56 }, banlists, prices: { updated: '2026-11-08' }, today: '2026-11-09' })).toEqual({ tcgDecks: 0, weeks: 8, banlist: '2026-01-01', prices: '2026-11-08', topCards: [] })
  })

  it('lo más jugado: en cuántos decks TCG está cada carta del Main (una vez por deck), las seis primeras', () => {
    const decks = [
      { region: 'tcg', main: [[1, 3], [2, 1]] },
      { region: 'tcg', main: [[1, 2], [3, 3]] },
      { region: 'ocg', main: [[3, 3], [4, 3]] },
    ]
    const stats = landingStats({ metaDecks: { decks, windowDays: 56, cards: { 1: { name: 'Uno' }, 2: { name: 'Dos' } } }, banlists: { lists: [] }, prices: { updated: '' } })

    expect(stats.topCards).toEqual([{ id: 1, name: 'Uno', decks: 2 }, { id: 2, name: 'Dos', decks: 1 }, { id: 3, name: '3', decks: 1 }])

    const real = landingStats({ metaDecks: META_DECKS, banlists: banlistsJson, prices: { updated: '' } }).topCards
    const first = real[0]!

    expect(real).toHaveLength(6)
    expect(first.decks).toBe(META_DECKS.decks.filter((deck) => deck.region === 'tcg' && deck.main.some(([id]) => id === first.id)).length)
  })
})
