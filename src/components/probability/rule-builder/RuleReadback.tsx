import { useMemo } from 'react'

import { getPatternMatchMode } from '../../../app/patterns'
import type { CardEntry, HandPattern } from '../../../types'
import { Callout } from '../../ui/Callout'
import { buildPatternPreview } from '../pattern-helpers'

/**
 * La regla leída en una frase, tal como la va a evaluar el Lab. Sirve para chequear que la
 * combinación de "al menos / sin", cantidades e Y/O dice lo que uno quería.
 */
export function RuleReadback({ pattern, cardById }: { pattern: HandPattern; cardById: Map<string, CardEntry> }) {
  const preview = useMemo(() => buildPatternPreview(pattern, cardById), [pattern, cardById])
  const defined = pattern.conditions.filter((condition) => condition.matcher !== null)

  if (defined.length === 0) {
    return null
  }

  const mode = getPatternMatchMode(pattern)
  const connector = mode === 'all' ? ' y ' : ' o '
  const sentence = capitalize(preview.items.join(connector))
  const logic = pattern.conditions.length > 1 && mode !== 'all' ? ` ${preview.logic}` : ''
  const turn = pattern.turnContext === 'first' ? ' Solo yendo 1º.' : pattern.turnContext === 'second' ? ' Solo yendo 2º.' : ''

  return (
    <Callout tone="neutral" icon="info" title={preview.heading}>
      {sentence}.{logic}{turn}
    </Callout>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
