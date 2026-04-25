import { useMemo } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { buildPatternCompactSummary } from '../pattern-helpers'
import { LiveResultBadge } from './LiveResultBadge'

interface RuleSentenceProps {
  pattern: HandPattern
  derivedMainCards: CardEntry[]
  probability: number | null
}

export function RuleSentence({ pattern, derivedMainCards, probability }: RuleSentenceProps) {
  const cardById = useMemo(
    () => new Map(derivedMainCards.map((card) => [card.id, card])),
    [derivedMainCards],
  )

  const sentence = useMemo(
    () => buildPatternCompactSummary(pattern, cardById),
    [pattern, cardById],
  )

  const hasDefinedConditions = pattern.conditions.some((c) => c.matcher !== null)

  if (!hasDefinedConditions) {
    return null
  }

  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-[1.05rem] leading-[1.2] text-(--text-main)">
        {sentence}
      </p>
      <LiveResultBadge probability={probability} patternKind={pattern.kind} />
    </div>
  )
}
