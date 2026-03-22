import type { HandPattern } from '../types'
import { createGroupPattern } from './pattern-factory'

export function buildDefaultPatterns(): HandPattern[] {
  return [
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
    createGroupPattern('Mínimo 1 Starter', 'good', [
      { groupKey: 'starter', count: 1, kind: 'include' },
    ]),
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
    createGroupPattern('Sin starter', 'bad', [
      { groupKey: 'starter', count: 1, kind: 'exclude' },
    ]),
    createGroupPattern('2 o más Bricks', 'bad', [
      { groupKey: 'brick', count: 2, kind: 'include' },
    ]),
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
    createGroupPattern('3 o más HT en mano', 'bad', [
      { groupKey: 'handtrap', count: 3, kind: 'include' },
    ]),
    createGroupPattern('3 o más BBs en mano', 'bad', [
      { groupKey: 'boardbreaker', count: 3, kind: 'include' },
    ]),
    createGroupPattern('4 o más Non-engine', 'bad', [
      { groupKey: 'non-engine', count: 4, kind: 'include' },
    ]),
  ]
}
