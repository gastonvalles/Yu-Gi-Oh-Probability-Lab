import { CardArt } from '../CardArt'
import { MatPrompt } from '../duel/MatPrompt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

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
}

/**
 * Una pregunta de sí o no del núcleo de reglas (`select_effectyn`, `select_yesno`) en la mesa (`MatPrompt`: la ranura `duel.prompt`, sin velo, minimizable). Lo mínimo para decidir:
 * qué pasó (`kicker`, sin nombres), la carta por su arte con la pestaña de su lugar y «¿Activás el efecto?»; lo que hace la carta está en su detalle. Hay que contestarla: Escape
 * la minimiza y, al aparecer, el foco va a la principal (sin desplazar la página). Una cadena que se puede pasar no va acá: va en `RespondBand`. Los dos botones dicen qué hacen.
 */
export function AskPrompt({ text, card, yes, no, kicker, place, manual }: AskPromptProps) {
  const art = card ? (
    <span className="relative block aspect-[421/614] w-11 shrink-0 overflow-hidden bg-input">
      <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
    </span>
  ) : null

  return (
    <MatPrompt
      kind="ask"
      // Con el atajo a la manual, más ancho: los tres botones en una fila.
      row={Boolean(manual)}
      label={text}
      focus="[data-ask-primary]"
      escape
      head={
        <>
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
            {kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
            <p className="m-0 font-semibold">{text}</p>
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* En el celular no va en el cartel (tres acciones no entran en una fila y tiene que caber arriba de tus monstruos): queda en «Más opciones». */}
        {manual ? (
          <Button variant="tertiary" className="shrink-0 max-[1101px]:hidden" onClick={manual.onSelect}>
            {manual.label}
          </Button>
        ) : null}
        <div className="ml-auto flex justify-end gap-2">
          <Button variant="tertiary" className="shrink-0" onClick={no.onSelect}>
            {no.label}
          </Button>
          <Button variant="primary" data-ask-primary="" onClick={yes.onSelect}>
            {yes.label}
          </Button>
        </div>
      </div>
    </MatPrompt>
  )
}
