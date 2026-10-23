import { useMemo } from 'react'

import { renderRich } from '../../../i18n/rich'
import type { CardEntry, HandPattern } from '../../../types'
import { KindBadge } from '../KindBadge'
import { buildRuleSentence } from '../pattern-helpers'

/**
 * La regla leída en una frase, arriba del editor y tal como la va a medir el Lab: «[Salida] La mano tiene **al menos 2 cartas con rol Handtrap**. Sólo yendo 2º,
 * contando la carta robada.». Lo que decide va en negrita. Si falta elegir qué cuenta, esa parte es un marcador de lugar (apagada, sin negrita): es el paso que sigue,
 * no un error; con `flagMissing` (después de intentar guardar la regla incompleta) va en rojo.
 */
export function RuleReadback({ pattern, cardById, flagMissing = false }: { pattern: HandPattern; cardById: Map<string, CardEntry>; flagMissing?: boolean }) {
  const sentence = useMemo(() => buildRuleSentence(pattern, cardById), [pattern, cardById])

  if (!sentence) {
    return null
  }

  const look = !sentence.missing ? 'font-semibold text-foreground' : flagMissing ? 'font-semibold text-danger-soft' : 'font-normal text-muted'

  return (
    <p className="m-0 flex items-start gap-2 text-body text-foreground">
      <span className="mt-0.5 flex shrink-0">
        <KindBadge kind={pattern.kind} />
      </span>
      <span className="min-w-0">
        {renderRich(sentence.text, { b: (text) => <b className={look}>{text}</b> })}
        {sentence.turn ? ` ${sentence.turn}` : null}
      </span>
    </p>
  )
}
