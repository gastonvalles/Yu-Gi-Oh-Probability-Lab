import { useId } from 'react'

import type { AskWhyView } from '../../app/auto/ask-why'
import { CardArt } from '../CardArt'
import { AskWhy } from '../duel/AskWhy'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AutoPanel } from './AutoPanel'

/** Un botón de una pregunta del núcleo: lo que dice (verbo y objeto) y qué contesta. */
export interface AskChoice {
  label: string
  onSelect: () => void
}

interface AskPromptProps {
  /** La pregunta, corta y sin el nombre de la carta («¿Activás el efecto?»): la carta la dice su arte. */
  text: string
  /** La carta que pregunta (`select_effectyn`): chica, a la izquierda del texto. Sin ella (`select_yesno`), sólo el texto. */
  card?: { name: string; art: string | null }
  /** La principal, a la derecha: hacerlo («Activar efecto», «Pagar 1000 LP»). */
  yes: AskChoice
  /** Lo que no hace nada, sin caja y a la izquierda («No activar»). */
  no: AskChoice
  /** Arriba de la pregunta, chico: qué pasó, sin nombres («Tras la Invocación Normal», «En la Standby Phase»). */
  kicker?: string
  /** El lugar de la carta, en una pestaña sobre ella («Campo», «Cementerio»). */
  place?: string
  /** El atajo a la mesa manual («Seguir en modo manual»), sin caja y a la izquierda, lejos de la principal. Sólo en escritorio: en el celular está en «Más opciones». */
  manual?: AskChoice
  /** De qué carta es y si es su costo o su efecto (`AskWhy`): un sí o no a secas (`select_yesno`) que llega mientras se activa o se resuelve una carta. */
  why?: AskWhyView | null
}

/**
 * Una pregunta de sí o no del núcleo de reglas (`select_effectyn`, `select_yesno`) en el cartel del automático (`AutoPanel`): qué pasó (`kicker`, sin nombres), la carta por su arte con la pestaña de
 * su lugar y la pregunta; abajo «No activar» sin caja y la principal a la derecha, que nombra la jugada. Hay que contestarla: Escape la minimiza y, al aparecer, el foco va a la principal. Una cadena
 * que se puede pasar no va acá: va en `RespondBand`.
 */
export function AskPrompt({ text, card, yes, no, kicker, place, manual, why }: AskPromptProps) {
  const textId = useId()
  const whyId = useId()

  return (
    <AutoPanel
      kind="ask"
      label={text}
      labelledBy={why ? `${textId} ${whyId}` : textId}
      focus="[data-ask-primary]"
      escape
      head={
        <div className="flex min-w-0 items-center gap-2">
          {card ? (
            <span className="grid shrink-0 justify-items-start gap-1">
              {place ? (
                <Badge size="sm" shape="tag">
                  {place}
                </Badge>
              ) : null}
              <span className="relative block aspect-[421/614] w-11 overflow-hidden bg-input">
                <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
              </span>
            </span>
          ) : null}
          <div className="grid min-w-0 gap-1">
            {kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
            {why ? <AskWhy id={whyId} why={why} /> : null}
            <h2 id={textId} className="m-0 text-body font-semibold">
              {text}
            </h2>
          </div>
        </div>
      }
      actions={
        <>
          {/* El atajo a la mesa manual: sólo en escritorio (en el celular está en «Más opciones»). */}
          {manual ? (
            <Button variant="tertiary" size="sm" className="min-w-0 shrink! text-balance max-[1101px]:hidden" onClick={manual.onSelect}>
              {manual.label}
            </Button>
          ) : null}
          <div className="ml-auto flex shrink-0 justify-end gap-2">
            <Button variant="tertiary" size="sm" onClick={no.onSelect}>
              {no.label}
            </Button>
            <Button variant="primary" size="sm" data-ask-primary="" onClick={yes.onSelect}>
              {yes.label}
            </Button>
          </div>
        </>
      }
    />
  )
}
