/**
 * Validation script for compareBuild and interpretComparison.
 * Constructs 2 realistic PortableConfig fixtures and runs both functions.
 * Run with: npx tsx src/__tests__/compare-build-validation.ts
 */
import { compareBuild, interpretComparison } from '../app/build-comparison'
import type { PortableConfig, PortableDeckCard } from '../app/model'
import type { ApiCardReference, CardOrigin, CardRole } from '../types'

function makeApiCard(id: number, opts: Partial<ApiCardReference> = {}): ApiCardReference {
  return {
    ygoprodeckId: id,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: null,
    race: 'Spellcaster',
    attribute: 'DARK',
    level: 4,
    linkValue: null,
    atk: '1800',
    def: '1200',
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
    ...opts,
  }
}

function card(name: string, id: number, copies: number, roles: CardRole[], origin: CardOrigin): PortableDeckCard[] {
  return Array.from({ length: copies }, () => ({
    name,
    apiCard: makeApiCard(id),
    origin,
    roles,
    needsReview: false,
  }))
}

// ── Build A: Combo-heavy Branded Despia (40 cards) ──
const buildA: PortableConfig = {
  version: 15,
  handSize: 5,
  deckFormat: 'unlimited',
  patternsSeeded: true,
  patternsSeedVersion: 1,
  deckBuilder: {
    deckName: 'Branded Despia v1',
    main: [
      ...card('Aluber the Jester of Despia', 101, 3, ['starter', 'searcher'], 'engine'),
      ...card('Branded Fusion', 102, 3, ['starter'], 'engine'),
      ...card('Fallen of Albaz', 103, 2, ['combo_piece'], 'engine'),
      ...card('Despian Tragedy', 104, 3, ['extender'], 'engine'),
      ...card('Ad Libitum of Despia', 105, 1, ['extender'], 'engine'),
      ...card('Branded Opening', 106, 2, ['searcher'], 'engine'),
      ...card('Branded in Red', 107, 2, ['extender', 'recovery'], 'engine'),
      ...card('Ash Blossom & Joyous Spring', 108, 3, ['handtrap'], 'non_engine'),
      ...card('Maxx "C"', 109, 3, ['handtrap', 'draw'], 'non_engine'),
      ...card('Effect Veiler', 110, 2, ['handtrap'], 'non_engine'),
      ...card('Called by the Grave', 111, 2, ['tech'], 'non_engine'),
      ...card('Super Polymerization', 112, 2, ['boardbreaker', 'removal'], 'non_engine'),
      ...card('Pot of Prosperity', 113, 2, ['draw'], 'non_engine'),
      ...card('Frightfur Patchwork', 114, 1, ['searcher'], 'engine'),
      ...card('Edge Imp Chain', 115, 1, ['brick', 'garnet'], 'engine'),
      ...card('Polymerization', 116, 1, ['combo_piece'], 'engine'),
      ...card('Branded Lost', 117, 2, ['enabler'], 'engine'),
      ...card('Foolish Burial', 118, 1, ['searcher'], 'engine'),
      ...card('Monster Reborn', 119, 1, ['recovery'], 'non_engine'),
      ...card('Nibiru the Primal Being', 120, 2, ['handtrap', 'boardbreaker'], 'non_engine'),
      ...card('Triple Tactics Talent', 121, 1, ['draw'], 'non_engine'),
    ],
    extra: [],
    side: [],
  },
  patterns: [
    {
      name: 'Branded Fusion Access',
      kind: 'opening',
      logic: 'any',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include', distinct: false },
      ],
    },
    {
      name: 'Brick Hand',
      kind: 'problem',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [
        { matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'include', distinct: false },
      ],
    },
  ],
}

// ── Build B: Modified version — fewer handtraps, more engine (40 cards) ──
const buildB: PortableConfig = {
  version: 15,
  handSize: 5,
  deckFormat: 'unlimited',
  patternsSeeded: true,
  patternsSeedVersion: 1,
  deckBuilder: {
    deckName: 'Branded Despia v2',
    main: [
      ...card('Aluber the Jester of Despia', 101, 3, ['starter', 'searcher'], 'engine'),
      ...card('Branded Fusion', 102, 3, ['starter'], 'engine'),
      ...card('Fallen of Albaz', 103, 3, ['combo_piece'], 'engine'), // +1
      ...card('Despian Tragedy', 104, 3, ['extender'], 'engine'),
      ...card('Ad Libitum of Despia', 105, 2, ['extender'], 'engine'), // +1
      ...card('Branded Opening', 106, 3, ['searcher'], 'engine'), // +1
      ...card('Branded in Red', 107, 2, ['extender', 'recovery'], 'engine'),
      ...card('Ash Blossom & Joyous Spring', 108, 2, ['handtrap'], 'non_engine'), // -1
      ...card('Maxx "C"', 109, 2, ['handtrap', 'draw'], 'non_engine'), // -1
      // Effect Veiler removed entirely (-2)
      ...card('Called by the Grave', 111, 2, ['tech'], 'non_engine'),
      ...card('Super Polymerization', 112, 1, ['boardbreaker', 'removal'], 'non_engine'), // -1
      ...card('Pot of Prosperity', 113, 2, ['draw'], 'non_engine'),
      ...card('Frightfur Patchwork', 114, 1, ['searcher'], 'engine'),
      ...card('Edge Imp Chain', 115, 2, ['brick', 'garnet'], 'engine'), // +1 brick!
      ...card('Polymerization', 116, 1, ['combo_piece'], 'engine'),
      ...card('Branded Lost', 117, 3, ['enabler'], 'engine'), // +1
      ...card('Foolish Burial', 118, 1, ['searcher'], 'engine'),
      ...card('Monster Reborn', 119, 1, ['recovery'], 'non_engine'),
      ...card('Branded Banishment', 122, 1, ['removal'], 'engine'), // new card
      ...card('Nibiru the Primal Being', 120, 1, ['handtrap', 'boardbreaker'], 'non_engine'), // -1
      ...card('Triple Tactics Talent', 121, 1, ['draw'], 'non_engine'), // kept same
    ],
    extra: [],
    side: [],
  },
  patterns: [
    {
      name: 'Branded Fusion Access',
      kind: 'opening',
      logic: 'any',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include', distinct: false },
      ],
    },
    {
      name: 'Brick Hand',
      kind: 'problem',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [
        { matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'include', distinct: false },
      ],
    },
  ],
}

// ── Run comparisons ──

console.log('═══════════════════════════════════════════════════════════')
console.log('  VALIDATION: compareBuild(buildA, buildB)')
console.log('═══════════════════════════════════════════════════════════\n')

const result = compareBuild(buildA, buildB)
console.log(JSON.stringify(result, null, 2))

console.log('\n═══════════════════════════════════════════════════════════')
console.log('  IDENTITY CHECK: compareBuild(buildA, buildA)')
console.log('═══════════════════════════════════════════════════════════\n')

const identityResult = compareBuild(buildA, buildA)
console.log('buildsAreIdentical:', identityResult.buildsAreIdentical)
console.log('cardDiffs count:', identityResult.cardDiffs.length)
console.log('openingDelta:', identityResult.openingDelta)
console.log('problemDelta:', identityResult.problemDelta)


console.log('\n═══════════════════════════════════════════════════════════')
console.log('  INTERPRETATION: interpretComparison(result)')
console.log('═══════════════════════════════════════════════════════════\n')

const interpretation = interpretComparison(result)
console.log(JSON.stringify(interpretation, null, 2))

console.log('\n── Verdict ──')
console.log('Type:', interpretation.verdict.type)
console.log('Summary:', interpretation.verdict.summary)
console.log('Opening Delta Formatted:', interpretation.verdict.openingDeltaFormatted)
console.log('Bricks Delta:', interpretation.verdict.bricksDelta)
console.log('Tradeoff Detail:', interpretation.verdict.tradeoffDetail)
console.log('Recommendation:', interpretation.verdict.recommendation)

console.log('\n── Insights ──')
for (const insight of interpretation.insights) {
  console.log(`  [${insight.priority}] ${insight.text} (delta: ${insight.delta}, category: ${insight.category})`)
}
