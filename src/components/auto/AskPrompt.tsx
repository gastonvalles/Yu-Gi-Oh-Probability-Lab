import { useEffect, useRef } from 'react'

import { useLeaving, usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

/** Un botón de una pregunta del núcleo: lo que dice (verbo y objeto) y qué contesta. */
export interface AskChoice {
  label: string
  onSelect: () => void
}

interface AskPromptProps {
  /** La pregunta entera («¿Activás el efecto de Ash Blossom & Joyous Spring?»). */
  text: string
  /** La carta que pregunta (`select_effectyn`) o a la que se responde (una cadena): chica, a la izquierda del texto. Sin ella (`select_yesno`), sólo el texto. */
  card?: { name: string; art: string | null }
  /** La principal, a la derecha: hacerlo («Activar efecto», «Pagar 1000 LP»). Sin ella (una cadena que se contesta tocando la carta que brilla), sólo «No responder». */
  yes?: AskChoice
  /** Lo que no hace nada, sin caja y a la izquierda («No activar»). */
  no: AskChoice
  /** Arriba de todo, chico: qué clase de pregunta es («Efecto que se dispara»). */
  kicker?: string
  /** El lugar de la carta, en una pestaña sobre ella («Campo», «Cementerio»). */
  place?: string
  /** Qué hace el efecto, con la frase de la carta tal cual: cuándo (`when`) y lo que hace (`what`, resaltado). La caja se hace más ancha. */
  effect?: { when: string; what: string }
  /** El atajo a la mesa manual («Seguir en modo manual»), sin caja y a la izquierda, lejos de la principal. */
  manual?: AskChoice
}

/**
 * Una pregunta de sí o no del núcleo de reglas (`select_effectyn`, `select_yesno`) en el medio de la mesa: la pone `PracticeMat` en la ranura `duel.prompt`, centrada en su columna, sin fondo y sin
 * mover nada (la capa deja pasar los toques; sólo la pregunta los recibe), como `PassPrompt`. Hay que contestarla: no se cierra con Escape y, al aparecer, el foco va a la principal (sin desplazar
 * la página; sin principal, el foco no se mueve: se contesta tocando la carta). Contestada, se achica y se funde (la mesa la pone dentro de un `Presence`). Los dos botones dicen qué hacen: nunca «Sí» ni «No».
 * Un efecto que se disparó lleva su contexto (`effectAskText` de `ask-ui.ts`): qué pasó y dónde está la carta en el texto, la pestaña del lugar y la frase del efecto.
 */
export function AskPrompt({ text, card, yes, no, kicker, place, effect, manual }: AskPromptProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const leaving = useLeaving()

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-ask-primary]')?.focus({ preventScroll: true })
  }, [])

  const art = card ? (
    <span className="relative block aspect-[421/614] w-11 shrink-0 overflow-hidden bg-input">
      <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
    </span>
  ) : null
  const pass = (
    <Button variant="tertiary" className="shrink-0" onClick={no.onSelect}>
      {no.label}
    </Button>
  )
  const box = 'rounded-card border border-info bg-card-background text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter'

  // Sin principal (una cadena que se contesta tocando la carta), en una sola fila baja: la carta | el texto | «No responder»; la mesa le da más ancho (`data-prompt-row`).
  // Con contexto (el efecto que se disparó): lo que es arriba, la pestaña del lugar sobre la carta, la frase del efecto debajo de la pregunta y el atajo a la manual a la izquierda.
  return usePresence(!leaving, yes ? (
    <div ref={ref} role="status" data-prompt="ask" {...(effect ? { 'data-prompt-row': '' } : {})} className={cx('grid gap-3 p-4', box)}>
      {kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
      <div className="flex items-center gap-3">
        {place ? (
          <span className="grid shrink-0 justify-items-start gap-1">
            <Badge size="sm" shape="tag">
              {place}
            </Badge>
            {art}
          </span>
        ) : (
          art
        )}
        <div className="grid min-w-0 gap-1">
          <p className="m-0 font-semibold">{text}</p>
          {effect ? (
            <p className="m-0 text-micro text-muted">
              <span className="font-semibold text-warning-soft">{t('auto.ask.what')}</span> “{effect.when ? `${effect.when}: ` : ''}
              <span className="font-semibold text-foreground">{effect.what}</span>”
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {manual ? (
          <Button variant="tertiary" className="shrink-0" onClick={manual.onSelect}>
            {manual.label}
          </Button>
        ) : null}
        <div className="ml-auto flex justify-end gap-2">
          {pass}
          <Button variant="primary" data-ask-primary="" onClick={yes.onSelect}>
            {yes.label}
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div ref={ref} role="status" data-prompt="ask" data-prompt-row="" className={cx('flex items-center gap-3 py-2 pl-2 pr-1', box)}>
      {art}
      <p className="m-0 min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{text}</p>
      {pass}
    </div>
  ), () => [ref.current])
}
