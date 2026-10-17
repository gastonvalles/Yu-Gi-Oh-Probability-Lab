import { describe, expect, it } from 'vitest'

import { deckFormatIssues } from '../app/duel-format'
import type { ApiCardReference, BanlistStatus } from '../types'

const apiCard = (ygoprodeckId: number, tcg: BanlistStatus | null, goat: BanlistStatus | null = null) =>
  ({ ygoprodeckId, banlist: { tcg, ocg: null, goat }, genesys: { points: null } }) as unknown as ApiCardReference

const cards = new Map([
  ['card-1-1', { name: 'Prohibida', apiCard: apiCard(1, 'forbidden') }],
  ['card-2-1', { name: 'Limitada', apiCard: apiCard(2, 'limited') }],
  ['card-2-2', { name: 'Limitada', apiCard: apiCard(2, 'limited') }],
  ['card-3-1', { name: 'Libre', apiCard: apiCard(3, null) }],
  ['card-4-1', { name: 'Sin datos', apiCard: null }],
  ['card-5-1', { name: 'Goat sí, TCG no', apiCard: apiCard(5, null, 'forbidden') }],
])

describe('el formato de una sala', () => {
  it('sin límite, cualquier deck vale', () => {
    expect(deckFormatIssues(['card-1-1', 'card-2-1', 'card-2-2'], cards, 'unlimited')).toEqual([])
  })

  it('una prohibida no puede estar y una limitada va de a una', () => {
    const issues = deckFormatIssues(['card-1-1', 'card-2-1', 'card-2-2', 'card-3-1'], cards, 'tcg')

    expect(issues).toHaveLength(2)
    expect(issues.join(' ')).toContain('Prohibida')
    expect(issues.join(' ')).toContain('Limitada')
  })

  it('un deck que cumple no tiene nada que corregir, y una copia sin datos no cuenta', () => {
    expect(deckFormatIssues(['card-2-1', 'card-3-1', 'card-4-1'], cards, 'tcg')).toEqual([])
  })

  it('en Genesys el deck no puede sumar más puntos que el tope de la sala (el oficial es 100 si no se pide otro)', () => {
    const points = (ygoprodeckId: number, genesys: number) => ({ ygoprodeckId, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: genesys } }) as unknown as ApiCardReference
    const deck = new Map([
      ['card-10-1', { name: 'Una', apiCard: points(10, 30) }],
      ['card-11-1', { name: 'Otra', apiCard: points(11, 30) }],
      ['card-12-1', { name: 'Más', apiCard: points(12, 30) }],
      ['card-13-1', { name: 'Y más', apiCard: points(13, 30) }],
    ])
    const ids = [...deck.keys()]

    expect(deckFormatIssues(ids, deck, 'genesys').join(' ')).toMatch(/120/)
    expect(deckFormatIssues(ids, deck, 'genesys', 100).join(' ')).toMatch(/120/)
    expect(deckFormatIssues(ids, deck, 'genesys', 120)).toEqual([])
    expect(deckFormatIssues(ids.slice(0, 3), deck, 'genesys')).toEqual([])
    expect(deckFormatIssues(ids.slice(0, 3), deck, 'genesys', 60).join(' ')).toMatch(/90/)
  })

  it('cada formato mira su propia lista', () => {
    expect(deckFormatIssues(['card-5-1'], cards, 'tcg')).toEqual([])
    expect(deckFormatIssues(['card-5-1'], cards, 'goat')).toHaveLength(1)
  })
})
