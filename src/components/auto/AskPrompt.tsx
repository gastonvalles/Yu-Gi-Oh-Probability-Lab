import { useEffect, useRef } from 'react'

import { useLeaving, usePresence } from '../../app/use-presence'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'

/** Un botón de una pregunta del núcleo: lo que dice (verbo y objeto) y qué contesta. */
export interface AskChoice {
  label: string
  onSelect: () => void
}

interface AskPromptProps {
  /** La pregunta entera («¿Activás el efecto de Ash Blossom & Joyous Spring?»). */
  text: string
  /** La carta que pregunta (`select_effectyn`): chica, a la izquierda del texto. Sin ella (`select_yesno`), sólo el texto. */
  card?: { name: string; art: string | null }
  /** La principal, a la derecha: hacerlo («Activar efecto», «Pagar 1000 LP»). */
  yes: AskChoice
  /** Lo que no hace nada, sin caja y a la izquierda («No activar»). */
  no: AskChoice
}

/**
 * Una pregunta de sí o no del núcleo de reglas (`select_effectyn`, `select_yesno`) en el medio de la mesa: la pone `PracticeMat` en la ranura `duel.prompt`, centrada en su columna, sin fondo y sin
 * mover nada (la capa deja pasar los toques; sólo la pregunta los recibe), como `PassPrompt`. Hay que contestarla: no se cierra con Escape y, al aparecer, el foco va a la principal (sin desplazar
 * la página). Contestada, se achica y se funde (la mesa la pone dentro de un `Presence`). Los dos botones dicen qué hacen: nunca «Sí» ni «No».
 */
export function AskPrompt({ text, card, yes, no }: AskPromptProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const leaving = useLeaving()

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-ask-primary]')?.focus({ preventScroll: true })
  }, [])

  return usePresence(!leaving, (
    <div ref={ref} role="status" data-prompt="ask" className="grid gap-3 rounded-card border border-info bg-card-background p-4 text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter">
      <div className="flex items-center gap-3">
        {card ? (
          <span className="relative block aspect-[421/614] w-11 shrink-0 overflow-hidden bg-input">
            <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
          </span>
        ) : null}
        <p className="m-0 min-w-0 font-semibold">{text}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={no.onSelect}>
          {no.label}
        </Button>
        <Button variant="primary" data-ask-primary="" onClick={yes.onSelect}>
          {yes.label}
        </Button>
      </div>
    </div>
  ), () => [ref.current])
}
