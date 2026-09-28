import type { CardEntry, CardRole } from '../types'

export type RoleDistributionKey = 'starter' | 'extender' | 'interaction' | 'brick'

interface RoleDistributionSpec {
  key: RoleDistributionKey
  label: string
  roles: readonly CardRole[]
}

export const ROLE_DISTRIBUTION_SPECS: readonly RoleDistributionSpec[] = [
  { key: 'starter', label: 'Starters', roles: ['starter'] },
  { key: 'extender', label: 'Extenders', roles: ['extender'] },
  { key: 'interaction', label: 'Interacción', roles: ['handtrap', 'disruption'] },
  { key: 'brick', label: 'Bricks', roles: ['brick', 'garnet'] },
]

/** Cantidad de copias robadas: 0, 1, 2 y 3 o más. */
export const DISTRIBUTION_BUCKETS = ['0', '1', '2', '3+'] as const

export interface RoleDistribution {
  key: RoleDistributionKey
  label: string
  copies: number
  /** Probabilidad de robar exactamente 0, 1, 2 y 3+ copias. */
  buckets: [number, number, number, number]
  atLeastOne: number
}

export function buildRoleDistributions(cards: CardEntry[], handSizes: readonly number[]): RoleDistribution[] {
  const deckSize = cards.reduce((total, card) => total + card.copies, 0)

  return ROLE_DISTRIBUTION_SPECS.map((spec) => {
    const copies = cards
      .filter((card) => card.roles.some((role) => spec.roles.includes(role)))
      .reduce((total, card) => total + card.copies, 0)
    const perHandSize = handSizes.map((handSize) => buildBuckets(deckSize, copies, handSize))
    const buckets = DISTRIBUTION_BUCKETS.map((_, index) =>
      average(perHandSize.map((values) => values[index] ?? 0)),
    ) as RoleDistribution['buckets']

    return {
      key: spec.key,
      label: spec.label,
      copies,
      buckets,
      atLeastOne: 1 - buckets[0],
    }
  })
}

function buildBuckets(deckSize: number, copies: number, handSize: number): [number, number, number, number] {
  const exact = [0, 1, 2].map((drawn) => hypergeometric(deckSize, copies, handSize, drawn))
  const threeOrMore = Math.max(0, 1 - exact.reduce((total, value) => total + value, 0))

  return [exact[0] ?? 0, exact[1] ?? 0, exact[2] ?? 0, threeOrMore]
}

/** P(X = drawn) al robar `handSize` cartas de un deck de `deckSize` con `copies` éxitos. */
export function hypergeometric(deckSize: number, copies: number, handSize: number, drawn: number): number {
  const total = choose(deckSize, handSize)

  if (total === 0) {
    return 0
  }

  return (choose(copies, drawn) * choose(deckSize - copies, handSize - drawn)) / total
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0
  }

  let result = 1

  for (let step = 1; step <= Math.min(k, n - k); step += 1) {
    result = (result * (n - step + 1)) / step
  }

  return result
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length
}
