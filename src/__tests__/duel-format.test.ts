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

  it('cada formato mira su propia lista', () => {
    expect(deckFormatIssues(['card-5-1'], cards, 'tcg')).toEqual([])
    expect(deckFormatIssues(['card-5-1'], cards, 'goat')).toHaveLength(1)
  })
})
