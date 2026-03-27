import type { HandPattern } from '../types'
import { createMatcherPattern } from './pattern-factory'

export function buildDefaultPatterns(): HandPattern[] {
  return [
    createMatcherPattern(
      'Starter + Extender',
      'opening',
      [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
        { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
      ],
      {
        allowSharedCards: false,
        matchMode: 'all',
        minimumMatches: 2,
      },
    ),
    createMatcherPattern('Mínimo 1 Starter', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    ]),
    createMatcherPattern(
      'Starter + Non-engine',
      'opening',
      [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
        { matcher: { type: 'origin', value: 'non_engine' }, quantity: 1, kind: 'include' },
      ],
      {
        allowSharedCards: false,
        matchMode: 'all',
        minimumMatches: 2,
      },
    ),
    createMatcherPattern('Sin starter', 'problem', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
    ]),
    createMatcherPattern('2 o más Bricks', 'problem', [
      { matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' },
    ]),
    createMatcherPattern(
      'Extender sin starter',
      'problem',
      [
        { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
      ],
      {
        allowSharedCards: false,
        matchMode: 'all',
        minimumMatches: 2,
      },
    ),
    createMatcherPattern('3 o más HT en mano', 'problem', [
      { matcher: { type: 'role', value: 'handtrap' }, quantity: 3, kind: 'include' },
    ]),
    createMatcherPattern('3 o más BBs en mano', 'problem', [
      { matcher: { type: 'role', value: 'boardbreaker' }, quantity: 3, kind: 'include' },
    ]),
    createMatcherPattern('4 o más Non-engine', 'problem', [
      { matcher: { type: 'origin', value: 'non_engine' }, quantity: 4, kind: 'include' },
    ]),
  ]
}
