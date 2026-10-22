import { useMemo } from 'react'

import { renderRich } from '../../../i18n/rich'
import type { CardEntry, HandPattern } from '../../../types'
import { cx } from '../../ui/cx'
import { KindBadge } from '../KindBadge'
import { buildRuleSentence } from '../pattern-helpers'

/**
 * La regla leída en una frase, arriba del editor y tal como la va a medir el Lab: «[Salida] La mano tiene **al menos 2 cartas con rol Handtrap**. Sólo yendo 2º,
 * contando la carta robada.». Lo que decide va en negrita; si falta elegir qué cuenta, en rojo.
 */
export function RuleReadback({ pattern, cardById }: { pattern: HandPattern; cardById: Map<string, CardEntry> }) {
  const sentence = useMemo(() => buildRuleSentence(pattern, cardById), [pattern, cardById])

  if (!sentence) {
    return null
  }

  return (
    <p className="m-0 flex items-start gap-2 text-body text-foreground">
      <span className="mt-0.5 flex shrink-0">
        <KindBadge kind={pattern.kind} />
      </span>
      <span className="min-w-0">
        {renderRich(sentence.text, { b: (text) => <b className={cx('font-semibold', sentence.missing ? 'text-danger-soft' : 'text-foreground')}>{text}</b> })}
        {sentence.turn ? ` ${sentence.turn}` : null}
      </span>
    </p>
  )
}
