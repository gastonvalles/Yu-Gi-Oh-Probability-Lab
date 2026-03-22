import type { HandPattern } from '../types'
import type { DerivedDeckGroup } from './deck-groups'
import { createGroupPattern } from './pattern-factory'

export function buildDefaultPatternsFromGroups(groups: DerivedDeckGroup[]): HandPattern[] {
  const groupByKey = new Map(groups.map((group) => [group.key, group]))
  const starterCopies = groupByKey.get('starter')?.copies ?? 0
  const extenderCopies = groupByKey.get('extender')?.copies ?? 0
  const brickCopies = groupByKey.get('brick')?.copies ?? 0
  const handtrapCopies = groupByKey.get('handtrap')?.copies ?? 0
  const boardbreakerCopies = groupByKey.get('boardbreaker')?.copies ?? 0
  const nonEngineCopies = groupByKey.get('non-engine')?.copies ?? 0
  const starterCardIds = new Set(groupByKey.get('starter')?.cardIds ?? [])
  const extenderOnlyCardIds = (groupByKey.get('extender')?.cardIds ?? []).filter((cardId) => !starterCardIds.has(cardId))

  const patterns: HandPattern[] = []

  if (starterCopies > 0) {
    patterns.push(
      createGroupPattern('Mínimo 1 Starter', 'good', [
        { groupKey: 'starter', count: 1, kind: 'include' },
      ]),
    )
  }

  if (starterCopies > 0 && extenderCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Starter + Extender',
        'good',
        [
          { groupKey: 'starter', count: 1, kind: 'include' },
          { groupKey: 'extender', count: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  if (starterCopies > 0 && nonEngineCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Starter + Non-engine',
        'good',
        [
          { groupKey: 'starter', count: 1, kind: 'include' },
          { groupKey: 'non-engine', count: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  patterns.push(
    createGroupPattern('Sin starter', 'bad', [
      { groupKey: 'starter', count: 1, kind: 'exclude' },
    ]),
  )

  if (extenderOnlyCardIds.length > 0 && starterCopies > 0) {
    patterns.push(
      createGroupPattern(
        'Extender sin starter',
        'bad',
        [
          { groupKey: 'extender', count: 1, kind: 'include' },
          { groupKey: 'starter', count: 1, kind: 'exclude' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    )
  }

  if (brickCopies >= 2) {
    patterns.push(
      createGroupPattern('2 o más Bricks', 'bad', [
        { groupKey: 'brick', count: 2, kind: 'include' },
      ]),
    )
  }

  if (handtrapCopies >= 3) {
    patterns.push(
      createGroupPattern('3 o más HT en mano', 'bad', [
        { groupKey: 'handtrap', count: 3, kind: 'include' },
      ]),
    )
  }

  if (boardbreakerCopies >= 3) {
    patterns.push(
      createGroupPattern('3 o más BBs en mano', 'bad', [
        { groupKey: 'boardbreaker', count: 3, kind: 'include' },
      ]),
    )
  }

  if (nonEngineCopies >= 4) {
    patterns.push(
      createGroupPattern('4 o más Non-engine', 'bad', [
        { groupKey: 'non-engine', count: 4, kind: 'include' },
      ]),
    )
  }

  return patterns
}
